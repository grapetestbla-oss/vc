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

async function register(login, password = "password123") {
  const result = await api("/api/auth/register", {
    method: "POST",
    ip: `203.0.113.${++ipCounter}`,
    body: { login, email: `${login}@example.com`, password },
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
  check("промокод требует уровень аккаунта", lowLevel.json?.status === "level_too_low", lowLevel.json);

  await api("/api/panel/promo", {
    method: "POST",
    cookie: steve.session,
    body: { code: "OPEN", rewardVc: 500, requiredLevel: 0 },
  });
  const promoOk = await api("/api/mc/promo", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Alex", code: "OPEN" },
  });
  check("промокод начисляет 500 VC", promoOk.json?.status === "ok" && promoOk.json?.reward === 500, promoOk.json);

  const promoAgain = await api("/api/mc/promo", {
    method: "POST",
    serverToken: TOKEN,
    body: { login: "Alex", code: "OPEN" },
  });
  check("второй промокод не активируется", promoAgain.json?.status === "already_used");

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

  console.log("— Кейсы и игры —");
  const beforeCase = await api("/api/me", { cookie: steve.session });
  const opening = await api("/api/cases/open", {
    method: "POST",
    cookie: steve.session,
    body: { caseKey: "starter" },
  });
  check("кейс открывается", opening.status === 200 && Boolean(opening.json?.item), opening.json);
  check("кейс раскрывает fairness", typeof opening.json?.fairness?.serverSeedHash === "string");
  check(
    "цена кейса списана",
    opening.json?.balance === beforeCase.json.balanceVc - 100 + (opening.json?.rewardVc ?? 0),
    { before: beforeCase.json.balanceVc, after: opening.json?.balance, reward: opening.json?.rewardVc },
  );

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

  console.log("— Итог —");
  console.log(`Пройдено: ${passed}, провалено: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
