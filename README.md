# VanillaCoins

Ванильный Minecraft-сервер без приватов: сервер, сайт с личным кабинетом,
донат-валюта, кейсы, мини-игры и админ-панель.

| Каталог | Что внутри |
|---|---|
| `plugin/` | Серверный плагин VanillaCore (Paper 26.2, Java 25) |
| `web/` | Сайт и админ-панель (Next.js 15, Prisma, PostgreSQL) |
| `deploy/` | docker-compose, Caddy, скрипт установки на VPS |
| `docs/` | [Спецификация](docs/SPEC.md) и [описание плагина](docs/PLUGIN.md) |

## Как это связано

```
Игрок ──/login──► VanillaCore ──HTTPS + X-Server-Token──► Сайт ──► PostgreSQL
                                                            ▲
Игрок ──браузер───────────────────────────────────────────-─┘
```

Плагин не имеет доступа к базе. Вся логика денег, наказаний и прав — на сайте,
плагин остаётся тонким клиентом. Один и тот же аккаунт работает и на сайте, и
в игре.

## Запуск

Сайт на VPS:

```
curl -fsSL https://raw.githubusercontent.com/grapetestbla-oss/vc/claude/minecraft-server-demorgan-16y10o/deploy/install.sh | bash
```

Скрипт сам разберётся, каким видом Compose располагает сервер (плагин
`docker compose`, отдельный `docker-compose` или ничего — тогда доустановит),
и проверит, что A-запись домена указывает сюда. Если запись уже верна, а кэш
резолверов ещё отдаёт старый адрес, проверку можно пропустить:
`FORCE_DOMAIN=1 bash install.sh`.

Скрипт поставит Docker, поднимет PostgreSQL и сайт, создаст схему, загрузит
каталог кейсов и выведет `MC_SERVER_TOKEN` — его нужно вписать в
`plugins/VanillaCore/config.yml` на игровом сервере.

Администратор заводится отдельной командой (или через `ADMIN_*` в `deploy/.env`):

```
cd /opt/vanillacoins/deploy
docker compose --env-file .env --profile tools run --rm \
  -e ADMIN_LOGIN=nick -e ADMIN_EMAIL=mail@example.com -e ADMIN_PASSWORD=... \
  migrator node prisma/create-admin.mjs
```

`migrator` — служебный контейнер со сборочной стадии: в нём полные
`node_modules`, поэтому там работают Prisma CLI и скрипты. Рабочий образ
намеренно лёгкий и CLI-инструментов не содержит. В обычном `up` этот
контейнер не поднимается — только через `--profile tools run`.

Повторный запуск с тем же логином меняет пароль и уровень — так же
восстанавливают доступ.

Плагин: собрать `mvn package` в `plugin/` (нужен JDK 25) и положить jar в
`plugins/`.
