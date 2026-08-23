#!/usr/bin/env bash
# Проверяет, что домен указывает на этот сервер.
# Caddy запрашивает сертификат у Let's Encrypt, а там лимит на неудачные
# проверки — 5 в час на домен. Пара неверных запусков, и выпуск сертификата
# будет заблокирован на час, уже после того как DNS почините.
set -u

DOMAIN="${1:-}"
[ -z "$DOMAIN" ] && { echo "использование: check-dns.sh <домен>"; exit 2; }

server_ip=$(curl -s --max-time 10 https://api.ipify.org || echo "")
[ -z "$server_ip" ] && { echo "не удалось определить внешний IP сервера"; exit 2; }

resolved=$(curl -s --max-time 10 "https://dns.google/resolve?name=${DOMAIN}&type=A" \
  | grep -o '"data":"[0-9.]*"' | head -1 | cut -d'"' -f4)

echo "IP сервера:      $server_ip"
echo "Домен указывает: ${resolved:-<нет A-записи>}"

if [ "$resolved" = "$server_ip" ]; then
  echo "OK: домен указывает на этот сервер."
  exit 0
fi

echo
echo "Домен пока указывает не сюда. Сертификат Let's Encrypt получить не выйдет."
echo "Сайт поднимется по адресу http://${server_ip} без HTTPS."
echo "ВАЖНО: не включайте авторизацию игроков, пока нет HTTPS — пароли пойдут"
echo "по сети открытым текстом. Почините A-запись и перезапустите:"
echo "  cd /opt/vanillacoins/deploy && bash install.sh"
exit 1
