#!/usr/bin/env bash
# Технический сайт tech.vanillacraft.click: обновление стенда.
#
#   bash /opt/vanillacoins/deploy/tech.sh              # текущая ветка репозитория
#   BRANCH=имя-ветки bash /opt/vanillacoins/deploy/tech.sh
#
# Боевой стек эта команда не трогает: у стенда своё имя проекта, свой контейнер
# и своя база. Обновление боевого сайта — по-прежнему update.sh.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vanillacoins}"
BRANCH="${BRANCH:-}"
COMPOSE="docker compose"
docker compose version >/dev/null 2>&1 || COMPOSE="docker-compose"
PROJECT="vc-tech"
FILE="docker-compose.tech.yml"

cd "$APP_DIR"

if [ -n "$BRANCH" ]; then
  echo "==> Код: ветка $BRANCH"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
fi
git --no-pager log -1 --format='    %h %s'

cd "$APP_DIR/deploy"

echo "==> Чистка перед сборкой"
docker builder prune -af >/dev/null || true
docker image prune -f >/dev/null || true

FREE_MB=$(df -Pm / | awk 'NR==2 {print $4}')
echo "    свободно на диске: ${FREE_MB} МБ"
if [ "$FREE_MB" -lt 1500 ]; then
  echo "    Меньше 1.5 ГБ свободно: сборка почти наверняка упадёт. Освободите место."
  exit 1
fi

# База стенда отдельная и может ещё не существовать. Создаём её в том же
# сервере Postgres: своего контейнера базы у стенда нет ради экономии памяти.
echo "==> База стенда"
$COMPOSE --env-file .env exec -T postgres \
  psql -U vanilla -d vanilla -tc "SELECT 1 FROM pg_database WHERE datname = 'vanilla_tech'" \
  | grep -q 1 || $COMPOSE --env-file .env exec -T postgres createdb -U vanilla vanilla_tech

echo "==> Схема и каталог стенда"
$COMPOSE -p "$PROJECT" --env-file .env -f "$FILE" --profile tools run --rm --build tech-migrator \
  sh -c "npx prisma db push && node prisma/seed.mjs"

echo "==> Сборка и запуск стенда"
$COMPOSE -p "$PROJECT" --env-file .env -f "$FILE" up -d --build tech

MIGRATOR_IMAGE=$($COMPOSE -p "$PROJECT" --env-file .env -f "$FILE" --profile tools images -q tech-migrator 2>/dev/null | head -1)
if [ -n "${MIGRATOR_IMAGE:-}" ]; then
  docker image rm -f "$MIGRATOR_IMAGE" >/dev/null 2>&1 || true
fi
docker image prune -f >/dev/null || true
docker builder prune -af >/dev/null 2>&1 || true

echo "==> Готово"
$COMPOSE -p "$PROJECT" --env-file .env -f "$FILE" ps tech
df -h / | tail -1
