/**
 * Сквозной прогон API: регистрация, вход в игре, 2FA, наказания, промо, бонусы,
 * кейсы и мини-игры. Запускать против поднятого сайта с чистой базой:
 *
 *   BASE=http://127.0.0.1:3000 MC_SERVER_TOKEN=... node scripts/e2e.mjs
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const TOKEN = process.env.MC_SERVER_TOKEN ?? "testtoken";

let passed = 0;
let failed = 0;

function check(name, condition, details) {
  if (condition) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${details ? ` — ${JSON.stringify(details)}` : ""}`);
  }
}

async function api(path, { method = "GET", body, cookie, serverToken, ip } = {}) {
  const headers = { "Content-Type": "application/json" };
  // Разные адреса, иначе тесты упрутся в защиту от массовой регистрации.
  if (ip) headers["X-Forwarded-For"] = ip;
  if (cookie) headers.Cookie = cookie;
  if (serverToken) headers["X-Server-Token"] = serverToken;
  const response = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json, cookie: response.headers.get("set-cookie") };
}

let ipCounter = 0;

async function register(login, password = "password123", promo) {
  const result = await api("/api/auth/register", {
    method: "POST",
    ip: `203.0.113.${++ipCounter}`,
    body: { login, email: `${login}@example.com`, password, promo },
  });
  return { ...result, session: result.cookie?.split(";")[0] };
}

const run = async () => {
  console.log("— Регистрация —");
  const steve = await register("Steve");
  check("регистрация проходит", steve.status === 200, steve.json);

  const dup = await register("Steve");
  check("повторная регистрация отклоняется", dup.status === 409);

  const weak = await api("/api/auth/register", {
    method: "POST",
    ip: "203.0.113.200",
    body: { login: "Weak", email: "weak@example.com", password: "short" },
  });
  check("слабый пароль отклоняется", weak.status === 400);

  console.log("— Вход в игре —");
  const noToken = await api("/api/mc/login", {
    method: "POST",
    body: { login: "Steve", password: "password123", ip: "10.0.0.1" },
  });
  check("без серверного токена — 401", noToken.status === 401);

  const wrongPass = await api("/api/mc/login", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Steve", password: "nope", ip: "10.0.0.1" },
  });
  check("неверный пароль", wrongPass.json?.status === "bad_password", { status: wrongPass.status, json: wrongPass.json });

  const newIp = await api("/api/mc/login", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Steve", password: "password123", ip: "10.0.0.1" },
  });
  check("новый IP требует 2FA", newIp.json?.status === "2fa_required", newIp.json);

  const codeResponse = await api("/api/me/twofa", { method: "POST", cookie: steve.session });
  check("кабинет выдаёт код 2FA", typeof codeResponse.json?.code === "string");

  const badCode = await api("/api/mc/twofa", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Steve", code: "000000", ip: "10.0.0.1" },
  });
  check("неверный код отклоняется", ["bad_code", "no_code"].includes(badCode.json?.status));

  const goodCode = await api("/api/mc/twofa", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Steve", code: codeResponse.json.code, ip: "10.0.0.1" },
  });
  check("верный код пускает", goodCode.json?.status === "ok", goodCode.json);

  const knownIp = await api("/api/mc/login", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Steve", password: "password123", ip: "10.0.0.1" },
  });
  check("знакомый IP пускает без 2FA", knownIp.json?.status === "ok", knownIp.json);

  console.log("— Наказания —");
  await register("Griefer");
  await api("/api/mc/login", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Griefer", password: "password123", ip: "10.0.0.9" },
  });

  const jail = await api("/api/mc/punish", {
    method: "POST",
    serverToken: TOKEN,
    body: { type: "JAIL", targetLogin: "Griefer", reason: "гриферство", minutes: 60 },
  });
  check("деморган выдан", jail.status === 200 && jail.json?.punishment?.totalSeconds === 3600, jail.json);

  const doubleJail = await api("/api/mc/punish", {
    method: "POST",
    serverToken: TOKEN,
    body: { type: "JAIL", targetLogin: "Griefer", reason: "ещё раз", minutes: 10 },
  });
  check("второй деморган не выдаётся", doubleJail.status === 409);

  const jailSync = await api("/api/mc/jail", {
    method: "POST",
    serverToken: TOKEN,
    body: { id: jail.json.punishment.id, remainingSeconds: 1200, blocksMined: 40 },
  });
  check("состояние деморгана синхронизируется", jailSync.json?.ok === true);

  const warn1 = await api("/api/mc/punish", {
    method: "POST",
    serverToken: TOKEN,
    body: { type: "WARN", targetLogin: "Griefer", reason: "мат" },
  });
  check("первый варн без бана", warn1.status === 200 && !warn1.json?.autoBan);

  const warn2 = await api("/api/mc/punish", {
    method: "POST",
    serverToken: TOKEN,
    body: { type: "WARN", targetLogin: "Griefer", reason: "снова мат" },
  });
  check("второй варн даёт автобан", Boolean(warn2.json?.autoBan), warn2.json);

  const bannedLogin = await api("/api/mc/login", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Griefer", password: "password123", ip: "10.0.0.9" },
  });
  check("забаненного не пускают", bannedLogin.json?.status === "banned", bannedLogin.json);

  console.log("— Репорты —");
  const report = await api("/api/mc/report", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Steve", text: "читер в шахте" },
  });
  check("репорт создан", report.json?.ok === true);

  const reportList = await api("/api/mc/reports", { serverToken: TOKEN });
  check("репорт виден в списке", reportList.json?.reports?.length === 1);

  const claimNoRights = await api("/api/mc/reports", {
    method: "POST",
    serverToken: TOKEN,
    // Steve — chief administrator, поэтому проверяем на обычном игроке.
    body: { id: reportList.json.reports[0].id, actorLogin: "Griefer" },
  });
  check("игрок без прав не берёт репорт", claimNoRights.status === 403, claimNoRights.json);

  console.log("— Экономика —");
  // Steve зарегистрирован как BOOTSTRAP_ADMIN_LOGIN, поэтому он chief administrator.
  const me = await api("/api/me", { cookie: steve.session });
  check("бутстрап-админ получил 5 уровень", me.json?.adminLevel === 5, me.json);

  const alex = await register("Alex");
  const alexMe = await api("/api/me", { cookie: alex.session });
  check("обычный игрок без админки", alexMe.json?.adminLevel === 0);

  const beforeVerify = await api("/api/panel/balance", {
    method: "POST",
    cookie: steve.session,
    body: { userId: me.json.id, amount: 100, reason: "до входа в панель" },
  });
  check("панель закрыта без отдельного входа", beforeVerify.status === 403, beforeVerify.json);

  const wrongPanelPass = await api("/api/panel/verify", {
    method: "POST",
    cookie: steve.session,
    body: { password: "not-my-password" },
  });
  check("вход в панель проверяет пароль", wrongPanelPass.status === 401);

  const panelVerify = await api("/api/panel/verify", {
    method: "POST",
    cookie: steve.session,
    body: { password: "password123" },
  });
  check("вход в панель по паролю", panelVerify.json?.ok === true, panelVerify.json);

  const topUp = await api("/api/panel/balance", {
    method: "POST",
    cookie: steve.session,
    body: { userId: me.json.id, amount: 3000, reason: "тестовое пополнение" },
  });
  check("chief правит баланс", topUp.json?.balance === 3000, topUp.json);

  const topUpByPlayer = await api("/api/panel/balance", {
    method: "POST",
    cookie: alex.session,
    body: { userId: alexMe.json.id, amount: 100000, reason: "себе" },
  });
  check("игрок не правит баланс", topUpByPlayer.status === 403);

  const negative = await api("/api/panel/balance", {
    method: "POST",
    cookie: steve.session,
    body: { userId: alexMe.json.id, amount: -100, reason: "в минус" },
  });
  check("баланс не уходит в минус", negative.status === 400, negative.json);

  const promoCreate = await api("/api/panel/promo", {
    method: "POST",
    cookie: steve.session,
    body: { code: "BLOGGER", partnerLogin: "Steve", rewardVc: 500, requiredLevel: 3 },
  });
  check("chief создаёт промокод", promoCreate.json?.ok === true, promoCreate.json);

  const promoByPlayer = await api("/api/panel/promo", {
    method: "POST",
    cookie: alex.session,
    body: { code: "HACK", rewardVc: 100000, requiredLevel: 0 },
  });
  check("игрок не создаёт промокоды", promoByPlayer.status === 403);

  const lowLevel = await api("/api/mc/promo", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Alex", code: "BLOGGER" },
  });
  check("промокод привязывается, награда ждёт уровня", lowLevel.json?.status === "ok" && lowLevel.json?.pending === true, lowLevel.json);

  const secondPromo = await api("/api/mc/promo", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Alex", code: "OPEN" },
  });
  check("второй промокод не привязывается", secondPromo.json?.status === "error", secondPromo.json);

  await api("/api/panel/promo", {
    method: "POST",
    cookie: steve.session,
    body: { code: "OPEN", rewardVc: 500, requiredLevel: 0 },
  });

  const withPromo = await register("Newcomer", "password123", "OPEN");
  check("промокод принимается при регистрации", withPromo.json?.promo === "OPEN", withPromo.json);

  const promoInCabinet = await api("/api/me", { cookie: withPromo.session });
  check("награда за промокод нулевого уровня начислена", promoInCabinet.json?.balanceVc === 500, promoInCabinet.json);

  const badPromo = await register("Wrongcode", "password123", "NOPE404");
  check("аккаунт создаётся даже с неверным кодом", badPromo.status === 200, badPromo.json);
  check("о неверном коде сообщают", Boolean(badPromo.json?.promoError), badPromo.json);

  const ownPromo = await api("/api/mc/promo", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Steve", code: "BLOGGER" },
  });
  check("свой промокод активировать нельзя", ownPromo.json?.status === "error", ownPromo.json);

  const bonusCreate = await api("/api/panel/bonus", {
    method: "POST",
    cookie: steve.session,
    body: { code: "ONESHOT", rewardVc: 100, maxUses: 1 },
  });
  check("создан бонус-код на одну активацию", bonusCreate.json?.ok === true);

  const bonusFirst = await api("/api/mc/bonus", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Alex", code: "ONESHOT" },
  });
  check("первая активация бонуса проходит", bonusFirst.json?.status === "ok");

  const bonusSecond = await api("/api/mc/bonus", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Steve", code: "ONESHOT" },
  });
  check("лимит активаций держится", bonusSecond.json?.status === "exhausted", bonusSecond.json);

  console.log("— Кейсы —");
  const freeOpen = await api("/api/cases/open", {
    method: "POST",
    cookie: steve.session,
    body: { caseKey: "daily" },
  });
  check("бесплатный кейс открывается", freeOpen.status === 200, freeOpen.json);

  const freeAgain = await api("/api/cases/open", {
    method: "POST",
    cookie: steve.session,
    body: { caseKey: "daily" },
  });
  check("второе бесплатное открытие в сутки не проходит", freeAgain.status === 400, freeAgain.json);

  const beforeCase = await api("/api/me", { cookie: steve.session });
  const paidOpen = await api("/api/cases/open", {
    method: "POST",
    cookie: steve.session,
    body: { caseKey: "wild" },
  });
  check("платный кейс открывается", paidOpen.status === 200, paidOpen.json);
  check("кейс раскрывает fairness", typeof paidOpen.json?.fairness?.serverSeedHash === "string");
  check(
    "цена кейса списана",
    paidOpen.json?.balanceVc ===
      beforeCase.json.balanceVc - 250 + (paidOpen.json?.kind === "VC" ? paidOpen.json.amount : 0),
    { before: beforeCase.json.balanceVc, after: paidOpen.json?.balanceVc, item: paidOpen.json?.kind },
  );
  check("счётчик гаранта считает", paidOpen.json?.pity?.threshold === 40, paidOpen.json?.pity);

  const noMoney = await api("/api/cases/open", {
    method: "POST",
    cookie: alex.session,
    body: { caseKey: "legends" },
  });
  check("кейс без денег не открывается", noMoney.status === 400, noMoney.json);

  // Гарант: у кейса легенд порог 20, поэтому за 20 открытий легендарка обязана выпасть.
  await api("/api/panel/balance", {
    method: "POST",
    cookie: steve.session,
    body: { userId: me.json.id, amount: 20000, reason: "проверка гаранта" },
  });
  let sawLegendary = false;
  let opens = 0;
  let lastSpin = null;
  for (let i = 0; i < 20; i++) {
    const spin = await api("/api/cases/open", {
      method: "POST",
      cookie: steve.session,
      body: { caseKey: "legends" },
    });
    lastSpin = spin;
    if (spin.status !== 200) break;
    opens++;
    if (spin.json.cosmetic?.rarity === "legendary") {
      sawLegendary = true;
      break;
    }
  }
  check("двадцать открытий проходят", opens > 0, { opens, lastSpin: lastSpin?.json });
  check("за двадцать открытий выпала легендарка", sawLegendary, { opens });

  const afterOpens = await api("/api/me", { cookie: steve.session });
  check("осколки начисляются", afterOpens.json.shards > 0, { shards: afterOpens.json.shards });

  const buyMissing = await api("/api/cosmetics/buy", {
    method: "POST",
    cookie: alex.session,
    body: { key: "trail_ash" },
  });
  check("без осколков покупка не проходит", buyMissing.status === 400, buyMissing.json);

  const collectionReward = await api("/api/cosmetics/buy", {
    method: "POST",
    cookie: steve.session,
    body: { key: "trail_eclipse" },
  });
  check("награду за коллекцию нельзя купить", collectionReward.status === 400, collectionReward.json);

  console.log("— Игры —");
  const tinyBet = await api("/api/games/roulette", {
    method: "POST",
    cookie: steve.session,
    body: { bet: 1, multiplier: 2 },
  });
  check("минимальная ставка проверяется", tinyBet.status === 400, tinyBet.json);

  const hugeBet = await api("/api/games/roulette", {
    method: "POST",
    cookie: steve.session,
    body: { bet: 999999, multiplier: 2 },
  });
  check("максимальная ставка проверяется", hugeBet.status === 400);

  const badMultiplier = await api("/api/games/roulette", {
    method: "POST",
    cookie: steve.session,
    body: { bet: 10, multiplier: 7 },
  });
  check("чужой множитель отклоняется", badMultiplier.status === 400);

  const beforeSpin = await api("/api/me", { cookie: steve.session });
  const spin = await api("/api/games/roulette", {
    method: "POST",
    cookie: steve.session,
    body: { bet: 100, multiplier: 2 },
  });
  check("рулетка играет", spin.status === 200 && typeof spin.json?.balance === "number", spin.json);
  check("рулетка раскрывает fairness", typeof spin.json?.fairness?.serverSeedHash === "string");
  check(
    "ставка списана, выигрыш начислен",
    spin.json?.balance === beforeSpin.json.balanceVc - 100 + (spin.json?.won ? 200 : 0),
    { before: beforeSpin.json.balanceVc, after: spin.json?.balance, won: spin.json?.won },
  );

  const crash = await api("/api/games/crash", {
    method: "POST",
    cookie: steve.session,
    body: { bet: 10, cashOutAt: 2 },
  });
  check("краш играет", crash.status === 200 && typeof crash.json?.crashPoint === "number", crash.json);

  const noFunds = await api("/api/games/roulette", {
    method: "POST",
    cookie: alex.session,
    body: { bet: 5000, multiplier: 2 },
  });
  check("игра без денег отклоняется", noFunds.status === 400, noFunds.json);

  const alexAfter = await api("/api/me", { cookie: alex.session });
  check("баланс не ушёл в минус", alexAfter.json.balanceVc >= 0, alexAfter.json);

  const anonGame = await api("/api/games/roulette", {
    method: "POST",
    body: { bet: 10, multiplier: 2 },
  });
  check("без входа играть нельзя", anonGame.status === 401);

  console.log("— Косметика —");
  const catalogue = await fetch(BASE + "/collection", {
    headers: { Cookie: steve.session },
  });
  check("страница коллекции открывается", catalogue.status === 200);

  const equipForeign = await api("/api/cosmetics/equip", {
    method: "POST",
    cookie: alex.session,
    body: { key: "trail_dragon", equipped: true },
  });
  check("чужую косметику надеть нельзя", equipForeign.status === 404, equipForeign.json);

  console.log("— Права —");
  const punishAsPlayer = await api("/api/panel/punish", {
    method: "POST",
    cookie: alex.session,
    body: { userId: me.json.id, type: "BAN", reason: "просто так", days: 30 },
  });
  check("игрок не банит через панель", punishAsPlayer.status === 403);

  const staffByPlayer = await api("/api/panel/staff", {
    method: "POST",
    cookie: alex.session,
    body: { userId: alexMe.json.id, level: 5 },
  });
  check("игрок не выдаёт себе админку", staffByPlayer.status === 403);

  const staffGrant = await api("/api/panel/staff", {
    method: "POST",
    cookie: steve.session,
    body: { userId: alexMe.json.id, level: 2 },
  });
  check("chief выдаёт helper", staffGrant.json?.ok === true, staffGrant.json);

  await register("Newbie");
  const overLimit = await api("/api/mc/punish", {
    method: "POST",
    serverToken: TOKEN,
    body: { type: "JAIL", targetLogin: "Newbie", actorLogin: "Alex", reason: "долго", minutes: 120 },
  });
  check("helper ограничен часом деморгана", overLimit.status === 403, overLimit.json);

  const withinLimit = await api("/api/mc/punish", {
    method: "POST",
    serverToken: TOKEN,
    body: { type: "JAIL", targetLogin: "Newbie", actorLogin: "Alex", reason: "норм", minutes: 30 },
  });
  check("helper выдаёт 30 минут", withinLimit.status === 200, withinLimit.json);

  const helperBan = await api("/api/mc/punish", {
    method: "POST",
    serverToken: TOKEN,
    body: { type: "BAN", targetLogin: "Newbie", actorLogin: "Alex", reason: "нельзя", days: 3 },
  });
  check("helper не банит", helperBan.status === 403, helperBan.json);

  const equalLevel = await api("/api/mc/punish", {
    method: "POST",
    serverToken: TOKEN,
    body: { type: "JAIL", targetLogin: "Steve", actorLogin: "Alex", reason: "месть", minutes: 10 },
  });
  check("нельзя наказать старшего по уровню", equalLevel.status === 403, equalLevel.json);

  console.log("— Двухфакторная защита панели —");
  const { createHmac } = await import("node:crypto");

  function totpCode(secret, shift = 0) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const char of secret.toUpperCase()) {
      const index = alphabet.indexOf(char);
      if (index >= 0) bits += index.toString(2).padStart(5, "0");
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    const counter = Math.floor(Date.now() / 1000 / 30) + shift;
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac("sha1", Buffer.from(bytes)).update(buffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const value =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return String(value % 1000000).padStart(6, "0");
  }

  const totpSetup = await api("/api/panel/totp", { method: "POST", cookie: steve.session });
  check("секрет TOTP выдан", typeof totpSetup.json?.secret === "string", totpSetup.json);
  check("ссылка otpauth сформирована", String(totpSetup.json?.otpauth).startsWith("otpauth://totp/"));

  const totpBadCode = await api("/api/panel/totp", {
    method: "PUT",
    cookie: steve.session,
    body: { code: "000000" },
  });
  check("неверный код TOTP не включает защиту", totpBadCode.status === 400);

  const totpEnable = await api("/api/panel/totp", {
    method: "PUT",
    cookie: steve.session,
    body: { code: totpCode(totpSetup.json.secret) },
  });
  check("TOTP включается верным кодом", totpEnable.json?.ok === true, totpEnable.json);

  const verifyNoCode = await api("/api/panel/verify", {
    method: "POST",
    cookie: steve.session,
    body: { password: "password123" },
  });
  check("после включения TOTP пароля мало", verifyNoCode.status === 401, verifyNoCode.json);

  const verifyWithCode = await api("/api/panel/verify", {
    method: "POST",
    cookie: steve.session,
    body: { password: "password123", code: totpCode(totpSetup.json.secret) },
  });
  check("код из приложения пускает в панель", verifyWithCode.json?.ok === true, verifyWithCode.json);

  const totpByPlayer = await api("/api/panel/totp", { method: "POST", cookie: alex.session });
  check("helper не трогает TOTP панели", totpByPlayer.status === 403, totpByPlayer.json);

  console.log("— Медиа-партнёры —");
  const applyAnon = await api("/api/partners/apply", {
    method: "POST",
    body: { platform: "youtube", channelUrl: "https://youtube.com/@x", audience: "100", contact: "tg" },
  });
  check("заявка без входа не принимается", applyAnon.status === 401);

  const blogger = await register("Blogger");
  const badUrl = await api("/api/partners/apply", {
    method: "POST",
    cookie: blogger.session,
    body: { platform: "youtube", channelUrl: "youtube.com/@x", audience: "100", contact: "tg" },
  });
  check("ссылка проверяется", badUrl.status === 400, badUrl.json);

  const badPlatform = await api("/api/partners/apply", {
    method: "POST",
    cookie: blogger.session,
    body: { platform: "myspace", channelUrl: "https://x.ru", audience: "100", contact: "tg" },
  });
  check("площадка проверяется", badPlatform.status === 400);

  const apply = await api("/api/partners/apply", {
    method: "POST",
    cookie: blogger.session,
    body: {
      platform: "youtube",
      channelUrl: "https://youtube.com/@blogger",
      audience: "120 средних просмотров, minecraft",
      contact: "@blogger",
      desiredCode: "BLOGGER2",
    },
  });
  check("заявка подаётся", apply.json?.ok === true, apply.json);

  const applyTwice = await api("/api/partners/apply", {
    method: "POST",
    cookie: blogger.session,
    body: {
      platform: "youtube",
      channelUrl: "https://youtube.com/@blogger",
      audience: "ещё раз",
      contact: "@blogger",
    },
  });
  check("вторая заявка не принимается", applyTwice.status === 409, applyTwice.json);

  const decideByPlayer = await api("/api/panel/partners", {
    method: "POST",
    cookie: blogger.session,
    body: { id: apply.json.id, approve: true },
  });
  check("игрок не решает по заявкам", decideByPlayer.status === 403);

  const approve = await api("/api/panel/partners", {
    method: "POST",
    cookie: steve.session,
    body: { id: apply.json.id, approve: true, code: "BLOGGER2", note: "подходит" },
  });
  check("заявка одобряется", approve.json?.code === "BLOGGER2", approve.json);

  const approveAgain = await api("/api/panel/partners", {
    method: "POST",
    cookie: steve.session,
    body: { id: apply.json.id, approve: true },
  });
  check("повторное решение не проходит", approveAgain.status === 409);

  const bloggerProfile = await api("/api/me", { cookie: blogger.session });
  check("партнёр получил статус media", bloggerProfile.json?.adminLevel === 1, bloggerProfile.json);

  const partnerPromo = await api("/api/mc/promo", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Newbie", code: "BLOGGER2" },
  });
  check("промокод партнёра работает", partnerPromo.json?.status === "ok", partnerPromo.json);

  console.log("— Новости —");
  const newsByHelper = await api("/api/panel/news", {
    method: "POST",
    cookie: alex.session,
    body: { title: "Не должно пройти", body: "текст" },
  });
  check("новость публикует только 5 уровень", newsByHelper.status === 403, newsByHelper.json);

  const newsCreate = await api("/api/panel/news", {
    method: "POST",
    cookie: steve.session,
    body: {
      title: "Открытие сервера",
      summary: "Заходите, мир уже сгенерирован",
      body: "Сервер открыт. Приваты не появятся, деморган работает.",
      pinned: true,
      broadcast: true,
    },
  });
  check("новость создаётся", newsCreate.json?.ok === true, newsCreate.json);
  check("адрес новости транслитерируется", newsCreate.json?.slug === "otkrytie-servera", newsCreate.json);

  const pending = await api("/api/mc/news", { serverToken: TOKEN });
  check("плагин видит новость для объявления", pending.json?.news?.length === 1, pending.json);

  const ack = await api("/api/mc/news", {
    method: "POST",
    serverToken: TOKEN,
    body: { ids: [pending.json.news[0].id] },
  });
  check("доставка подтверждается", ack.json?.marked === 1, ack.json);

  const pendingAgain = await api("/api/mc/news", { serverToken: TOKEN });
  check("объявленная новость не повторяется", pendingAgain.json?.news?.length === 0);

  const newsPage = await fetch(BASE + "/news");
  const newsHtml = await newsPage.text();
  check("новость видна на сайте", newsHtml.includes("Открытие сервера"));

  const draft = await api("/api/panel/news", {
    method: "POST",
    cookie: steve.session,
    body: { title: "Черновик", body: "пока не показываем", published: false },
  });
  const draftPage = await fetch(BASE + "/news/" + draft.json.slug);
  check("черновик не открывается публично", draftPage.status === 404, { status: draftPage.status });

  console.log("— Магазин —");
  const shopBuyer = await register("Shopper");
  const shopBuyerMe = await api("/api/me", { cookie: shopBuyer.session });
  await api("/api/panel/balance", {
    method: "POST",
    cookie: steve.session,
    body: { userId: shopBuyerMe.json.id, amount: 3000, reason: "на магазин" },
  });

  const poorBuy = await api("/api/shop/buy", {
    method: "POST",
    cookie: alex.session,
    body: { key: "keepinv_token" },
  });
  check("без VC товар не купить", poorBuy.status === 400, poorBuy.json);

  const anonBuy = await api("/api/shop/buy", { method: "POST", body: { key: "tp_pack" } });
  check("гость не покупает", anonBuy.status === 401);

  const buyTp = await api("/api/shop/buy", {
    method: "POST",
    cookie: shopBuyer.session,
    body: { key: "tp_pack" },
  });
  check("телепорты куплены", buyTp.json?.ok === true, buyTp.json);
  check("VC списаны по цене товара", buyTp.json?.balance === 2500, buyTp.json);

  const shopList = await api("/api/mc/shop?login=Shopper", { serverToken: TOKEN });
  const tpEntry = shopList.json?.items?.find((item) => item.key === "tp_pack");
  check("плагин видит покупку", tpEntry?.chargesLeft === 5, shopList.json);
  check("плагин знает возможность товара", tpEntry?.feature === "tp", tpEntry);

  const shopListNoToken = await api("/api/mc/shop?login=Shopper");
  check("магазин закрыт без токена сервера", shopListNoToken.status === 401);

  const buyTpAgain = await api("/api/shop/buy", {
    method: "POST",
    cookie: shopBuyer.session,
    body: { key: "tp_pack" },
  });
  check("докупка складывает заряды", buyTpAgain.json?.ok === true, buyTpAgain.json);
  const stacked = await api("/api/mc/shop?login=Shopper", { serverToken: TOKEN });
  check(
    "зарядов стало десять",
    stacked.json?.items?.find((item) => item.key === "tp_pack")?.chargesLeft === 10,
    stacked.json,
  );

  const use = await api("/api/mc/shop/use", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Shopper", key: "tp_pack" },
  });
  check("использование списывается", use.json?.status === "ok" && use.json?.chargesLeft === 9, use.json);

  const useNotOwned = await api("/api/mc/shop/use", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Alex", key: "tp_pack" },
  });
  check("нельзя потратить некупленное", useNotOwned.json?.status === "denied", useNotOwned.json);

  const lockedHome = await api("/api/shop/buy", {
    method: "POST",
    cookie: shopBuyer.session,
    body: { key: "home_point" },
  });
  check("товар с требованием уровня закрыт новичку", lockedHome.status === 400, lockedHome.json);

  const state = await api("/api/mc/shop/state", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Shopper", key: "tp_pack", data: { location: "world;1;2;3;0;0" } },
  });
  check("плагин сохраняет состояние товара", state.json?.status === "ok", state.json);

  const shopPage = await fetch(BASE + "/shop");
  const shopHtml = await shopPage.text();
  check("витрина открывается", shopHtml.includes("Телепорт к игроку"));

  console.log("— Пополнение —");
  const tooSmall = await api("/api/payments/create", {
    method: "POST",
    cookie: shopBuyer.session,
    body: { amountRub: 10, method: "СБП", contact: "@shopper" },
  });
  check("слишком маленькая сумма отклоняется", tooSmall.status === 400, tooSmall.json);

  const noContact = await api("/api/payments/create", {
    method: "POST",
    cookie: shopBuyer.session,
    body: { amountRub: 500, method: "СБП", contact: "" },
  });
  check("без контакта заявка не создаётся", noContact.status === 400, noContact.json);

  const request = await api("/api/payments/create", {
    method: "POST",
    cookie: shopBuyer.session,
    body: { amountRub: 500, method: "СБП", contact: "@shopper", comment: "перевод в 19:40" },
  });
  check("заявка создана", request.json?.ok === true, request.json);
  check("курс 1 ₽ = 2 VC", request.json?.vcAmount === 1000, request.json);

  const duplicate = await api("/api/payments/create", {
    method: "POST",
    cookie: shopBuyer.session,
    body: { amountRub: 100, method: "СБП", contact: "@shopper" },
  });
  check("вторая открытая заявка не создаётся", duplicate.status === 409, duplicate.json);

  const payApproveByPlayer = await api("/api/panel/payment", {
    method: "POST",
    cookie: alex.session,
    body: { paymentId: request.json.paymentId, action: "approve" },
  });
  check("игрок не одобряет пополнения", payApproveByPlayer.status === 403);

  const balanceBefore = (await api("/api/me", { cookie: shopBuyer.session })).json.balanceVc;
  const payApprove = await api("/api/panel/payment", {
    method: "POST",
    cookie: steve.session,
    body: { paymentId: request.json.paymentId, action: "approve", note: "перевод найден" },
  });
  check("chief одобряет заявку", payApprove.json?.status === "paid", payApprove.json);
  check("VC начислены по курсу", payApprove.json?.balance === balanceBefore + 1000, payApprove.json);

  const payApproveTwice = await api("/api/panel/payment", {
    method: "POST",
    cookie: steve.session,
    body: { paymentId: request.json.paymentId, action: "approve" },
  });
  check("повторное одобрение отклоняется", payApproveTwice.status === 409, payApproveTwice.json);

  const payRejected = await api("/api/payments/create", {
    method: "POST",
    cookie: shopBuyer.session,
    body: { amountRub: 300, method: "Карта", contact: "@shopper" },
  });
  const payReject = await api("/api/panel/payment", {
    method: "POST",
    cookie: steve.session,
    body: { paymentId: payRejected.json.paymentId, action: "reject", note: "перевод не найден" },
  });
  check("заявку можно отклонить", payReject.json?.status === "rejected", payReject.json);
  const afterReject = await api("/api/me", { cookie: shopBuyer.session });
  check("при отказе VC не начисляются", afterReject.json.balanceVc === balanceBefore + 1000, afterReject.json);

  console.log("— Управление сервером —");
  const serverByPlayer = await api("/api/panel/server", { cookie: alex.session });
  check("игрок не видит управление сервером", serverByPlayer.status === 403);

  const serverPowerByPlayer = await api("/api/panel/server", {
    method: "POST",
    cookie: alex.session,
    body: { action: "power", signal: "stop" },
  });
  check("игрок не выключает сервер", serverPowerByPlayer.status === 403);

  const badSignal = await api("/api/panel/server", {
    method: "POST",
    cookie: steve.session,
    body: { action: "power", signal: "explode" },
  });
  check("неизвестный сигнал отклоняется", badSignal.status === 400 || badSignal.status === 502, badSignal.json);

  console.log("— Доля медиапартнёра —");
  // Партнёр Streamer, игрок Fan привязывает его код и пополняет баланс.
  const streamer = await register("Streamer");
  const streamerMe = await api("/api/me", { cookie: streamer.session });
  const sharePromo = await api("/api/panel/promo", {
    method: "POST",
    cookie: steve.session,
    body: { code: "BLOG", partnerLogin: "Streamer", rewardVc: 500, requiredLevel: 3 },
  });
  check("промокод партнёра создан", sharePromo.json?.ok === true, sharePromo.json);

  const fan = await register("Fan", "password123", "BLOG");
  check("игрок привязал код при регистрации", fan.json?.promo === "BLOG", fan.json);

  const fanPayment = await api("/api/payments/create", {
    method: "POST",
    cookie: fan.session,
    body: { amountRub: 1000, method: "СБП", contact: "@fan" },
  });
  check("заявка реферала создана", fanPayment.json?.vcAmount === 2000, fanPayment.json);

  const streamerBefore = (await api("/api/me", { cookie: streamer.session })).json.balanceVc;
  const fanApprove = await api("/api/panel/payment", {
    method: "POST",
    cookie: steve.session,
    body: { paymentId: fanPayment.json.paymentId, action: "approve" },
  });
  check("пополнение реферала одобрено", fanApprove.json?.status === "paid", fanApprove.json);
  check("партнёру начислено 10%", fanApprove.json?.partnerShare?.amount === 200, fanApprove.json);

  const streamerAfter = await api("/api/me", { cookie: streamer.session });
  check(
    "доля дошла до баланса партнёра",
    streamerAfter.json.balanceVc === streamerBefore + 200,
    streamerAfter.json,
  );

  const ownPayment = await api("/api/payments/create", {
    method: "POST",
    cookie: streamer.session,
    body: { amountRub: 100, method: "СБП", contact: "@streamer" },
  });
  const ownApprove = await api("/api/panel/payment", {
    method: "POST",
    cookie: steve.session,
    body: { paymentId: ownPayment.json.paymentId, action: "approve" },
  });
  check("на своём пополнении партнёр долю не получает", ownApprove.json?.partnerShare === null, ownApprove.json);

  const beforeRejectShare = (await api("/api/me", { cookie: streamer.session })).json.balanceVc;
  const rejectedShare = await api("/api/payments/create", {
    method: "POST",
    cookie: fan.session,
    body: { amountRub: 200, method: "Карта", contact: "@fan" },
  });
  await api("/api/panel/payment", {
    method: "POST",
    cookie: steve.session,
    body: { paymentId: rejectedShare.json.paymentId, action: "reject" },
  });
  const afterRejectShare = await api("/api/me", { cookie: streamer.session });
  check(
    "за отклонённую заявку доли нет",
    afterRejectShare.json.balanceVc === beforeRejectShare,
    afterRejectShare.json,
  );

  console.log("— Заявления о разбане —");
  const banned = await register("Banned");
  const bannedMe = await api("/api/me", { cookie: banned.session });
  await api("/api/panel/punish", {
    method: "POST",
    cookie: steve.session,
    body: { userId: bannedMe.json.id, type: "BAN", reason: "тестовый бан", days: 30 },
  });

  const shortAppeal = await api("/api/appeals", {
    method: "POST",
    ip: "198.51.100.7",
    body: { login: "Banned", contact: "@banned", text: "разбаньте" },
  });
  check("короткое заявление отклоняется", shortAppeal.status === 400, shortAppeal.json);

  const appeal = await api("/api/appeals", {
    method: "POST",
    ip: "198.51.100.7",
    body: {
      login: "Banned",
      contact: "@banned",
      text: "Меня забанили за то, чего я не делал. Прошу пересмотреть решение и снять бан.",
    },
  });
  check("заявление принято без входа", appeal.json?.ok === true, appeal.json);

  const secondAppeal = await api("/api/appeals", {
    method: "POST",
    ip: "198.51.100.8",
    body: {
      login: "Banned",
      contact: "@banned",
      text: "Ещё одно заявление с тем же текстом, чтобы проверить защиту от дублей.",
    },
  });
  check("второе заявление по нику не принимается", secondAppeal.status === 400, secondAppeal.json);

  const appealByPlayer = await api("/api/panel/appeal", {
    method: "POST",
    cookie: alex.session,
    body: { appealId: appeal.json.appealId, approve: true },
  });
  check("helper не решает по разбанам", appealByPlayer.status === 403);

  const appealApprove = await api("/api/panel/appeal", {
    method: "POST",
    cookie: steve.session,
    body: { appealId: appeal.json.appealId, approve: true, note: "проверили логи, бан ошибочный" },
  });
  check("chief разбанивает", appealApprove.json?.status === "approved", appealApprove.json);
  check("бан снят", appealApprove.json?.liftedBans === 1, appealApprove.json);

  const appealLogin = await api("/api/mc/login", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Banned", password: "password123", ip: "203.0.113.240" },
  });
  check("после разбана вход в игру открыт", appealLogin.json?.status !== "banned", appealLogin.json);

  const appealTwice = await api("/api/panel/appeal", {
    method: "POST",
    cookie: steve.session,
    body: { appealId: appeal.json.appealId, approve: false },
  });
  check("повторное решение не проходит", appealTwice.status === 400, appealTwice.json);

  console.log("— Обнуление аккаунта —");
  const doomed = await register("Doomed");
  const doomedMe = await api("/api/me", { cookie: doomed.session });
  await api("/api/panel/balance", {
    method: "POST",
    cookie: steve.session,
    body: { userId: doomedMe.json.id, amount: 2000, reason: "перед обнулением" },
  });
  await api("/api/shop/buy", { method: "POST", cookie: doomed.session, body: { key: "tp_pack" } });
  await api("/api/mc/playtime", {
    method: "POST",
    serverToken: TOKEN,
    body: { entries: [{ login: "Doomed", seconds: 7200 }] },
  });

  const wipeByPlayer = await api("/api/panel/wipe", {
    method: "POST",
    cookie: alex.session,
    body: { userId: doomedMe.json.id, reason: "хочу", confirm: "Doomed" },
  });
  check("не-чиф не обнуляет аккаунты", wipeByPlayer.status === 403);

  const wipeNoConfirm = await api("/api/panel/wipe", {
    method: "POST",
    cookie: steve.session,
    body: { userId: doomedMe.json.id, reason: "тест", confirm: "не тот ник" },
  });
  check("без подтверждения ником обнуления нет", wipeNoConfirm.status === 400, wipeNoConfirm.json);

  const wipe = await api("/api/panel/wipe", {
    method: "POST",
    cookie: steve.session,
    body: { userId: doomedMe.json.id, reason: "дюп предметов", confirm: "Doomed", clearInventory: true },
  });
  check("аккаунт обнулён", wipe.json?.ok === true, wipe.json);

  const doomedAfter = await api("/api/me", { cookie: doomed.session });
  check("баланс обнулён", doomedAfter.json.balanceVc === 0, doomedAfter.json);
  check("время игры обнулено", doomedAfter.json.playtimeSec === 0, doomedAfter.json);

  const doomedShop = await api("/api/mc/shop?login=Doomed", { serverToken: TOKEN });
  check("покупки магазина сгорели", doomedShop.json?.items?.length === 0, doomedShop.json);

  const actions = await api("/api/mc/actions", { serverToken: TOKEN });
  const wipeAction = actions.json?.actions?.find((item) => item.login === "Doomed");
  check("плагин получил поручение очистить инвентарь", wipeAction?.kind === "WIPE_INVENTORY", actions.json);

  const actionsNoToken = await api("/api/mc/actions");
  check("поручения закрыты без токена сервера", actionsNoToken.status === 401);

  const ackAction = await api("/api/mc/actions", {
    method: "POST",
    serverToken: TOKEN,
    body: { ids: [wipeAction.id] },
  });
  check("исполнение подтверждается", ackAction.json?.marked === 1, ackAction.json);

  const actionsAgain = await api("/api/mc/actions", { serverToken: TOKEN });
  check(
    "исполненное поручение не повторяется",
    !actionsAgain.json?.actions?.some((item) => item.id === wipeAction.id),
    actionsAgain.json,
  );

  console.log("— Выход из аккаунта —");
  const guest = await register("Guest");
  const guestMe = await api("/api/me", { cookie: guest.session });
  check("сессия работает до выхода", guestMe.status === 200, guestMe.json);

  const logout = await api("/api/auth/logout", { method: "POST", cookie: guest.session });
  check("выход проходит", logout.json?.ok === true, logout.json);

  const afterLogout = await api("/api/me", { cookie: guest.session });
  check("после выхода сессия недействительна", afterLogout.status === 401, afterLogout.json);

  const backIn = await api("/api/auth/login", {
    method: "POST",
    ip: "203.0.113.201",
    body: { login: "Guest", password: "password123" },
  });
  check("вход в существующий аккаунт работает", backIn.status === 200, backIn.json);

  console.log("— Ссылка и баннер партнёра —");
  const refLink = await fetch(BASE + "/r/BLOG", { redirect: "manual" });
  check(
    "ссылка партнёра ведёт на регистрацию с кодом",
    refLink.status >= 300 && refLink.status < 400 &&
      (refLink.headers.get("location") ?? "").includes("promo=BLOG"),
    { status: refLink.status, location: refLink.headers.get("location") },
  );

  const refLower = await fetch(BASE + "/r/blog", { redirect: "manual" });
  check(
    "код из ссылки приводится к верхнему регистру",
    (refLower.headers.get("location") ?? "").includes("promo=BLOG"),
    refLower.headers.get("location"),
  );

  const registerPage = await fetch(BASE + "/register?promo=BLOG");
  const registerHtml = await registerPage.text();
  check("на регистрации код подставлен в поле", registerHtml.includes('value="BLOG"'), {
    status: registerPage.status,
  });

  const bannerAsset = await fetch(BASE + "/partners/banner-base.jpg");
  check(
    "макет баннера отдаётся сайтом",
    bannerAsset.status === 200 && (bannerAsset.headers.get("content-type") ?? "").includes("image"),
    { status: bannerAsset.status },
  );

  const fontAsset = await fetch(BASE + "/fonts/russo-one-cyrillic.woff2");
  check("шрифт баннера отдаётся сайтом", fontAsset.status === 200, { status: fontAsset.status });

  console.log("— Правка промокода —");
  const editable = await api("/api/panel/promo", {
    method: "POST",
    cookie: steve.session,
    body: { code: "EDITME", partnerLogin: "Streamer", rewardVc: 5000, requiredLevel: 3 },
  });
  check("промокод создан", editable.json?.ok === true, editable.json);

  const editByPlayer = await api("/api/panel/promo", {
    method: "PATCH",
    cookie: alex.session,
    body: { code: "EDITME", rewardVc: 1000 },
  });
  check("не-чиф не правит промокоды", editByPlayer.status === 403);

  const edited = await api("/api/panel/promo", {
    method: "PATCH",
    cookie: steve.session,
    body: { code: "EDITME", rewardVc: 1000, requiredLevel: 2 },
  });
  check("награда промокода правится", edited.json?.rewardVc === 1000, edited.json);
  check("уровень промокода правится", edited.json?.requiredLevel === 2, edited.json);

  const insane = await api("/api/panel/promo", {
    method: "PATCH",
    cookie: steve.session,
    body: { code: "EDITME", rewardVc: 999999 },
  });
  check("абсурдная награда отклоняется", insane.status === 400, insane.json);

  const switched = await api("/api/panel/promo", {
    method: "PATCH",
    cookie: steve.session,
    body: { code: "EDITME", active: false },
  });
  check("промокод выключается", switched.json?.active === false, switched.json);

  const missing = await api("/api/panel/promo", {
    method: "PATCH",
    cookie: steve.session,
    body: { code: "НЕТТАКОГО", rewardVc: 100 },
  });
  check("правка несуществующего кода отклоняется", missing.status === 404, missing.json);

  console.log("— Искры сезона —");
  const sparkUser = await register("Finder");
  const sparkBefore = await api("/api/me", { cookie: sparkUser.session });

  const sparkNoToken = await api("/api/mc/event/claim", {
    method: "POST",
    body: { login: "Finder", kind: "VC", amount: 100, sparkId: "s1" },
  });
  check("искра закрыта без токена сервера", sparkNoToken.status === 401);

  const sparkVc = await api("/api/mc/event/claim", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Finder", kind: "VC", amount: 120, sparkId: "s1" },
  });
  check("VC за искру начислены", sparkVc.json?.balance === sparkBefore.json.balanceVc + 120, sparkVc.json);

  const sparkShards = await api("/api/mc/event/claim", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Finder", kind: "SHARDS", amount: 300, sparkId: "s2" },
  });
  check("осколки за искру начислены", sparkShards.json?.shards === 300, sparkShards.json);

  const sparkTooBig = await api("/api/mc/event/claim", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Finder", kind: "VC", amount: 5000, sparkId: "s3" },
  });
  check("награда сверх потолка отклоняется", sparkTooBig.json?.status === "denied", sparkTooBig.json);

  const sparkBadKind = await api("/api/mc/event/claim", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Finder", kind: "DIAMONDS", amount: 10, sparkId: "s4" },
  });
  check("неизвестный вид награды отклоняется", sparkBadKind.status === 400, sparkBadKind.json);

  const sparkUnknown = await api("/api/mc/event/claim", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "НетТакого", kind: "VC", amount: 10, sparkId: "s5" },
  });
  check("искра для несуществующего игрока не начисляется", sparkUnknown.json?.status === "not_found", sparkUnknown.json);

  let limited = null;
  for (let i = 0; i < 14; i++) {
    limited = await api("/api/mc/event/claim", {
      method: "POST",
      serverToken: TOKEN,
      body: { login: "Finder", kind: "VC", amount: 5, sparkId: `loop-${i}` },
    });
  }
  check("серия искр упирается в часовой лимит", limited?.json?.status === "rate_limited", limited?.json);

  console.log("— Итог —");
  console.log(`Пройдено: ${passed}, провалено: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
