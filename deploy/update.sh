#!/usr/bin/env bash
# Обновление сайта на VPS: код с ветки, схема базы, пересборка контейнера.
#
#   bash /opt/vanillacoins/deploy/update.sh
#
# Ветку можно задать переменной: BRANCH=main bash update.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vanillacoins}"
BRANCH="${BRANCH:-claude/minecraft-server-demorgan-16y10o}"
COMPOSE="docker compose"
docker compose version >/dev/null 2>&1 || COMPOSE="docker-compose"

cd "$APP_DIR"

echo "==> Код: ветка $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull origin "$BRANCH"
git --no-pager log -1 --format='    %h %s'

cd "$APP_DIR/deploy"

# Кэш сборки съедает диск быстрее всего: недельной давности слои уже не нужны,
# а без места сборка падает с «no space left on device». Тома и образы
# запущенных контейнеров команда не трогает.
echo "==> Чистка кэша сборки"
docker builder prune -f --filter 'until=168h' >/dev/null || true
df -h / | tail -1

# Схема: db push идёт из сборочной стадии — в рабочем образе нет Prisma CLI.
# Он безопасен и когда менять нечего: просто скажет, что база уже в порядке.
echo "==> Схема базы"
$COMPOSE --env-file .env --profile tools run --rm --build migrator npx prisma db push

echo "==> Сборка и запуск сайта"
$COMPOSE --env-file .env up -d --build web

echo "==> Готово"
$COMPOSE --env-file .env ps web
