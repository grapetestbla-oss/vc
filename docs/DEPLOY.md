# Обновление сайта и сервера

Всё, что нужно набрать. Команды однострочные — именно склейка нескольких строк
в одну ломала прошлые деплои.

## 1. Переменные окружения

Нужны только при первой настройке новых возможностей. Файл `/opt/vanillacoins/deploy/.env`,
после правки — обычный деплой из шага 3.

```
nano /opt/vanillacoins/deploy/.env
```

Что дописать (значения свои):

```
TELEGRAM_BOT_TOKEN=токен от @BotFather
TELEGRAM_BOT_USERNAME=VanillaCraftx_bot
TELEGRAM_WEBHOOK_SECRET=любая длинная строка, придумайте сами
TELEGRAM_CHAT_ID=-1003907771050
TOPMC_SERVER_ID=27567
TOPMC_KEY=ключ из кабинета мониторинга
```

Необязательное, у всего есть значения по умолчанию:

```
VOTE_REWARD_VC=200          # за голос
VOTE_STREAK_BONUS_VC=10     # за каждый день серии сверх первого
VOTE_STREAK_CAP=30          # дальше серия не оплачивается
VOTE_MAX_AGE_HOURS=48       # голоса старше не оплачиваются
PURGE_DROP_PERCENT=50       # сколько процентов баланса стоит смерть в судную ночь
```

## 2. Место на диске

Если сборка падала на нехватке места — сначала уборка:

```
bash /opt/vanillacoins/deploy/cleanup.sh
```

Посмотреть, кто съел диск, ничего не удаляя:

```
bash /opt/vanillacoins/deploy/diskcheck.sh
```

## 3. Обновление сайта

Одна команда: код с ветки, чистка, миграции базы, пересборка, уборка за собой.

```
bash /opt/vanillacoins/deploy/update.sh
```

Другая ветка — через переменную:

```
BRANCH=main bash /opt/vanillacoins/deploy/update.sh
```

Проверить, что поднялось:

```
docker compose --env-file /opt/vanillacoins/deploy/.env -f /opt/vanillacoins/deploy/docker-compose.yml ps
```

Посмотреть логи сайта, если что-то не так:

```
docker compose --env-file /opt/vanillacoins/deploy/.env -f /opt/vanillacoins/deploy/docker-compose.yml logs --tail=100 web
```

## 4. Вебхук Telegram

Один раз после того, как задан `TELEGRAM_WEBHOOK_SECRET` и сайт задеплоен.

Значения достаём из файла, а не через `source`: `source` выполняет файл как
скрипт, и ключ со знаком `&` внутри (такие есть у касс) рвёт строку — часть
значения уходит в фоновую задачу, остаток выполняется как команда, а переменная
остаётся пустой. Docker Compose читает тот же файл своим разборщиком, поэтому
ему такие значения не мешают — ломается только `source`.

```
cd /opt/vanillacoins/deploy && TGTOKEN=$(grep -m1 '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2-) && TGSECRET=$(grep -m1 '^TELEGRAM_WEBHOOK_SECRET=' .env | cut -d= -f2-) && curl -sS -F "url=https://vanillacraft.click/api/tg/webhook" -F "secret_token=$TGSECRET" -F 'allowed_updates=["message","chat_join_request"]' "https://api.telegram.org/bot$TGTOKEN/setWebhook"
```

`allowed_updates` перечислен явно: без `chat_join_request` бот не увидит заявок
на вступление в группу. Ему также нужно право «Добавлять участников».

Проверить, что Telegram доволен:

```
cd /opt/vanillacoins/deploy && TGTOKEN=$(grep -m1 '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2-) && curl -sS "https://api.telegram.org/bot$TGTOKEN/getWebhookInfo"
```

В ответе не должно быть `last_error_message`. Главная проверка — написать боту
`/start`: если он ответил, секрет совпал.

## 5. Игровой сервер

Плагин обновляется только при остановленном сервере: Java читает классы из jar
лениво, и подменённый на ходу файл ломает уже работающий процесс — игроки видят
«unexpected error» на командах.

Порядок в панели `mgr.bisquit.host`: остановить сервер → заменить
`plugins/VanillaCore-1.0.0.jar` → запустить.

Остановку проверяем по `uptime`, а не по полю `state`. Во время долгой паузы
(например, десятисекундного зависания watchdog) панель успевает показать
`state: offline` у работающего сервера — на этом уже один раз попались и
залили jar под живой процесс. Растущий `uptime` в `resources` означает, что
сервер не останавливался, чем бы ни было `state`.

Сайт обновляем **до** запуска сервера: плагин при старте идёт за новыми
маршрутами API, и на старой сборке сайта они ответят 404.

## Чего делать нельзя

`docker system prune --volumes` и `docker volume prune` на этой машине сносят
том `pgdata` вместе с базой сайта. Скрипты деплоя тома не трогают никогда.
