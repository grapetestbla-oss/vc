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

# Спрашиваем два независимых резолвера и пробуем несколько раз: записи только
# что могли поменять, и один из кэшей ещё отдаёт старое значение.
collect_ips() {
  {
    curl -s --max-time 10 "https://dns.google/resolve?name=${DOMAIN}&type=A"
    curl -s --max-time 10 -H 'accept: application/dns-json' \
      "https://cloudflare-dns.com/dns-query?name=${DOMAIN}&type=A"
  } | grep -oE '"data":"[0-9.]+"' | cut -d'"' -f4 | sort -u
}

resolved=""
for attempt in 1 2 3; do
  resolved=$(collect_ips)
  if echo "$resolved" | grep -qx "$server_ip"; then
    echo "IP сервера:      $server_ip"
    echo "Домен указывает: $(echo "$resolved" | tr '\n' ' ')"
    echo "OK: домен указывает на этот сервер."
    exit 0
  fi
  [ "$attempt" -lt 3 ] && sleep 5
done

echo "IP сервера:      $server_ip"
echo "Домен указывает: ${resolved:-<нет A-записи>}"
echo
echo "Домен пока указывает не сюда. Сертификат Let's Encrypt получить не выйдет."
echo "Сайт поднимется по адресу http://${server_ip} без HTTPS."
echo "ВАЖНО: не включайте авторизацию игроков, пока нет HTTPS — пароли пойдут"
echo "по сети открытым текстом. Почините A-запись и перезапустите:"
echo "  cd /opt/vanillacoins/deploy && bash install.sh"
echo
echo "Если запись уже верна, а кэш резолверов ещё отдаёт старое значение,"
echo "можно пропустить проверку: FORCE_DOMAIN=1 bash install.sh"
exit 1
