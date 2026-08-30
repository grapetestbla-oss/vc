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
echo "==> Чистка перед сборкой"
# Кэш сборки и брошенные образы съедают диск быстрее всего, а без места
# сборка падает на «no space left on device» — вместе с ней падает и Postgres.
docker builder prune -af >/dev/null || true
docker image prune -f >/dev/null || true
# Логи контейнеров докер по умолчанию не ротирует: за неделю это гигабайты.
truncate -s 0 /var/lib/docker/containers/*/*-json.log 2>/dev/null || true
journalctl --vacuum-size=200M >/dev/null 2>&1 || true

FREE_MB=$(df -Pm / | awk 'NR==2 {print $4}')
echo "    свободно на диске: ${FREE_MB} МБ"
if [ "$FREE_MB" -lt 2500 ]; then
  echo "    мало места для сборки — убираю все неиспользуемые образы"
  # Тома не трогаем: в них база. Без --volumes это безопасно.
  docker image prune -af >/dev/null || true
  FREE_MB=$(df -Pm / | awk 'NR==2 {print $4}')
  echo "    стало: ${FREE_MB} МБ"
fi
if [ "$FREE_MB" -lt 1500 ]; then
  echo "    Меньше 1.5 ГБ свободно: сборка почти наверняка упадёт, а Postgres"
  echo "    остановится на записи. Освободите место и повторите."
  exit 1
fi

# Схема: db push идёт из сборочной стадии — в рабочем образе нет Prisma CLI.
# Он безопасен и когда менять нечего: просто скажет, что база уже в порядке.
echo "==> Схема базы"
$COMPOSE --env-file .env --profile tools run --rm --build migrator npx prisma db push

echo "==> Сборка и запуск сайта"
$COMPOSE --env-file .env up -d --build web

# Старый образ сайта после пересборки уже не нужен и держит гигабайт.
docker image prune -f >/dev/null || true

# Образ мигратора — это стадия builder со всеми зависимостями и исходниками,
# полтора-два гигабайта. Между деплоями он не нужен, а на диске в 10 ГБ это
# разница между «работает» и «Postgres упал на записи». Перенести миграцию в
# рабочий образ нельзя: там нет зависимостей Prisma CLI, только клиент.
MIGRATOR_IMAGE=$($COMPOSE --env-file .env --profile tools images -q migrator 2>/dev/null | head -1)
if [ -n "${MIGRATOR_IMAGE:-}" ]; then
  docker image rm -f "$MIGRATOR_IMAGE" >/dev/null 2>&1 || true
fi
# Кэш сборки между деплоями тоже только занимает место: следующая сборка будет
# дольше, зато базе есть куда писать.
docker builder prune -af >/dev/null 2>&1 || true

echo "==> Готово"
$COMPOSE --env-file .env ps web
df -h / | tail -1
