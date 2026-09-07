#!/usr/bin/env bash
# Агент выкатки. Спрашивает сайт, не поставили ли задачу в панели, и если
# поставили — выкатывает боевой сайт и отчитывается.
#
# Ставится в cron раз в минуту:
#   * * * * * /opt/vanillacoins/deploy/release-agent.sh >> /var/log/vc-release.log 2>&1
#
# Работа идёт в эту сторону, а не наоборот: контейнеру сайта не нужен доступ ни
# к docker, ни к git, ни к самому хосту. Дыра в сайте не превращается в
# выполнение команд на сервере — максимум в лишнюю выкатку той же ветки.
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/vanillacoins}"
# Стучимся в сайт мимо Caddy: агент живёт на той же машине, и наружу этот
# маршрут закрыт.
SITE="${RELEASE_SITE:-http://127.0.0.1:3000}"
LOCK="/tmp/vc-release.lock"

cd "$APP_DIR/deploy"

TOKEN=$(grep -m1 '^DEPLOY_AGENT_TOKEN=' .env | cut -d= -f2-)
if [ -z "${TOKEN:-}" ]; then
  echo "$(date '+%F %T') нет DEPLOY_AGENT_TOKEN в .env — агент не настроен"
  exit 0
fi

# Одна выкатка за раз: cron запускается раз в минуту, а сборка идёт дольше.
exec 9>"$LOCK"
flock -n 9 || exit 0

TASK=$(curl -sS -m 20 -X POST -H "X-Deploy-Token: $TOKEN" "$SITE/api/deploy/next" || echo '')
case "$TASK" in
  *'"release":null'*|'') exit 0 ;;
esac

ID=$(printf '%s' "$TASK" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
BRANCH=$(printf '%s' "$TASK" | sed -n 's/.*"branch":"\([^"]*\)".*/\1/p')
SEED=$(printf '%s' "$TASK" | grep -o '"seedCatalogue":true' || true)

if [ -z "$ID" ] || [ -z "$BRANCH" ]; then
  echo "$(date '+%F %T') не разобрал ответ сайта: $TASK"
  exit 0
fi

echo "$(date '+%F %T') выкатка $ID, ветка $BRANCH"
OUT=$(mktemp)
OK=true

BRANCH="$BRANCH" bash "$APP_DIR/deploy/update.sh" >>"$OUT" 2>&1 || OK=false

if [ "$OK" = true ] && [ -n "$SEED" ]; then
  bash "$APP_DIR/deploy/seed.sh" >>"$OUT" 2>&1 || OK=false
fi

# Отчёт отправляем в любом случае: без него задача повиснет в «идёт», и
# следующую кнопка не примет.
LOG=$(tail -c 6000 "$OUT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
curl -sS -m 20 -X POST -H "X-Deploy-Token: $TOKEN" -H "Content-Type: application/json" \
  -d "{\"id\":\"$ID\",\"ok\":$OK,\"log\":$LOG}" "$SITE/api/deploy/report" >/dev/null || \
  echo "$(date '+%F %T') не смог отчитаться о выкатке $ID"

rm -f "$OUT"
echo "$(date '+%F %T') выкатка $ID завершена, успех: $OK"
