#!/usr/bin/env bash
# Освобождение места на VPS. Запускать, когда диск кончается:
#
#   bash /opt/vanillacoins/deploy/cleanup.sh
#
# Что удаляется — только то, что пересоздаётся само: кэш сборки, неиспользуемые
# образы, логи контейнеров, журнал systemd, кэш apt и старые логи в /var/log.
#
# Чего скрипт не делает НИКОГДА: не трогает тома докера. `docker system prune
# --volumes` и `docker volume prune` на этой машине запускать нельзя — в томе
# pgdata лежит база сайта, и она не восстановится.
set -u

FREE_BEFORE=$(df -Pm / | awk 'NR==2 {print $4}')
echo "== Свободно до уборки: ${FREE_BEFORE} МБ"

echo
echo "==> Кэш сборки docker"
docker builder prune -af 2>/dev/null | tail -1 || echo "    docker недоступен"

echo "==> Образы, на которых никто не висит"
docker image prune -af 2>/dev/null | tail -1 || true

echo "==> Остановленные контейнеры"
docker container prune -f 2>/dev/null | tail -1 || true

echo "==> Сети без контейнеров"
docker network prune -f 2>/dev/null | tail -1 || true

echo "==> Логи контейнеров"
# Файлы не удаляем, а обнуляем: докер держит их открытыми, и удалённый файл
# продолжил бы занимать место до перезапуска контейнера.
truncate -s 0 /var/lib/docker/containers/*/*-json.log 2>/dev/null || true

echo "==> Журнал systemd"
journalctl --vacuum-size=100M 2>/dev/null | tail -1 || true

echo "==> Кэш пакетов"
apt-get clean 2>/dev/null || true

echo "==> Старые логи в /var/log"
find /var/log -type f \( -name '*.gz' -o -name '*.[0-9]' -o -name '*.old' \) -delete 2>/dev/null || true

FREE_AFTER=$(df -Pm / | awk 'NR==2 {print $4}')
echo
echo "== Свободно после уборки: ${FREE_AFTER} МБ (освободили $((FREE_AFTER - FREE_BEFORE)) МБ)"
df -h /

if [ "$FREE_AFTER" -lt 2500 ]; then
  echo
  echo "Меньше 2.5 ГБ — на сборку сайта этого впритык. Что смотреть дальше:"
  echo "  bash /opt/vanillacoins/deploy/diskcheck.sh"
  echo "Если чистить больше нечего — диску 10 ГБ мало, пора расширять тариф."
fi
