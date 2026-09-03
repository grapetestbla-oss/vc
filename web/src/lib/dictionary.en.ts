/**
 * Английский словарь сайта. Ключ — русская строка из вёрстки: чего здесь нет,
 * то и по-английски покажется по-русски, а не пропадёт. Панель администрации
 * не переводится — она только для персонала.
 */
export const EN: Record<string, string> = {
  // ─────────────────────────── шапка и подвал ───────────────────────────
  "Новости": "News",
  "Розыгрыши": "Giveaways",
  "Кейсы": "Cases",
  "Магазин": "Shop",
  "Коллекция": "Collection",
  "Игры": "Games",
  "Партнёрам": "Partners",
  "Правила": "Rules",
  "Панель": "Panel",
  "Войти": "Log in",
  "Регистрация": "Sign up",
  "Выйти": "Log out",
  "Меню": "Menu",
  "Пополнить": "Top up",
  "Пополнение": "Top up",
  "Личный кабинет": "Account",
  "Разбан": "Unban",
  "Поддержка": "Support",
  "Соглашение": "Terms",
  "Конфиденциальность": "Privacy",

  // ────────────────────────────── главная ───────────────────────────────
  "Ванилла,": "Vanilla,",
  "какой она была": "the way it was",
  "Чистое выживание без приватов и китов за донат. Нарушил — идёшь на исправительные работы, а не в бан-лист.":
    "Pure survival with no land claims and no pay-to-win kits. Break a rule and you do hard labour instead of landing on a ban list.",
  "Начать играть": "Start playing",
  "Что нового": "What's new",
  "Игроков": "Players",
  "Онлайн сейчас": "Online now",
  "Новых за сутки": "New in 24 hours",
  "Отрабатывают срок": "Serving time",
  "Как здесь устроено": "How it works",
  "Деморган вместо бана": "Hard labour instead of a ban",
  "За мелкое нарушение вы не теряете прогресс — отрабатываете срок в шахте. Просто ждать долго: минута срока стоит десяти реальных. Быстрее — брать наряды у прораба.":
    "A minor offence costs you no progress — you serve your time in the mine. Waiting it out is slow: a minute of the sentence takes ten real ones. Taking jobs from the foreman is faster.",
  "Никаких приватов": "No land claims",
  "Мир общий и настоящий. Порядок держат админы, откат гриферства и запись каждого действия, а не таблички «territory claimed».":
    "One real shared world. Order is kept by admins, griefing rollbacks and a log of every action — not by \"territory claimed\" signs.",
  "Донат без преимущества": "Donations give no advantage",
  "VanillaCoins тратятся на косметику и кейсы. Купить алмазы, элитру или киты нельзя — ванилла остаётся ваниллой.":
    "VanillaCoins buy cosmetics and cases. Diamonds, elytra and kits are not for sale — vanilla stays vanilla.",
  "все новости": "all news",
  "Аккаунт один — для сайта и игры": "One account for the site and the game",
  "Зарегистрируйтесь, зайдите на сервер под тем же ником и введите пароль. С нового устройства сервер спросит код из личного кабинета.":
    "Sign up, join the server with the same nickname and enter your password. From a new device the server will ask for the code from your account page.",
  "Создать аккаунт": "Create an account",

  // ─────────────────────────────── правила ──────────────────────────────
  "Коротко и без юридического тумана": "Short, with no legal fog",
  "Запрещено": "Not allowed",
  "Читы, макросы и любые модификации клиента, дающие преимущество.":
    "Cheats, macros and any client mods that give an advantage.",
  "Гриферство и воровство: мелкое — деморган, масштабное — бан.":
    "Griefing and theft: minor cases mean hard labour, large ones mean a ban.",
  "Оскорбления, разжигание, реклама сторонних проектов.":
    "Insults, hate speech and advertising other projects.",
  "Обход наказания с другого аккаунта — бан обоих.":
    "Evading a punishment on another account gets both accounts banned.",
  "Отказ пройти проверку по команде /check приравнивается к признанию.":
    "Refusing a /check screen share counts as an admission.",
  "Наказания": "Punishments",
  "Деморган: исправительные работы. Минута срока идёт десять реальных минут и только пока вы онлайн — зато каждый наряд у прораба снимает минуту.":
    "Hard labour: corrective work. A minute of the sentence takes ten real minutes and only ticks while you are online — but every job from the foreman removes a minute.",
  "Варн: действует 7 дней. Два активных варна — автоматический бан на 5 дней.":
    "Warning: lasts 7 days. Two active warnings mean an automatic 5-day ban.",
  "Бан: закрывает вход по аккаунту и адресу на указанный срок.":
    "Ban: blocks the account and the address for the stated period.",
  "Донат": "Donations",
  "VanillaCoins не выводятся в деньги и не передаются между игроками.":
    "VanillaCoins cannot be cashed out or transferred between players.",
  "За деньги продаётся только косметика и кейсы с косметикой.":
    "Only cosmetics and cosmetic cases are sold for money.",
  "Игрового преимущества за деньги на сервере нет и не будет.":
    "There is no pay-to-win on this server, and there never will be.",

  // ────────────────────────── мини-игры и тикеты ────────────────────────
  "Внутренняя валюта, без вывода": "In-game currency, no cash-out",
  "Мини-игры": "Mini-games",
  "Раунд общий и идёт каждые 30 секунд. Ставка — от {min} VC и до всего баланса, потолка и перерывов нет. Средняя выплата колеса — x{wheel}, возврат в краше — {rtp}%. VanillaCoins не выводятся в деньги и не передаются между игроками.":
    "Every round is shared and starts every 30 seconds. Bets run from {min} VC up to your whole balance, with no cap and no cooldowns. The wheel pays x{wheel} on average, crash returns {rtp}%. VanillaCoins cannot be cashed out or transferred between players.",
  "Рулетка": "Roulette",
  "41 сектор от x2 до x10. Колесо крутится каждые 30 секунд, множитель один на всех.":
    "41 sectors from x2 to x10. The wheel spins every 30 seconds and everyone shares the multiplier.",
  "Краш": "Crash",
  "Назовите точку вывода заранее — заберёте выигрыш, если ракета до неё дотянет.":
    "Name your cash-out point up front — you win if the rocket reaches it.",
  "Играть": "Play",
  "Обращения": "Support tickets",
  "Вопросы по аккаунту, пополнению, покупкам и работе сервера. Отвечает главная администрация — ответ появится здесь же, в переписке.":
    "Questions about your account, top-ups, purchases and the server itself. The chief administration answers right here in the thread.",
  "Обращений пока нет.": "No tickets yet.",

  // ─────────────────────────────── магазин ──────────────────────────────
  "Баланс: {n} VC": "Balance: {n} VC",
  "Магазин за VanillaCoins": "The VanillaCoins shop",
  "Здесь продаются удобства, а не преимущество: ни оружия, ни ресурсов, ни защиты в бою. Всё покупается за VC и работает прямо в игре — команды включаются сразу после покупки.":
    "What is sold here is convenience, not advantage: no weapons, no resources, no protection in a fight. Everything costs VC and works in game — commands unlock right after the purchase.",
  "Перемещение": "Travel",
  "Удобства": "Convenience",
  "Страховка": "Insurance",
  "Войдите, чтобы купить": "Log in to buy",
  "Нужен уровень {n}": "Requires level {n}",
  "Уже куплено навсегда": "Already owned permanently",
  "Навсегда": "Permanent",
  "{n} использований за покупку": "{n} uses per purchase",
  "у вас осталось {n}": "you have {n} left",
  "куплено": "owned",
  "Не хватает VC?": "Short on VC?",
  "Пополните баланс": "Top up your balance",
  "или откройте бесплатный кейс. Купленное нельзя передать другому игроку и вернуть деньгами.":
    "or open a free case. Purchases cannot be transferred to another player or refunded in money.",
  "Куплено — команда уже работает в игре": "Purchased — the command already works in game",
  "Недоступно": "Unavailable",
  "Покупаем…": "Buying…",
  "Купить за {n} VC": "Buy for {n} VC",
  "Точки дома": "Home points",
  "Награда за прокачку: {vc} VC на {level} уровне": "Level reward: {vc} VC at level {level}",
  "Каждые {n} уровней открывают ещё одну точку дома. Открытую точку нужно докупить, и каждая следующая дороже предыдущей на 500 VC.":
    "Every {n} levels unlock one more home point. An unlocked point still has to be bought, and each next one costs 500 VC more than the last.",
  "Занято {used} из {total}": "{used} of {total} used",
  "уровень {n}": "level {n}",
  "Следующая точка откроется на {n} уровне": "The next point unlocks at level {n}",
  "Точка добавлена — отметьте её командой /sethome <имя>":
    "Point added \u2014 mark it in game with /sethome <name>",
  "Ошибка": "Error",

  // ────────────────────────────── пополнение ────────────────────────────
  "Курс:": "Rate:",
  "1 ₽ = {n} VC": "1 ₽ = {n} VC",
  "Оплата картой, СБП, кошельками и криптой — VC придут на баланс сразу после оплаты.":
    "Pay by card, SBP, wallet or crypto — VC land on your balance right after payment.",
  "Автоматической оплаты пока нет — вы оставляете заявку, переводите деньги и указываете контакт, а чиф-администратор сверяет перевод и начисляет VC вручную.":
    "Automatic payment is not live yet — you leave a request, send the money and give a contact, then the chief administrator checks the transfer and credits the VC by hand.",
  "Бонус до +{n}% VC": "Bonus up to +{n}% VC",
  "за выбор кассы.": "depending on the payment provider.",
  "Мои заявки": "My requests",
  "На рассмотрении": "Under review",
  "Начислено": "Credited",
  "Отклонено": "Declined",
  "(+{n} бонусом)": "(+{n} bonus)",
  "VanillaCoins нельзя вывести обратно в деньги или передать другому игроку. Потратить их можно в":
    "VanillaCoins cannot be cashed out or passed to another player. You can spend them in the",
  "магазине": "shop",
  "и на": "and on",
  "кейсы": "cases",
  "Пополнение временно отключено. Загляните позже — кассы вернут, как только закончим настройку.":
    "Top-ups are temporarily off. Check back soon — payment providers will return once setup is done.",
  "У вас уже есть заявка на рассмотрении. Дождитесь ответа администрации — новую можно создать после того, как эту одобрят или отклонят.":
    "You already have a request under review. Wait for the administration to answer — you can create a new one once this is approved or declined.",
  "Сумма, ₽": "Amount, ₽",
  "Получите": "You get",
  "включая бонус +{n}% за оплату через {provider}": "including a +{n}% bonus for paying via {provider}",
  "Способ оплаты": "Payment method",
  "Контакт для связи": "Contact",
  "Telegram, Discord или почта": "Telegram, Discord or email",
  "Комментарий": "Comment",
  "Например: перевод с карты **** 1234 в 19:40": "For example: card transfer **** 1234 at 19:40",
  "Переходим к оплате…": "Going to checkout…",
  "Отправляем…": "Sending…",
  "Перейти к оплате": "Go to checkout",
  "Отправить заявку": "Send request",
  "Заявка создана на {vc} VC. Переведите {rub} ₽ и ждите подтверждения.":
    "Request created for {vc} VC. Send {rub} ₽ and wait for confirmation.",
  "FreeKassa": "FreeKassa",
  "Платега": "Platega",
  "Перевод вручную": "Manual transfer",
  "Карты, СБП, кошельки, крипта": "Cards, SBP, wallets, crypto",
  "СБП, карты, крипта": "SBP, cards, crypto",
  "Заявку проверяет администрация": "The administration checks the request",

  // ────────────────────────── заявление о разбане ───────────────────────
  "Заявление о разбане": "Unban appeal",
  "Форма для тех, кого забанили. Входить на сайт не нужно — достаточно ника и контакта. Заявление читает главная администрация, ответ приходит на указанный контакт.":
    "A form for banned players. No login needed — a nickname and a contact are enough. The chief administration reads the appeal and answers at the contact you leave.",
  "Что стоит знать": "Worth knowing",
  "Бан за два активных варна снимается сам через {n} дней — ждать проще, чем писать.":
    "A ban from two active warnings lifts itself after {n} days — waiting is easier than writing.",
  "Одно открытое заявление на ник. Новое можно подать после решения по прошлому.":
    "One open appeal per nickname. You can file a new one once the previous is decided.",
  "Заявление за другого игрока не рассматривается: пишет тот, кого забанили.":
    "Appeals on behalf of someone else are not reviewed: the banned player writes it.",
  "Врать смысла нет: у администрации есть журнал действий, логи входов и запись наказания с причиной.":
    "Lying gets you nowhere: the administration has the action log, login history and the punishment record with its reason.",
  "Правила сервера — на странице": "The server rules are on the",
  "«Правила»": "\"Rules\" page",

  // ────────────────────── розыгрыши, вход и регистрация ─────────────────
  "Наиграно: {n} ч": "Played: {n} h",
  "Розыгрыши среди игроков сервера": "Giveaways for the server's players",
  "Участвуют те, кто действительно играет: у каждого розыгрыша своё условие по наигранному времени. Победителя выбирает сервер по сохранённому сиду — его видно после розыгрыша, результат можно пересчитать.":
    "They are for people who actually play: every giveaway has its own playtime requirement. The winner is picked from a stored seed — it is shown after the draw, so anyone can recheck the result.",
  "Сейчас активных розыгрышей нет. Загляните позже.": "No active giveaways right now. Check back later.",
  "участников: {n}": "entries: {n}",
  "до {date}": "until {date}",
  "Условие: {n} ч на сервере.": "Requirement: {n} h on the server.",
  "Войти, чтобы участвовать": "Log in to enter",
  "Прошедшие розыгрыши": "Past giveaways",
  "приз:": "prize:",
  "сид:": "seed:",
  "Идёт": "Running",
  "Завершён": "Finished",
  "Отменён": "Cancelled",
  "Заявка принята": "You are in",
  "Участвовать": "Enter",
  "Нужно ещё {n} ч": "{n} h to go",
  "Вход": "Log in",
  "Этот же логин и пароль используются для входа на сервере.":
    "The same login and password are used to join the server.",
  "Логин (ник в игре)": "Login (in-game nickname)",
  "Почта": "Email",
  "Промокод — необязательно": "Promo code — optional",
  "код блогера": "creator code",
  "Код {code} подставлен из ссылки партнёра. Его можно стереть или заменить — но только сейчас: после регистрации код не меняется.":
    "Code {code} came from a partner link. You can clear or replace it — but only now: after signing up the code cannot be changed.",
  "Вводится один раз при регистрации и навсегда остаётся за аккаунтом. Награда придёт, когда аккаунт дорастёт до третьего уровня.":
    "Entered once at sign-up and stays with the account forever. The reward arrives once the account reaches level three.",
  "Пароль": "Password",
  "Я принимаю": "I accept the",
  "пользовательское соглашение": "terms of service",
  "Я согласен с": "I agree to the",
  "политикой конфиденциальности": "privacy policy",
  "Нет аккаунта?": "No account?",
  "Зарегистрироваться": "Sign up",
  "Уже есть аккаунт?": "Already have an account?",
  "Войти в существующий": "Log in to it",
  "Аккаунт создан, но промокод не принят: {error}":
    "The account was created, but the promo code was rejected: {error}",

  // ─────────────────────────────── новости ──────────────────────────────
  "Что происходит на сервере": "What is happening on the server",
  "Пока ничего не публиковали.": "Nothing published yet.",
  "Закреплено": "Pinned",
  "{n} мин чтения": "{n} min read",
  "{n} мин": "{n} min",
  "Читать": "Read",
  "администрация": "administration",
  "Все новости": "All news",
  "Ещё новости": "More news",

  // ──────────────────────── кейсы и редкости ────────────────────────────
  "Первый сезон": "Season one",
  "Внутри — только то, что видно другим игрокам: шлейфы, ауры, питомцы, шляпы, эффекты входа и метки в мире. Ничего, что даёт преимущество в игре. Шансы указаны честно, дубли превращаются в осколки, а гарант не даёт застрять в невезении.":
    "Inside there is only what other players can see: trails, auras, pets, hats, join effects and world marks. Nothing that gives an edge in the game. The odds are stated honestly, duplicates turn into shards, and pity protection keeps a bad streak from lasting.",
  "{n} осколков": "{n} shards",
  "моя коллекция": "my collection",
  "оск.": "shards",
  "осколков": "shards",
  "бесплатно, раз в сутки": "free, once a day",
  "всего {n} шт.": "only {n} made",
  "Войти, чтобы открывать": "Log in to open",
  "Гарант.": "Pity.",
  "Счётчик открытий без легендарки виден прямо на кейсе. Дошёл до предела — легендарка выпадает принудительно, счётчик обнуляется.":
    "The counter of openings without a legendary is shown on the case. Once it hits the limit a legendary drops for sure and the counter resets.",
  "Дубли.": "Duplicates.",
  "Уже имеющийся предмет превращается в осколки: 30 за обычный, 90 за редкий, 300 за эпический, 900 за легендарный.":
    "An item you already own turns into shards: 30 for common, 90 for rare, 300 for epic, 900 for legendary.",
  "Осколки.": "Shards.",
  "За них покупается конкретный предмет из каталога — без всякой случайности.":
    "They buy a specific item from the catalogue — no randomness involved.",
  "Коллекции.": "Collections.",
  "Собрали весь набор — получаете предмет, которого нет ни в одном кейсе.":
    "Complete a set and you get an item that is in no case at all.",
  "Экземпляры.": "Serials.",
  "У части предметов ограниченный тираж: вам достанется номер, и он останется за вами.":
    "Some items have a limited run: you get a number and it stays yours.",
  "Честность.": "Fairness.",
  "Каждое открытие подписано хэшем сида — результат нельзя подкрутить задним числом.":
    "Every opening is signed with a seed hash — the result cannot be changed after the fact.",
  "Обычный": "Common",
  "Редкий": "Rare",
  "Эпический": "Epic",
  "Легендарный": "Legendary",
  "Шлейф": "Trail",
  "Аура": "Aura",
  "Питомец": "Pet",
  "Шляпа": "Hat",
  "Эффект входа": "Join effect",
  "Цвет ника": "Name colour",
  "Титул": "Title",
  "Метка в мире": "World mark",

  // ─────────────── добавлено при переводе разделов сайта ────────────────
  "{game} временно выключена": "{game} is temporarily off",
  "Администрация закрыла игру — новые ставки не принимаются. Ставки, сделанные раньше, разыгрываются и выплачиваются как обычно.":
    "The administration closed the game — no new bets are accepted. Bets placed earlier are still resolved and paid as usual.",
  "Ставки раунда": "Bets this round",
  "Пока никто не поставил.": "Nobody has bet yet.",
  "Прошлые раунды": "Past rounds",
  "Нажмите на результат — покажем сид раунда, по нему результат пересчитывается вручную.":
    "Tap a result to see the round seed — the outcome can be rechecked by hand.",
  "Раундов ещё не было.": "No rounds yet.",
  "раунд": "round",
  "бросок:": "roll:",
  "бросок": "roll",
  "Подключаемся к столу…": "Connecting to the table…",
  "Раунд": "Round",
  "Ставки закроются через {n} с": "Bets close in {n} s",
  "Результат · новый раунд через {n} с": "Result · new round in {n} s",
  "Выпало": "Result",
  "Ставка, VC": "Bet, VC",
  "Ставка принята: {n} VC": "Bet placed: {n} VC",
  "Поставить": "Place bet",
  "Ставки закрыты": "Bets closed",
  "Множитель один на всех: выпавший сектор умножает ставку каждого. Пустых секторов нет, минимальный — x2.":
    "One multiplier for everyone: the sector that comes up multiplies every bet. There are no empty sectors, the lowest is x2.",
  "Старт через {n} с": "Launch in {n} s",
  "Взрыв": "Boom",
  "Полёт": "In flight",
  "Крах на": "Crashed at",
  "Множитель": "Multiplier",
  "Ракета готовится к старту…": "The rocket is getting ready…",
  "Забрать на": "Cash out at",
  "Ставка принята: {n} VC на x{target}": "Bet placed: {n} VC at x{target}",
  "Точка вывода выбирается заранее: ракета сама заберёт ставку на x{target}, если долетит.":
    "The cash-out point is chosen up front: the rocket takes your bet at x{target} if it gets there.",
  "Собрано {owned} из {total} предметов сезона. Осколков:":
    "You own {owned} of {total} season items. Shards:",
  "Один активный предмет на каждый вид — снимите текущий, чтобы надеть другой.":
    "One active item per type — take the current one off to put another on.",
  "К кейсам": "To the cases",
  "Награда:": "Reward:",
  "получена": "received",
  "тираж": "run of",
  "Снять": "Unequip",
  "Надеть": "Equip",
  "Купить за {n} осколков": "Buy for {n} shards",
  "Выпадает только из кейсов": "Drops from cases only",
  "Награда за коллекцию": "Collection reward",
  "экземпляр": "serial",
  "Дубль — начислено {n} осколков.": "Duplicate — {n} shards credited.",
  "Сработал гарант.": "Pity triggered.",
  "Коллекция собрана — награда добавлена в инвентарь.":
    "Collection complete — the reward was added to your inventory.",
  "Гарант легендарки": "Legendary pity",
  "Открываем…": "Opening…",
  "Следующий ящик — завтра": "Next case tomorrow",
  "Открыть бесплатно": "Open for free",
  "Открыть за {n} VC": "Open for {n} VC",
  "Открыть сразу": "Open at once",
  "Быстрое открытие": "Fast opening",
  "Открыть {count} за {n} VC": "Open {count} for {n} VC",
  "дубль": "duplicate",
  "гарант": "pity",

  "Как это работает": "How it works",
  "Выходим…": "Logging out…",
  "Скопировано": "Copied",
  "Копировать": "Copy",
  "Получить код 2FA": "Get a 2FA code",
  "введите в игре:": "enter in game:",
  "Заявление принято": "Appeal received",
  "Его рассмотрит главная администрация. Ответ придёт на указанный контакт — обычно в течение суток. Второе заявление по тому же нику подать нельзя, пока не будет решения.":
    "The chief administration will review it. The answer comes to the contact you left, usually within a day. You cannot file a second appeal for the same nickname until this one is decided.",
  "Ник в игре": "In-game nickname",
  "Ник, который забанен": "The nickname that was banned",
  "Контакт для ответа": "Contact for the answer",
  "Что произошло": "What happened",
  "Когда и за что выдали бан, согласны ли вы с ним и почему считаете, что его стоит снять.":
    "When and why you were banned, whether you agree with it and why you think it should be lifted.",
  "Отправить заявление": "Send the appeal",
  "Обращение создано": "Ticket created",
  "Новое обращение": "New ticket",
  "Тема": "Subject",
  "Коротко о проблеме": "Briefly about the problem",
  "Сообщение": "Message",
  "Опишите, что случилось: ник, время, что делали. Чем подробнее, тем быстрее разберёмся.":
    "Describe what happened: nickname, time, what you were doing. The more detail, the faster we sort it out.",
  "Отправить": "Send",
  "Ответ": "Reply",
  "Ответить": "Reply",
  "Закрыть обращение": "Close ticket",
  "Администрация": "Administration",
  "Игрок": "Player",
  "Ждёт ответа": "Awaiting reply",
  "Есть ответ": "Answered",
  "Закрыт": "Closed",
  "Технические работы": "Maintenance",
  "Сайт и сервер вернутся, как только всё проверим. Баланс, предметы и прогресс на месте — ничего не потеряется.":
    "The site and the server will be back as soon as we finish checking. Your balance, items and progress are safe — nothing is lost.",
  "Работы завершены — обновите страницу, сайт снова открыт.":
    "Maintenance is over — refresh the page, the site is open again.",
  "Уровень {level} · {hours} ч в игре": "Level {level} · {hours} h in game",
  "Уровень {n}": "Level {n}",
  "пополнить": "top up",
  "до {level}: {hours} ч": "to {level}: {hours} h",
  "Вход в игру": "Joining the game",
  "Заходите на сервер под ником {login} и введите /login с этим же паролем. С нового адреса сервер попросит код 2FA.":
    "Join the server as {login} and type /login with this same password. From a new address the server will ask for a 2FA code.",
  "Промокод аккаунта": "Account promo code",
  "Партнёр: {name}.": "Partner: {name}.",
  "Награда {n} VC получена.": "The {n} VC reward has been paid.",
  "Награда {n} VC придёт на {level} уровне — сейчас у вас {current}.":
    "The {n} VC reward arrives at level {level} — you are at {current}.",
  "Код привязан к аккаунту навсегда, сменить его нельзя.":
    "The code is tied to the account for good and cannot be changed.",
  "Заявка медиа-партнёра": "Creator application",
  "Одобрена": "Approved",
  "Отклонена": "Declined",
  "Промокод партнёра": "Partner promo code",
  "Активаций: {n} · награда {reward} VC · нужен уровень {level}":
    "Activations: {n} · reward {reward} VC · requires level {level}",
  "Заработано с пополнений": "Earned from top-ups",
  "Доля партнёра": "Partner share",
  "{n}% от каждого пополнения игрока, который ввёл ваш код, приходят вам на баланс автоматически — в момент, когда администрация подтверждает его заявку.":
    "{n}% of every top-up by a player who entered your code lands on your balance automatically, the moment the administration confirms their payment.",
  "Ссылка для описания канала": "Link for your channel description",
  "Регистрация с вашим кодом": "Sign-up with your code",
  "Игрок переходит по ссылке и попадает на регистрацию, где ваш код уже вписан — вводить руками ничего не нужно, и код закрепляется за аккаунтом навсегда.":
    "A player follows the link and lands on the sign-up form with your code already filled in — nothing to type by hand, and the code stays with the account forever.",
  "Готовый баннер": "Ready-made banner",
  "Картинка с вашим промокодом": "An image with your promo code",
  "Ваш код подставлен в макет автоматически. Скачивайте и ставьте в шапку канала, в описание видео или в пост — ничего дорисовывать не нужно.":
    "Your code is placed into the layout automatically. Download it and use it as a channel banner, in a video description or a post — nothing left to draw.",
  "Операции": "Transactions",
  "Пока пусто": "Nothing yet",
  "В играх поставлено {wagered} VC, итог {sign}{net} VC":
    "Wagered {wagered} VC in games, net {sign}{net} VC",
  "Чисто": "Clean",
  "Косметика": "Cosmetics",
  "Сотрудничество": "Partnership",
  "Медиа-партнёрам": "For creators",
  "Партнёр получает личный промокод, статус media на сервере и статистику по своим игрокам в кабинете. Игрок, который ввёл ваш код при регистрации, закрепляется за вами навсегда и получает {reward} VC, когда дорастает до {level} уровня аккаунта. А вам приходит {share}% VC с каждого его пополнения — автоматически, пока код активен.":
    "A partner gets a personal promo code, media status on the server and player stats in their account page. A player who enters your code at sign-up stays yours forever and receives {reward} VC once the account reaches level {level}. You get {share}% VC from each of their top-ups — automatically, as long as the code is active.",
  "Минимальные критерии": "Minimum requirements",
  "50+ средних просмотров": "50+ average views",
  "3000+ просмотров за 7 дней в аналитике канала, тематика Minecraft":
    "3000+ views in 7 days in channel analytics, Minecraft content",
  "15+ средних зрителей в месяц": "15+ average viewers per month",
  "500+ участников": "500+ members",
  "10+ средних зрителей за месяц": "10+ average viewers per month",
  "критерии рассматриваются индивидуально": "reviewed case by case",
  "Мы смотрим на живую аудиторию, а не на цифру подписчиков. Накрутки видно сразу, и это отказ без второй попытки.":
    "We look at a real audience, not a subscriber count. Inflated numbers are obvious and mean a rejection with no second try.",
  "Что получает партнёр": "What the partner gets",
  "Личный промокод, {share}% VC с пополнений своих игроков, статус media в игре, красный ESP на себе, локальные погода и время, статистика в кабинете.":
    "A personal promo code, {share}% VC from their players' top-ups, media status in game, a red ESP outline, personal weather and time, and stats in the account page.",
  "Что получает игрок": "What the player gets",
  "{reward} VC на кейсы и косметику при достижении {level} уровня. Код вводится один раз при регистрации.":
    "{reward} VC for cases and cosmetics on reaching level {level}. The code is entered once, at sign-up.",
  "Чего не будет": "What you will not get",
  "Игрового преимущества за код нет и не появится: VC тратятся только на косметику. Ванилла остаётся ваниллой.":
    "The code gives no gameplay advantage and never will: VC only buy cosmetics. Vanilla stays vanilla.",
  "Чтобы подать заявку, войдите в аккаунт.": "Log in to your account to apply.",
  "Вы уже партнёр": "You are already a partner",
  "Активаций: {n} · награда игроку {reward} VC · нужен уровень {level}":
    "Activations: {n} · player reward {reward} VC · requires level {level}",
  "Статистика в кабинете": "Stats in your account",
  "Заявка на рассмотрении": "Application under review",
  "подана {date}. Ответ придёт в кабинет.":
    "filed {date}. The answer arrives in your account.",
  "Предыдущая заявка:": "Previous application:",
  "Заявка отправлена": "Application sent",
  "Мы проверим охваты и вернёмся с ответом. Статус заявки виден в личном кабинете.":
    "We will check your reach and get back to you. The application status is shown in your account.",
  "Заявка от {login}": "Application from {login}",
  "Площадка": "Platform",
  "Выберите": "Choose",
  "Ссылка на канал": "Channel link",
  "Охваты": "Reach",
  "Средние просмотры, зрители или участники за последние 7-30 дней":
    "Average views, viewers or members over the last 7-30 days",
  "Скриншот аналитики попросим отдельно — сразу приложите ссылку, если он есть.":
    "We will ask for an analytics screenshot separately — attach a link now if you have one.",
  "Telegram или Discord": "Telegram or Discord",
  "Желаемый промокод — необязательно": "Preferred promo code — optional",
  "Комментарий — необязательно": "Comment — optional",
  "Не удалось загрузить картинку баннера": "Could not load the banner image",
  "Скачать баннер": "Download banner",
  "Готовим баннер…": "Preparing the banner…",
  "PNG 1376×768 — годится для шапки канала, поста и превью.":
    "PNG 1376×768 — fits a channel header, a post or a thumbnail.",
  "Редакция от {date}": "Version of {date}",
  "Документ имеет силу только в русской редакции — ниже она приведена без перевода.":
    "Only the Russian version of this document is legally binding — it is shown below untranslated.",
  "Вопросы по документам — через": "Questions about these documents go through a",
  "обращение в поддержку": "support ticket",
};
