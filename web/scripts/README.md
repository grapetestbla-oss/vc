# Скрипты

## `pglite-server.mjs`

Поднимает PostgreSQL в памяти (PGlite) на порту 5432 — чтобы гонять сайт
локально без Docker. Данные живут только пока процесс запущен.

```
npm i --no-save @electric-sql/pglite @electric-sql/pglite-socket
node scripts/pglite-server.mjs
```

PGlite держит одно подключение за раз, поэтому в `DATABASE_URL` нужны
`?connection_limit=1&pgbouncer=true` — иначе Prisma упрётся в «prepared
statement s0 already exists».

## `e2e.mjs`

Сквозной прогон API против запущенного сайта: регистрация, вход в игре, 2FA,
наказания, репорты, промо- и бонус-коды, кейсы, мини-игры, разграничение прав.

```
BASE=http://127.0.0.1:3000 MC_SERVER_TOKEN=... node scripts/e2e.mjs
```

Требует чистую базу и `BOOTSTRAP_ADMIN_LOGIN=Steve` у запущенного сайта.

## `screenshots.mjs`

Снимает страницы сайта и панели через Chromium (playwright-core) — быстрый
способ проверить вёрстку после правок.

```
BASE=http://127.0.0.1:3000 OUT=./shots node scripts/screenshots.mjs
```

Регистрирует аккаунт `Steve`, поэтому запускать против чистой базы с
`BOOTSTRAP_ADMIN_LOGIN=Steve`.

## `check-reveal.mjs`

Проверяет, что все блоки с появлением по скроллу (`.reveal`) действительно
проявляются: прокручивает главную до конца и сравнивает число блоков с числом
проявившихся. Полезно после правок анимаций — на статичном скриншоте такой
блок выглядит как пустое место, и баг легко пропустить.

```
BASE=http://127.0.0.1:3000 node scripts/check-reveal.mjs
```
