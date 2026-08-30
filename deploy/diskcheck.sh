#!/usr/bin/env bash
# Что занимает диск на VPS. Только смотрит, ничего не удаляет.
#
#   bash /opt/vanillacoins/deploy/diskcheck.sh
set -u

echo "== Диск"
df -h /

echo
echo "== Docker"
docker system df 2>/dev/null || echo "docker недоступен"

echo
echo "== Логи контейнеров (json-file)"
du -sh /var/lib/docker/containers/*/*-json.log 2>/dev/null | sort -h | tail -5
du -ch /var/lib/docker/containers/*/*-json.log 2>/dev/null | tail -1

echo
echo "== Крупные каталоги в корне"
du -xh --max-depth=1 / 2>/dev/null | sort -h | tail -10

echo
echo "== Внутри /var/lib/docker"
du -xh --max-depth=1 /var/lib/docker 2>/dev/null | sort -h | tail -8

echo
echo "== Журнал systemd"
journalctl --disk-usage 2>/dev/null || true
