#!/usr/bin/env bash
# Установка сайта VanillaCoins на чистый VPS (Debian/Ubuntu).
# Запускать от root:  bash install.sh
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

echo "==> Код"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
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
ENV
fi

echo "==> Проверка DNS"
set +u
source .env
set -u
if [ -n "${SITE_DOMAIN:-}" ] && bash check-dns.sh "$SITE_DOMAIN"; then
  cp Caddyfile.domain Caddyfile
  SITE_MODE="https://$SITE_DOMAIN"
else
  cp Caddyfile.ip Caddyfile
  SITE_MODE="http://$(curl -s --max-time 10 https://api.ipify.org || echo IP)"
  echo "Работаем по IP без HTTPS до починки DNS."
fi

echo "==> Сборка и запуск"
docker compose --env-file .env up -d --build

echo "==> Схема базы"
docker compose --env-file .env run --rm web npx prisma db push
docker compose --env-file .env run --rm web npx tsx prisma/seed.ts || true

echo
echo "Готово. Токен для плагина (config.yml → api.token):"
grep MC_SERVER_TOKEN .env
echo
echo "Сайт: $SITE_MODE"
echo "Впишите свой ник в BOOTSTRAP_ADMIN_LOGIN в deploy/.env, перезапустите"
echo "(docker compose --env-file .env up -d) и зарегистрируйтесь — аккаунт"
echo "сразу получит 5 уровень админки. После этого уберите переменную."
