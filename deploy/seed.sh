#!/usr/bin/env bash
# Каталог на VPS: косметика, коллекции, кейсы и товары магазина.
#
#   bash /opt/vanillacoins/deploy/seed.sh
#
# Отдельно от update.sh, потому что каталог правится реже схемы, а часть его
# значений можно менять и в панели: лишний прогон вернул бы туда то, что
# записано в репозитории.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vanillacoins}"
COMPOSE="docker compose"
docker compose version >/dev/null 2>&1 || COMPOSE="docker-compose"

cd "$APP_DIR/deploy"

# --build обязателен: update.sh удаляет образ мигратора за собой, и без сборки
# запускать было бы нечего.
echo "==> Каталог"
$COMPOSE --env-file .env --profile tools run --rm --build migrator node prisma/seed.mjs

# Образ мигратора — это сборочная стадия со всеми зависимостями, полтора-два
# гигабайта. Между выкатками он не нужен, а места на диске мало.
MIGRATOR_IMAGE=$($COMPOSE --env-file .env --profile tools images -q migrator 2>/dev/null | head -1)
if [ -n "${MIGRATOR_IMAGE:-}" ]; then
  docker image rm -f "$MIGRATOR_IMAGE" >/dev/null 2>&1 || true
fi
docker builder prune -af >/dev/null 2>&1 || true

echo "==> Готово"
