#!/usr/bin/env bash
# Установка сайта VanillaCoins на VPS (Debian/Ubuntu).
# Запускать от root:  bash install.sh
#
# Переменные:
#   FORCE_DOMAIN=1  — не проверять DNS, сразу поднимать домен с сертификатом
#   BRANCH=...      — другая ветка репозитория
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/grapetestbla-oss/vc.git}"
BRANCH="${BRANCH:-claude/minecraft-server-demorgan-16y10o}"
APP_DIR="${APP_DIR:-/opt/vanillacoins}"

echo "==> Пакеты"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl >/dev/null

if ! command -v docker >/dev/null; then
  echo "==> Docker"
  curl -fsSL https://get.docker.com | sh
fi

# Compose бывает трёх видов: плагин (docker compose), отдельный бинарник
# (docker-compose) и вовсе отсутствует — на серверах, где Docker ставили из
# репозитория дистрибутива. Разбираемся, что здесь.
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "==> Docker Compose"
  apt-get install -y -qq docker-compose-plugin >/dev/null 2>&1 || true

  if ! docker compose version >/dev/null 2>&1; then
    # В репозитории дистрибутива плагина нет — кладём официальный бинарник.
    plugin_dir=/usr/local/lib/docker/cli-plugins
    mkdir -p "$plugin_dir"
    arch=$(uname -m)
    curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${arch}" \
      -o "$plugin_dir/docker-compose"
    chmod +x "$plugin_dir/docker-compose"
  fi

  if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
  else
    echo "Не удалось поставить Docker Compose. Поставьте вручную:"
    echo "  curl -fsSL https://get.docker.com | sh"
    exit 1
  fi
fi
echo "Compose: $($COMPOSE version | head -1)"

echo "==> Код"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# Скрипт только что обновил сам себя, а bash дочитывает файл по мере
# выполнения — дальше пошёл бы кусок старого кода вперемешку с новым.
# Перезапускаемся уже из свежей версии.
if [ "${INSTALLER_RELOADED:-0}" != "1" ]; then
  export INSTALLER_RELOADED=1
  exec bash "$APP_DIR/deploy/install.sh" "$@"
fi

cd "$APP_DIR/deploy"

if [ ! -f .env ]; then
  echo "==> Генерирую секреты в deploy/.env"
  cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
MC_SERVER_TOKEN=$(openssl rand -hex 32)
# Домен сайта — Caddy получит сертификат Let's Encrypt автоматически.
SITE_DOMAIN=vanillacraft.click
# IP игрового сервера, которому разрешён доступ к /api/mc/*
MC_SERVER_IP=5.83.140.208/32
# Логин, который получит 5 уровень админки при регистрации на сайте.
# Впишите свой ник ДО первой регистрации, потом уберите отсюда.
BOOTSTRAP_ADMIN_LOGIN=
# Либо заведите администратора сразу — аккаунт создастся при установке.
# Пароль после первого входа лучше сменить.
ADMIN_LOGIN=
ADMIN_EMAIL=
ADMIN_PASSWORD=
ADMIN_LEVEL=5
ENV
fi

echo "==> Проверка DNS"
set +u
source .env
set -u

if [ -n "${SITE_DOMAIN:-}" ] && { [ "${FORCE_DOMAIN:-0}" = "1" ] || bash check-dns.sh "$SITE_DOMAIN"; }; then
  cp Caddyfile.domain Caddyfile
  # www добавляем, только если на него есть A-запись: иначе Caddy будет
  # бесконечно просить сертификат для несуществующего имени.
  if bash check-dns.sh "www.$SITE_DOMAIN" >/dev/null 2>&1; then
    cat Caddyfile.www >> Caddyfile
    echo "www.$SITE_DOMAIN тоже указывает сюда — редирект включён."
  else
    echo "A-записи для www.$SITE_DOMAIN нет — блок www пропущен."
  fi
  SITE_MODE="https://$SITE_DOMAIN"
else
  cp Caddyfile.ip Caddyfile
  SITE_MODE="http://$(curl -s --max-time 10 https://api.ipify.org || echo IP)"
  echo "Работаем по IP без HTTPS до починки DNS."
fi

echo "==> Сборка и запуск"
$COMPOSE --env-file .env up -d --build
# Caddyfile примонтирован файлом: compose не видит его изменений и оставляет
# контейнер со старым конфигом. Пересоздаём принудительно, иначе смена режима
# (IP → домен) не применится и сертификат так и не будет запрошен.
$COMPOSE --env-file .env up -d --force-recreate caddy

echo "==> Схема базы"
# Prisma CLI тянет свои зависимости, которых нет в лёгком рабочем образе,
# поэтому схему и каталог накатываем из сборочной стадии.
$COMPOSE --env-file .env --profile tools run --rm migrator npx prisma db push
$COMPOSE --env-file .env --profile tools run --rm migrator node prisma/seed.mjs

# Администратора заводим, только если данные заданы в .env.
if [ -n "${ADMIN_LOGIN:-}" ] && [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  echo "==> Администратор $ADMIN_LOGIN"
  $COMPOSE --env-file .env --profile tools run --rm \
    -e ADMIN_LOGIN="$ADMIN_LOGIN" \
    -e ADMIN_EMAIL="$ADMIN_EMAIL" \
    -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    -e ADMIN_LEVEL="${ADMIN_LEVEL:-5}" \
    migrator node prisma/create-admin.mjs
fi

echo
echo "Готово. Токен для плагина (config.yml → api.token):"
grep MC_SERVER_TOKEN .env
echo
echo "Сайт: $SITE_MODE"
echo "Администратор заводится командой:"
echo "  cd $APP_DIR/deploy && $COMPOSE --env-file .env --profile tools run --rm \\"
echo "    -e ADMIN_LOGIN=ник -e ADMIN_EMAIL=почта -e ADMIN_PASSWORD=пароль \\"
echo "    migrator node prisma/create-admin.mjs"
