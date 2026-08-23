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

Скрипт поставит Docker, поднимет PostgreSQL и сайт, создаст схему, загрузит
каталог кейсов и выведет `MC_SERVER_TOKEN` — его нужно вписать в
`plugins/VanillaCore/config.yml` на игровом сервере.

Администратор заводится отдельной командой (или через `ADMIN_*` в `deploy/.env`):

```
cd /opt/vanillacoins/deploy
docker compose --env-file .env run --rm \
  -e ADMIN_LOGIN=nick -e ADMIN_EMAIL=mail@example.com -e ADMIN_PASSWORD=... \
  web node prisma/create-admin.mjs
```

Повторный запуск с тем же логином меняет пароль и уровень — так же
восстанавливают доступ.

Плагин: собрать `mvn package` в `plugin/` (нужен JDK 25) и положить jar в
`plugins/`.
