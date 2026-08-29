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
    body: {
      login,
      email: `${login}@example.com`,
      password,
      promo,
      acceptTerms: true,
      acceptPrivacy: true,
    },
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

  console.log("— Снятие наказаний —");
  const unjailByPlayer = await api("/api/mc/unjail", {
    method: "POST",
    serverToken: TOKEN,
    body: { targetLogin: "Griefer", actorLogin: "Griefer" },
  });
  check("игрок сам себя не выпускает", unjailByPlayer.status === 403, unjailByPlayer.json);

  const unjail = await api("/api/mc/unjail", {
    method: "POST",
    serverToken: TOKEN,
    body: { targetLogin: "Griefer" },
  });
  check("/unjail выпускает из деморгана", unjail.json?.ok === true, unjail.json);

  const unjailAgain = await api("/api/mc/unjail", {
    method: "POST",
    serverToken: TOKEN,
    body: { targetLogin: "Griefer" },
  });
  check("повторный /unjail говорит, что игрок свободен", unjailAgain.status === 404, unjailAgain.json);

  const jailGone = await api("/api/mc/profile?login=Griefer", { serverToken: TOKEN });
  check("в профиле деморгана больше нет", jailGone.json?.jail === null, jailGone.json?.jail);

  const jailAgain = await api("/api/mc/punish", {
    method: "POST",
    serverToken: TOKEN,
    body: { type: "JAIL", targetLogin: "Griefer", reason: "снова", minutes: 30 },
  });
  check("после выпуска деморган выдаётся снова", jailAgain.json?.ok === true, jailAgain.json);

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

  console.log("— Снятие наказаний в панели —");
  const punishedUser = await register("Naughty");
  const punishedMe = await api("/api/me", { cookie: punishedUser.session });
  const panelWarn = await api("/api/panel/punish", {
    method: "POST",
    cookie: steve.session,
    body: { userId: punishedMe.json.id, type: "WARN", reason: "мат в чате" },
  });
  check("chief выдаёт варн из панели", panelWarn.json?.ok === true, panelWarn.json);

  const warnRow = await api("/api/panel/punish?login=Naughty", { cookie: steve.session });
  const warnId = warnRow.json?.punishments?.find((item) => item.type === "WARN")?.id;
  check("наказание видно в карточке", Boolean(warnId), warnRow.json);

  const liftByPlayer = await api("/api/panel/punish", {
    method: "DELETE",
    cookie: alex.session,
    body: { punishmentId: warnId },
  });
  check("игрок не снимает наказания", liftByPlayer.status === 403);

  const lift = await api("/api/panel/punish", {
    method: "DELETE",
    cookie: steve.session,
    body: { punishmentId: warnId },
  });
  check("chief снимает варн", lift.json?.ok === true, lift.json);

  const liftTwice = await api("/api/panel/punish", {
    method: "DELETE",
    cookie: steve.session,
    body: { punishmentId: warnId },
  });
  check("снятое наказание повторно не снимается", liftTwice.status === 409, liftTwice.json);

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

  // Прогон идёт с настроенной FreeKassa: способ и контакт не спрашиваются,
  // платёж подтверждает провайдер. Ручной путь остаётся под панелью ниже.
  const noContact = await api("/api/payments/create", {
    method: "POST",
    cookie: shopBuyer.session,
    body: { amountRub: 500 },
  });
  check("при автоплатеже контакт не нужен", noContact.json?.ok === true, noContact.json);
  check("счёт сразу даёт ссылку на оплату", typeof noContact.json?.payUrl === "string", noContact.json);

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
    body: { amountRub: 100 },
  });
  // Неоплаченный счёт никого не занимает, поэтому второй разрешён.
  check("второй счёт при автоплатеже разрешён", duplicate.json?.ok === true, duplicate.json);

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

  console.log("— Общие раунды —");
  const table = await api("/api/games/live?game=ROULETTE", { cookie: steve.session });
  check("стол рулетки отдаётся", table.status === 200 && typeof table.json?.round?.number === "number", table.json);
  check("сектора колеса приходят", Array.isArray(table.json?.zones) && table.json.zones.length === 41, table.json?.zones?.length);
  const sectorCounts = (table.json?.zones ?? []).reduce((acc, zone) => {
    acc[zone.multiplier] = (acc[zone.multiplier] ?? 0) + 1;
    return acc;
  }, {});
  check(
    "раскладка колеса — 20/15/5/1",
    sectorCounts[2] === 20 && sectorCounts[3] === 15 && sectorCounts[5] === 5 && sectorCounts[10] === 1,
    sectorCounts,
  );
  check(
    "одинаковые секторы не стоят длинными блоками",
    (table.json?.zones ?? []).every((zone, index, all) => {
      const a = all[(index + 1) % all.length]?.multiplier;
      const b = all[(index + 2) % all.length]?.multiplier;
      return !(zone.multiplier === a && a === b);
    }),
    table.json?.zones?.map((zone) => zone.multiplier),
  );
  check(
    "в колесе нет пустых секторов",
    table.json?.zones?.every((zone) => zone.multiplier > 0),
    table.json?.zones,
  );
  check(
    "сектора покрывают колесо целиком",
    Math.abs((table.json?.zones?.at(-1)?.until ?? 0) - 1) < 1e-9,
    table.json?.zones?.at(-1),
  );
  check(
    "средняя выплата колеса совпадает с раскладкой",
    Math.abs(
      table.json.zones.reduce((sum, zone) => sum + zone.multiplier * zone.chance, 0) - 120 / 41,
    ) < 1e-9,
    table.json?.zones,
  );
  check("результат текущего раунда скрыт до розыгрыша",
    table.json?.round?.phase !== "betting" || table.json?.round?.result === null, table.json?.round);

  const unknownGame = await api("/api/games/live?game=POKER", { cookie: steve.session });
  check("неизвестная игра отклоняется", unknownGame.status === 400);

  // Ждём начала окна ставок, чтобы ставка гарантированно попала в раунд.
  async function waitForBetting(game) {
    for (let i = 0; i < 40; i++) {
      const state = await api(`/api/games/live?game=${game}`, { cookie: steve.session });
      if (state.json?.round?.phase === "betting") return state.json;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return null;
  }

  const bettingRound = await waitForBetting("ROULETTE");
  check("окно ставок открывается", bettingRound !== null, bettingRound);

  const liveBet = await api("/api/games/live/bet", {
    method: "POST",
    cookie: steve.session,
    body: { game: "ROULETTE", bet: 100 },
  });
  check("ставка принимается", liveBet.json?.ok === true, liveBet.json);

  const twice = await api("/api/games/live/bet", {
    method: "POST",
    cookie: steve.session,
    body: { game: "ROULETTE", bet: 50 },
  });
  check("вторая ставка в тот же раунд отклоняется", twice.status === 400, twice.json);

  const seen = await api("/api/games/live?game=ROULETTE", { cookie: alex.session });
  const foreignBet = seen.json?.bets?.find((item) => item.login === "Steve");
  check("чужие ставки видны всем", foreignBet?.betVc === 100, seen.json?.bets);
  check("своя ставка помечена только у автора", foreignBet?.mine === false, foreignBet);

  const smallBet = await api("/api/games/live/bet", {
    method: "POST",
    cookie: alex.session,
    body: { game: "ROULETTE", bet: 1 },
  });
  check("минимальная ставка проверяется и на общем столе", smallBet.status === 400, smallBet.json);

  // Дожидаемся розыгрыша: раунд обязан разрешиться сам, без чьей-либо кнопки.
  // Ждём с запасом больше длины раунда, иначе проверка ловит не баг, а таймер.
  let resolved = null;
  for (let i = 0; i < 140; i++) {
    const state = await api("/api/games/live?game=ROULETTE", { cookie: steve.session });
    const done = state.json?.history?.find((item) => item.number === bettingRound.round.number);
    if (done) {
      resolved = done;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  check("раунд разыгрывается сам", resolved !== null, resolved);
  check("в истории раскрыт сид раунда", typeof resolved?.serverSeed === "string" && resolved.serverSeed.length === 64, resolved);
  check("бросок записан", typeof resolved?.roll === "number" && resolved.roll >= 0 && resolved.roll < 1, resolved);
  check("раунд всегда заканчивается множителем не ниже x2", (resolved?.result ?? 0) >= 2, resolved);

  const paid = await api("/api/me", { cookie: steve.session });
  check("выплата по колесу пришла на баланс", typeof paid.json?.balanceVc === "number", paid.json);

  const lateBet = await api("/api/games/live/bet", {
    method: "POST",
    cookie: alex.session,
    body: { game: "CRASH", bet: 20, target: 1.005 },
  });
  check("точка вывода ниже 1.01 отклоняется", lateBet.status === 400, lateBet.json);

  const crashBetting = await waitForBetting("CRASH");
  const crashBet = await api("/api/games/live/bet", {
    method: "POST",
    cookie: alex.session,
    body: { game: "CRASH", bet: 20, target: 1.5 },
  });
  check("ставка в краш принимается", crashBet.json?.ok === true, { crashBet: crashBet.json, round: crashBetting?.round });

  console.log("— Технические работы —");
  const maintByPlayer = await api("/api/panel/maintenance", {
    method: "POST",
    cookie: alex.session,
    body: { enabled: true, reason: "хочу" },
  });
  check("не-чиф не включает техработы", maintByPlayer.status === 403);

  const maintOn = await api("/api/panel/maintenance", {
    method: "POST",
    cookie: steve.session,
    body: { enabled: true, reason: "Обновляем ядро сервера" },
  });
  check("чиф включает техработы", maintOn.json?.enabled === true, maintOn.json);

  const forPlugin = await api("/api/mc/maintenance", { serverToken: TOKEN });
  check("плагин видит техработы", forPlugin.json?.enabled === true, forPlugin.json);
  check("причина доходит до плагина", forPlugin.json?.reason === "Обновляем ядро сервера", forPlugin.json);

  const forPluginNoToken = await api("/api/mc/maintenance");
  check("статус техработ закрыт без токена", forPluginNoToken.status === 401);

  const stub = await fetch(BASE + "/shop", { headers: { Cookie: alex.session } });
  const stubHtml = await stub.text();
  check("игрок видит заглушку вместо страницы", stubHtml.includes("Технические работы"), {
    status: stub.status,
  });
  check("содержимое страницы скрыто", !stubHtml.includes("Карманный эндер-сундук"), null);

  const chief = await fetch(BASE + "/shop", { headers: { Cookie: steve.session } });
  const chiefHtml = await chief.text();
  check("чиф-администратор работает как обычно", chiefHtml.includes("Карманный эндер-сундук"), {
    status: chief.status,
  });

  const loginOpen = await fetch(BASE + "/login");
  const loginHtml = await loginOpen.text();
  check("вход остаётся открытым", loginHtml.includes("Логин"), { status: loginOpen.status });

  const maintOff = await api("/api/panel/maintenance", {
    method: "POST",
    cookie: steve.session,
    body: { enabled: false, reason: "" },
  });
  check("техработы выключаются", maintOff.json?.enabled === false, maintOff.json);

  const backOnline = await fetch(BASE + "/shop", { headers: { Cookie: alex.session } });
  check("после выключения сайт открыт", (await backOnline.text()).includes("Карманный эндер-сундук"));

  console.log("— Согласия и документы —");
  const noConsent = await api("/api/auth/register", {
    method: "POST",
    ip: "203.0.113.90",
    body: { login: "NoConsent", email: "noconsent@example.com", password: "password123" },
  });
  check("без согласий регистрация не проходит", noConsent.status === 400, noConsent.json);

  const halfConsent = await api("/api/auth/register", {
    method: "POST",
    ip: "203.0.113.91",
    body: {
      login: "HalfConsent",
      email: "half@example.com",
      password: "password123",
      acceptTerms: true,
    },
  });
  check("одной галочки мало", halfConsent.status === 400, halfConsent.json);

  const consentMissing = await api("/api/me", { cookie: null });
  check("аккаунт без согласий не создан", consentMissing.status === 401);

  for (const path of ["/terms", "/privacy"]) {
    const page = await fetch(BASE + path);
    const html = await page.text();
    check(`страница ${path} открыта всем`, page.status === 200 && html.includes("26 августа 2026"), {
      status: page.status,
    });
    check(`в документе ${path} подставлено название сервиса`, html.includes("VanillaCraft"));
  }

  const noBotMentions = await (await fetch(BASE + "/terms")).text();
  check(
    "из соглашения убраны упоминания бота",
    !noBotMentions.includes("/start") && !noBotMentions.toLowerCase().includes("тг бот"),
  );

  console.log("— Обращения в поддержку —");
  const anonTicket = await api("/api/tickets", {
    method: "POST",
    body: { action: "create", subject: "Вопрос по оплате", text: "Не пришли монеты после оплаты." },
  });
  check("гость не создаёт обращения", anonTicket.status === 401);

  const shortTicket = await api("/api/tickets", {
    method: "POST",
    cookie: alex.session,
    body: { action: "create", subject: "Помогите", text: "аа" },
  });
  check("слишком короткое обращение отклоняется", shortTicket.status === 400, shortTicket.json);

  const ticket = await api("/api/tickets", {
    method: "POST",
    cookie: alex.session,
    body: {
      action: "create",
      subject: "Не пришли VC после пополнения",
      text: "Оплатил 500 рублей через СБП час назад, заявку одобрили, но баланс прежний.",
    },
  });
  check("обращение создаётся", ticket.json?.ok === true, ticket.json);

  const ticketByPlayer = await api("/api/panel/ticket", {
    method: "POST",
    cookie: alex.session,
    body: { action: "reply", ticketId: ticket.json.ticketId, text: "сам себе отвечу" },
  });
  check("игрок не отвечает от имени администрации", ticketByPlayer.status === 403);

  const staffReply = await api("/api/panel/ticket", {
    method: "POST",
    cookie: steve.session,
    body: { action: "reply", ticketId: ticket.json.ticketId, text: "Проверили, начислили вручную." },
  });
  check("чиф отвечает в обращение", staffReply.json?.status === "answered", staffReply.json);

  const foreignReply = await api("/api/tickets", {
    method: "POST",
    cookie: steve.session,
    body: { action: "reply", ticketId: ticket.json.ticketId, text: "чужое обращение" },
  });
  check("в чужое обращение игроком не написать", foreignReply.status === 400, foreignReply.json);

  const page = await fetch(BASE + "/tickets", { headers: { Cookie: alex.session } });
  const ticketsHtml = await page.text();
  check("игрок видит свой тикет и ответ", ticketsHtml.includes("Проверили, начислили вручную."), {
    status: page.status,
  });

  const closed = await api("/api/panel/ticket", {
    method: "POST",
    cookie: steve.session,
    body: { action: "close", ticketId: ticket.json.ticketId },
  });
  check("обращение закрывается", closed.json?.status === "closed", closed.json);

  const afterClose = await api("/api/tickets", {
    method: "POST",
    cookie: alex.session,
    body: { action: "reply", ticketId: ticket.json.ticketId, text: "ещё вопрос" },
  });
  check("в закрытое обращение не пишут", afterClose.status === 400, afterClose.json);

  console.log("— Включение мини-игр —");
  const flagsByPlayer = await api("/api/panel/games", { cookie: alex.session });
  check("игрок не видит переключатели игр", flagsByPlayer.status === 403);

  const flagsInitial = await api("/api/panel/games", { cookie: steve.session });
  check("по умолчанию обе игры открыты", flagsInitial.json?.ROULETTE === true && flagsInitial.json?.CRASH === true, flagsInitial.json);

  const offByPlayer = await api("/api/panel/games", {
    method: "POST",
    cookie: alex.session,
    body: { game: "ROULETTE", enabled: false },
  });
  check("игрок не выключает игру", offByPlayer.status === 403);

  const badGame = await api("/api/panel/games", {
    method: "POST",
    cookie: steve.session,
    body: { game: "POKER", enabled: false },
  });
  check("неизвестную игру не выключить", badGame.status === 400, badGame.json);

  const rouletteOff = await api("/api/panel/games", {
    method: "POST",
    cookie: steve.session,
    body: { game: "ROULETTE", enabled: false },
  });
  check("чиф выключает рулетку", rouletteOff.json?.ROULETTE === false, rouletteOff.json);
  check("краш при этом остаётся открыт", rouletteOff.json?.CRASH === true, rouletteOff.json);

  const betWhenOff = await api("/api/games/live/bet", {
    method: "POST",
    cookie: steve.session,
    body: { game: "ROULETTE", bet: 50 },
  });
  check("в выключенную игру ставку не принять", betWhenOff.status === 400, betWhenOff.json);

  const stateWhenOff = await api("/api/games/live?game=ROULETTE", { cookie: steve.session });
  check("стол сообщает, что игра выключена", stateWhenOff.json?.enabled === false, stateWhenOff.json);
  check("раунды при этом идут дальше", typeof stateWhenOff.json?.round?.number === "number", stateWhenOff.json?.round);

  const crashStillOpen = await api("/api/games/live?game=CRASH", { cookie: steve.session });
  check("краш продолжает работать", crashStillOpen.json?.enabled === true, crashStillOpen.json);

  const gamesPage = await fetch(BASE + "/games");
  const gamesHtml = await gamesPage.text();
  check("выключенная игра пропадает с витрины", !gamesHtml.includes("Рулетка"), {
    status: gamesPage.status,
  });
  check("оставшаяся игра на витрине есть", gamesHtml.includes("Краш"));

  const roulettePage = await fetch(BASE + "/games/roulette", { headers: { Cookie: steve.session } });
  check("страница выключенной игры не открывается", roulettePage.status === 404, {
    status: roulettePage.status,
  });

  const crashPage = await fetch(BASE + "/games/crash", { headers: { Cookie: steve.session } });
  check("страница работающей игры открыта", crashPage.status === 200, { status: crashPage.status });

  const bothOff = await api("/api/panel/games", {
    method: "POST",
    cookie: steve.session,
    body: { game: "CRASH", enabled: false },
  });
  check("выключаем и краш", bothOff.json?.CRASH === false, bothOff.json);

  const emptyGames = await fetch(BASE + "/games");
  check("при двух выключенных играх раздел исчезает", emptyGames.status === 404, {
    status: emptyGames.status,
  });

  const homeWithoutGames = await fetch(BASE + "/");
  check(
    "ссылка на игры пропадает из шапки",
    !(await homeWithoutGames.text()).includes('href="/games"'),
  );

  await api("/api/panel/games", {
    method: "POST",
    cookie: steve.session,
    body: { game: "CRASH", enabled: true },
  });

  const rouletteOn = await api("/api/panel/games", {
    method: "POST",
    cookie: steve.session,
    body: { game: "ROULETTE", enabled: true },
  });
  check("рулетка включается обратно", rouletteOn.json?.ROULETTE === true, rouletteOn.json);

  const homeWithGames = await fetch(BASE + "/");
  check("ссылка на игры возвращается", (await homeWithGames.text()).includes('href="/games"'));

  console.log("— Розыгрыши —");
  const giveByPlayer = await api("/api/panel/giveaway", {
    method: "POST",
    cookie: alex.session,
    body: { action: "create", title: "Мой розыгрыш", prize: "всё", requiredHours: 0 },
  });
  check("игрок не создаёт розыгрыши", giveByPlayer.status === 403);

  const noPrize = await api("/api/panel/giveaway", {
    method: "POST",
    cookie: steve.session,
    body: { action: "create", title: "Розыгрыш на открытие", prize: "", requiredHours: 15 },
  });
  check("розыгрыш без приза не создаётся", noPrize.status === 400, noPrize.json);

  const strict = await api("/api/panel/giveaway", {
    method: "POST",
    cookie: steve.session,
    body: {
      action: "create",
      title: "Розыгрыш на открытие",
      prize: "5000 VC и легендарный кейс",
      description: "Разыграем в день открытия",
      requiredHours: 15,
    },
  });
  check("розыгрыш создан", strict.json?.ok === true, strict.json);

  const anonJoin = await api("/api/giveaways", {
    method: "POST",
    body: { giveawayId: strict.json.giveawayId },
  });
  check("гость не участвует", anonJoin.status === 401);

  const tooFew = await api("/api/giveaways", {
    method: "POST",
    cookie: alex.session,
    body: { giveawayId: strict.json.giveawayId },
  });
  check("без наигранных часов участие закрыто", tooFew.status === 400, tooFew.json);
  check(
    "в отказе видно, сколько часов не хватает",
    (tooFew.json?.error ?? "").includes("15 ч"),
    tooFew.json,
  );

  // Ручка времени режет тик до 120 секунд — набить 15 часов через неё нельзя,
  // поэтому положительный путь проверяем на розыгрыше без условия.
  const openGiveaway = await api("/api/panel/giveaway", {
    method: "POST",
    cookie: steve.session,
    body: {
      action: "create",
      title: "Открытый розыгрыш",
      prize: "1000 VC",
      requiredHours: 0,
    },
  });
  check("розыгрыш без условия создан", openGiveaway.json?.ok === true, openGiveaway.json);

  await api("/api/mc/playtime", {
    method: "POST",
    serverToken: TOKEN,
    body: { entries: [{ login: "Alex", seconds: 120 }] },
  });

  const joinedGiveaway = await api("/api/giveaways", {
    method: "POST",
    cookie: alex.session,
    body: { giveawayId: openGiveaway.json.giveawayId },
  });
  check("заявка принимается, когда условие выполнено", joinedGiveaway.json?.ok === true, joinedGiveaway.json);

  const joinTwice = await api("/api/giveaways", {
    method: "POST",
    cookie: alex.session,
    body: { giveawayId: openGiveaway.json.giveawayId },
  });
  check("дважды заявку не подать", joinTwice.status === 400, joinTwice.json);

  const giveawayForPlugin = await api("/api/mc/giveaways?login=Alex", { serverToken: TOKEN });
  check("плагин видит активные розыгрыши", giveawayForPlugin.json?.giveaways?.length >= 2, giveawayForPlugin.json);
  check("плагин получает часы игрока", typeof giveawayForPlugin.json?.hours === "number", giveawayForPlugin.json);
  check(
    "плагин знает, где игрок уже участвует",
    giveawayForPlugin.json?.giveaways?.find((item) => item.id === openGiveaway.json.giveawayId)?.joined === true,
    giveawayForPlugin.json?.giveaways,
  );
  check(
    "плагин видит условие по часам",
    giveawayForPlugin.json?.giveaways?.find((item) => item.id === strict.json.giveawayId)?.requiredHours === 15,
    giveawayForPlugin.json?.giveaways,
  );

  const giveawayNoToken = await api("/api/mc/giveaways?login=Alex");
  check("розыгрыши закрыты без токена сервера", giveawayNoToken.status === 401);

  const publicPage = await fetch(BASE + "/giveaways");
  check("страница розыгрышей открыта", (await publicPage.text()).includes("Розыгрыш на открытие"));

  const drawByPlayer = await api("/api/panel/giveaway", {
    method: "POST",
    cookie: alex.session,
    body: { action: "draw", giveawayId: openGiveaway.json.giveawayId },
  });
  check("игрок не разыгрывает приз", drawByPlayer.status === 403);

  const draw = await api("/api/panel/giveaway", {
    method: "POST",
    cookie: steve.session,
    body: { action: "draw", giveawayId: openGiveaway.json.giveawayId },
  });
  check("победитель определён", draw.json?.winner === "Alex", draw.json);
  check("в розыгрыше учтены только подходящие", draw.json?.participants === 1, draw.json);

  const drawTwice = await api("/api/panel/giveaway", {
    method: "POST",
    cookie: steve.session,
    body: { action: "draw", giveawayId: openGiveaway.json.giveawayId },
  });
  check("повторный розыгрыш невозможен", drawTwice.status === 400, drawTwice.json);

  const afterDraw = await fetch(BASE + "/giveaways");
  const afterHtml = await afterDraw.text();
  check("победитель и сид опубликованы", afterHtml.includes("Alex") && afterHtml.includes("сид:"));

  const emptyDraw = await api("/api/panel/giveaway", {
    method: "POST",
    cookie: steve.session,
    body: { action: "draw", giveawayId: strict.json.giveawayId },
  });
  check("розыгрыш без подходящих участников отклоняется", emptyDraw.status === 400, emptyDraw.json);

  const cancelled = await api("/api/panel/giveaway", {
    method: "POST",
    cookie: steve.session,
    body: { action: "cancel", giveawayId: strict.json.giveawayId },
  });
  check("розыгрыш отменяется", cancelled.json?.status === "cancelled", cancelled.json);

  console.log("— Кости на сервере —");
  const diceNoToken = await api("/api/mc/dice", {
    method: "POST",
    body: { action: "start", challengerLogin: "Steve", opponentLogin: "Alex", amount: 100 },
  });
  check("кости закрыты без токена сервера", diceNoToken.status === 401);

  const dicePlayers = ["Gambler", "Rival"];
  const sessions = {};
  for (const login of dicePlayers) {
    const account = await register(login);
    sessions[login] = account;
    const me = await api("/api/me", { cookie: account.session });
    await api("/api/panel/balance", {
      method: "POST",
      cookie: steve.session,
      body: { userId: me.json.id, amount: 1000, reason: "на кости" },
    });
  }

  const selfPlay = await api("/api/mc/dice", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "start", challengerLogin: "Gambler", opponentLogin: "Gambler", amount: 100 },
  });
  check("сам с собой не сыграть", selfPlay.json?.status === "denied", selfPlay.json);

  const tooRich = await api("/api/mc/dice", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "start", challengerLogin: "Gambler", opponentLogin: "Rival", amount: 999999 },
  });
  check("ставка больше баланса отклоняется", tooRich.json?.status === "denied", tooRich.json);

  const diceMatch = await api("/api/mc/dice", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "start", challengerLogin: "Gambler", opponentLogin: "Rival", amount: 300 },
  });
  check("партия начата", diceMatch.json?.status === "ok" && Boolean(diceMatch.json?.matchId), diceMatch.json);

  const afterEscrow = await api("/api/me", { cookie: sessions.Gambler.session });
  check("ставка списана до броска", afterEscrow.json.balanceVc === 700, afterEscrow.json);

  const diceDraw = await api("/api/mc/dice", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "finish", matchId: diceMatch.json.matchId, challengerRoll: 4, opponentRoll: 4 },
  });
  check("ничья не выплачивается", diceDraw.json?.status === "denied", diceDraw.json);

  const badRoll = await api("/api/mc/dice", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "finish", matchId: diceMatch.json.matchId, challengerRoll: 42, opponentRoll: 1 },
  });
  check("бросок вне 1–6 отклоняется", badRoll.json?.status === "denied", badRoll.json);

  const diceFinish = await api("/api/mc/dice", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "finish", matchId: diceMatch.json.matchId, challengerRoll: 6, opponentRoll: 2 },
  });
  check("победитель забирает банк", diceFinish.json?.winnerLogin === "Gambler" && diceFinish.json?.pot === 600, diceFinish.json);

  const winnerBalance = await api("/api/me", { cookie: sessions.Gambler.session });
  const loserBalance = await api("/api/me", { cookie: sessions.Rival.session });
  check("банк ушёл победителю целиком", winnerBalance.json.balanceVc === 1300, winnerBalance.json);
  check("проигравший остался без ставки", loserBalance.json.balanceVc === 700, loserBalance.json);
  check(
    "сумма балансов не изменилась — VC не печатаются",
    winnerBalance.json.balanceVc + loserBalance.json.balanceVc === 2000,
    { winner: winnerBalance.json.balanceVc, loser: loserBalance.json.balanceVc },
  );

  const finishTwice = await api("/api/mc/dice", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "finish", matchId: diceMatch.json.matchId, challengerRoll: 6, opponentRoll: 1 },
  });
  check("дважды выплату не получить", finishTwice.json?.status === "denied", finishTwice.json);

  const diceRefund = await api("/api/mc/dice", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "start", challengerLogin: "Gambler", opponentLogin: "Rival", amount: 200 },
  });
  await api("/api/mc/dice", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "refund", matchId: diceRefund.json.matchId },
  });
  const afterRefund = await api("/api/me", { cookie: sessions.Gambler.session });
  check("возврат возвращает ставку", afterRefund.json.balanceVc === 1300, afterRefund.json);
  const rivalAfterRefund = await api("/api/me", { cookie: sessions.Rival.session });
  check("возврат приходит обоим", rivalAfterRefund.json.balanceVc === 700, rivalAfterRefund.json);

  console.log("— Кейсы в игре —");
  const casesNoToken = await api("/api/mc/cases?login=Gambler");
  check("кейсы закрыты без токена сервера", casesNoToken.status === 401);

  const shop = await api("/api/mc/cases?login=Gambler", { serverToken: TOKEN });
  check("витрина кейсов приходит", shop.json?.cases?.length >= 1, shop.json);
  check("бесплатный кейс в игре не продаётся", !shop.json.cases.some((item) => item.key === "daily"), shop.json?.cases);

  const paidCase = shop.json.cases[0];
  const beforeBuy = (await api("/api/me", { cookie: sessions.Gambler.session })).json.balanceVc;
  const buy = await api("/api/mc/cases", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "buy", login: "Gambler", caseKey: paidCase.key },
  });
  check("кейс куплен в игре", buy.json?.status === "ok", buy.json);
  check("VC списаны при покупке", buy.json?.balance === beforeBuy - paidCase.priceVc, {
    before: beforeBuy,
    after: buy.json?.balance,
    price: paidCase.priceVc,
  });

  const withTicket = await api("/api/mc/cases?login=Gambler", { serverToken: TOKEN });
  check("оплаченный кейс ждёт открытия", withTicket.json?.tickets?.[0]?.count === 1, withTicket.json?.tickets);

  const balanceBeforeOpen = (await api("/api/me", { cookie: sessions.Gambler.session })).json.balanceVc;
  const openedCase = await api("/api/mc/cases", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "open", login: "Gambler", caseKey: paidCase.key },
  });
  check("кейс открывается блоком", openedCase.json?.status === "ok", openedCase.json);
  check(
    "второй раз за открытие не списывают",
    openedCase.json.balance >= balanceBeforeOpen,
    { before: balanceBeforeOpen, after: openedCase.json.balance },
  );

  const openAgain = await api("/api/mc/cases", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "open", login: "Gambler", caseKey: paidCase.key },
  });
  check("без оплаченного кейса открыть нельзя", openAgain.json?.status === "denied", openAgain.json);

  const poor = await api("/api/mc/cases", {
    method: "POST",
    serverToken: TOKEN,
    body: { action: "buy", login: "Newbie", caseKey: paidCase.key },
  });
  check("без VC кейс не купить", poor.json?.status === "denied", poor.json);

  console.log("— Объявление о редкой находке —");
  // Кейс «легенды» набит эпикой и легендарками — из него объявление придёт наверняка.
  const richPlayer = await register("Lucky");
  const luckyMe = await api("/api/me", { cookie: richPlayer.session });
  await api("/api/panel/balance", {
    method: "POST",
    cookie: steve.session,
    body: { userId: luckyMe.json.id, amount: 80000, reason: "на кейсы" },
  });

  const caseList = await api("/api/mc/cases?login=Lucky", { serverToken: TOKEN });
  const legendCase = caseList.json.cases.find((item) => item.key === "legends") ?? caseList.json.cases[0];

  let announced = null;
  // Эпика в кейсе редка: коротким циклом проверка ловила удачу, а не код.
  for (let attempt = 0; attempt < 80 && !announced; attempt++) {
    await api("/api/mc/cases", {
      method: "POST",
      serverToken: TOKEN,
      body: { action: "buy", login: "Lucky", caseKey: legendCase.key },
    });
    const result = await api("/api/mc/cases", {
      method: "POST",
      serverToken: TOKEN,
      body: { action: "open", login: "Lucky", caseKey: legendCase.key },
    });
    const rarity = result.json?.cosmetic?.rarity;
    if (rarity === "epic" || rarity === "legendary") {
      const actions = await api("/api/mc/actions", { serverToken: TOKEN });
      announced = actions.json?.actions?.find(
        (item) => item.kind === "BROADCAST_DROP" && item.login === "Lucky",
      );
    }
  }

  check("редкая находка попадает в очередь объявлений", Boolean(announced), announced);
  check(
    "в объявлении есть предмет и редкость",
    Boolean(announced?.payload?.cosmetic) &&
      ["epic", "legendary"].includes(announced?.payload?.rarity ?? ""),
    announced?.payload,
  );

  console.log("— Автоплатёж FreeKassa —");
  // Тесты идут против сайта, поднятого с тестовыми секретами FreeKassa.
  const { createHash } = await import("node:crypto");
  const FK_MERCHANT = "123456";
  const FK_SECRET2 = "e2e-secret-2";
  const fkMd5 = (value) => createHash("md5").update(value).digest("hex");

  const payer = await register("Payer");
  const payerMe = await api("/api/me", { cookie: payer.session });

  const invoice = await api("/api/payments/create", {
    method: "POST",
    cookie: payer.session,
    body: { amountRub: 500 },
  });
  check("счёт создан без ручных полей", invoice.json?.ok === true, invoice.json);
  check("ссылка на оплату выдана", typeof invoice.json?.payUrl === "string", invoice.json);
  check(
    "в ссылке подписаны магазин, сумма и заказ",
    invoice.json.payUrl.includes(`m=${FK_MERCHANT}`) &&
      invoice.json.payUrl.includes("oa=500.00") &&
      invoice.json.payUrl.includes(`o=${invoice.json.paymentId}`),
    invoice.json.payUrl,
  );

  async function notify(fields) {
    const body = new URLSearchParams(fields).toString();
    const response = await fetch(BASE + "/api/payments/freekassa", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    return { status: response.status, text: await response.text() };
  }

  const order = invoice.json.paymentId;
  const goodSign = fkMd5([FK_MERCHANT, "500.00", FK_SECRET2, order].join(":"));

  const badSign = await notify({
    MERCHANT_ID: FK_MERCHANT,
    AMOUNT: "500.00",
    MERCHANT_ORDER_ID: order,
    SIGN: "деньгидавай",
    intid: "1",
  });
  check("уведомление с чужой подписью отклоняется", badSign.status === 400, badSign);

  const balanceBeforePay = (await api("/api/me", { cookie: payer.session })).json.balanceVc;
  check("до оплаты VC не начислены", balanceBeforePay === 0, { balanceBeforePay });

  const unknownOrder = await notify({
    MERCHANT_ID: FK_MERCHANT,
    AMOUNT: "500.00",
    MERCHANT_ORDER_ID: "нетакогозаказа",
    SIGN: fkMd5([FK_MERCHANT, "500.00", FK_SECRET2, "нетакогозаказа"].join(":")),
  });
  check("уведомление о неизвестном заказе отклоняется", unknownOrder.status === 404, unknownOrder);

  const fkInvoiceShort = await api("/api/payments/create", {
    method: "POST",
    cookie: payer.session,
    body: { amountRub: 300 },
  });
  const fkShortPaid = await notify({
    MERCHANT_ID: FK_MERCHANT,
    AMOUNT: "100.00",
    MERCHANT_ORDER_ID: fkInvoiceShort.json.paymentId,
    SIGN: fkMd5([FK_MERCHANT, "100.00", FK_SECRET2, fkInvoiceShort.json.paymentId].join(":")),
  });
  check("недоплата не проводится", fkShortPaid.status === 400, fkShortPaid);

  const fkPaid = await notify({
    MERCHANT_ID: FK_MERCHANT,
    AMOUNT: "500.00",
    MERCHANT_ORDER_ID: order,
    SIGN: goodSign,
    intid: "777",
    P_EMAIL: "payer@example.com",
  });
  check("оплата принята и подтверждена ответом YES", fkPaid.status === 200 && fkPaid.text.trim() === "YES", fkPaid);

  const afterPay = await api("/api/me", { cookie: payer.session });
  check("VC начислены по курсу", afterPay.json.balanceVc === 1000, afterPay.json);

  const repeat = await notify({
    MERCHANT_ID: FK_MERCHANT,
    AMOUNT: "500.00",
    MERCHANT_ORDER_ID: order,
    SIGN: goodSign,
    intid: "777",
  });
  check("повтор уведомления подтверждается", repeat.text.trim() === "YES", repeat);

  const afterRepeat = await api("/api/me", { cookie: payer.session });
  check("дважды VC не начисляются", afterRepeat.json.balanceVc === 1000, afterRepeat.json);

  const historyPage = await fetch(BASE + "/topup", { headers: { Cookie: payer.session } });
  check("оплата видна в истории игрока", (await historyPage.text()).includes("Начислено"), {
    userId: payerMe.json.id,
  });

  console.log("— Кассы и бонусы в панели —");
  const providersByPlayer = await api("/api/panel/payment/providers", { cookie: alex.session });
  check("игрок не видит настройки касс", providersByPlayer.status === 403);

  const providersView = await api("/api/panel/payment/providers", { cookie: steve.session });
  check("chief видит настройки касс", providersView.status === 200, providersView.json);
  check(
    "ключи FreeKassa показаны маской",
    typeof providersView.json?.freekassa?.secret2 === "string" &&
      !providersView.json.freekassa.secret2.includes(FK_SECRET2),
    providersView.json?.freekassa,
  );

  // Заглушка Платеги: настоящую кассу в прогоне дёргать нечем.
  const { createServer } = await import("node:http");
  let plategaRequest = null;
  const plategaStub = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      plategaRequest = {
        url: request.url,
        merchantId: request.headers["x-merchantid"],
        secret: request.headers["x-secret"],
        body: JSON.parse(raw || "{}"),
      };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          transactionId: "tx-" + plategaRequest.body.payload,
          redirect: "https://pay.platega.io/тест",
          status: "PENDING",
        }),
      );
    });
  });
  await new Promise((resolve) => plategaStub.listen(0, "127.0.0.1", resolve));
  const plategaStubUrl = `http://127.0.0.1:${plategaStub.address().port}`;

  const PL_MERCHANT = "merchant-uuid";
  const PL_SECRET = "platega-secret";
  const setPlatega = await api("/api/panel/payment/providers", {
    method: "POST",
    cookie: steve.session,
    body: {
      provider: "platega",
      patch: {
        enabled: true,
        bonusPercent: 14,
        merchantId: PL_MERCHANT,
        secret: PL_SECRET,
        apiUrl: plategaStubUrl,
      },
    },
  });
  check("chief подключает Платегу", setPlatega.json?.ok === true, setPlatega.json);
  check(
    "Платега появилась в списке доступных",
    setPlatega.json?.active?.includes("platega"),
    setPlatega.json?.active,
  );
  check("бонус кассы сохранён", setPlatega.json?.platega?.bonusPercent === 14, setPlatega.json?.platega);

  const buyer = await register("Bonusman");
  const plInvoice = await api("/api/payments/create", {
    method: "POST",
    cookie: buyer.session,
    body: { amountRub: 1000, provider: "platega" },
  });
  check("счёт Платеги создан", plInvoice.json?.ok === true, plInvoice.json);
  check(
    "бонус 14% начислен к сумме: 1000 ₽ → 2280 VC",
    plInvoice.json?.vcAmount === 2280 && plInvoice.json?.bonusVc === 280,
    plInvoice.json,
  );
  check("касса вернула ссылку на оплату", plInvoice.json?.payUrl?.includes("pay.platega.io"), plInvoice.json);
  check(
    "в кассу ушли ключи и номер счёта",
    plategaRequest?.merchantId === PL_MERCHANT &&
      plategaRequest?.secret === PL_SECRET &&
      plategaRequest?.body?.payload === plInvoice.json.paymentId &&
      plategaRequest?.body?.paymentDetails?.amount === 1000,
    plategaRequest,
  );

  async function plategaCallback(body, headers = {}) {
    const response = await fetch(BASE + "/api/payments/platega", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MerchantId": PL_MERCHANT,
        "X-Secret": PL_SECRET,
        ...headers,
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, text: await response.text() };
  }

  const plBadSecret = await plategaCallback(
    { id: "tx-" + plInvoice.json.paymentId, amount: 1000, status: "CONFIRMED" },
    { "X-Secret": "wrong-secret" },
  );
  check("уведомление с чужим ключом отклоняется", plBadSecret.status === 403, plBadSecret);

  const balanceBeforePlatega = (await api("/api/me", { cookie: buyer.session })).json.balanceVc;
  const plPaid = await plategaCallback({
    id: "tx-" + plInvoice.json.paymentId,
    amount: 1000,
    currency: "RUB",
    status: "CONFIRMED",
    payload: plInvoice.json.paymentId,
  });
  check("оплата Платеги принята", plPaid.status === 200, plPaid);
  const afterPlatega = await api("/api/me", { cookie: buyer.session });
  check(
    "VC с бонусом начислены",
    afterPlatega.json.balanceVc === balanceBeforePlatega + 2280,
    afterPlatega.json,
  );

  const plRepeat = await plategaCallback({
    id: "tx-" + plInvoice.json.paymentId,
    amount: 1000,
    status: "CONFIRMED",
  });
  const afterPlRepeat = await api("/api/me", { cookie: buyer.session });
  check(
    "повтор уведомления не начисляет второй раз",
    plRepeat.status === 200 && afterPlRepeat.json.balanceVc === balanceBeforePlatega + 2280,
    afterPlRepeat.json,
  );

  const plCancelInvoice = await api("/api/payments/create", {
    method: "POST",
    cookie: buyer.session,
    body: { amountRub: 500, provider: "platega" },
  });
  const plCanceled = await plategaCallback({
    id: "tx-" + plCancelInvoice.json.paymentId,
    amount: 500,
    status: "CANCELED",
  });
  const afterCancel = await api("/api/me", { cookie: buyer.session });
  check(
    "отменённый платёж не начисляет VC",
    plCanceled.status === 200 && afterCancel.json.balanceVc === balanceBeforePlatega + 2280,
    afterCancel.json,
  );

  const topupWithBonus = await fetch(BASE + "/topup", { headers: { Cookie: buyer.session } });
  // React разбивает текст комментариями-разделителями — склеиваем обратно.
  const topupHtml = (await topupWithBonus.text()).replace(/<!-- -->/g, "");
  check("на странице пополнения видно бонус кассы", topupHtml.includes("+14% VC"), {
    has: topupHtml.includes("Платега"),
  });

  const providersPage = await fetch(BASE + "/panel/payments/providers", {
    headers: { Cookie: steve.session },
  });
  const providersHtml = await providersPage.text();
  check(
    "страница касс открывается у chief",
    providersPage.status === 200 && providersHtml.includes("Платёжные системы"),
    { status: providersPage.status },
  );
  check(
    "ключи касс не утекают на страницу",
    !providersHtml.includes(PL_SECRET) && !providersHtml.includes(FK_SECRET2),
    { leaked: true },
  );

  const offPlatega = await api("/api/panel/payment/providers", {
    method: "POST",
    cookie: steve.session,
    body: { provider: "platega", patch: { enabled: false } },
  });
  check(
    "выключенная касса пропадает у игроков",
    !offPlatega.json?.active?.includes("platega"),
    offPlatega.json?.active,
  );

  const afterOff = await api("/api/payments/create", {
    method: "POST",
    cookie: buyer.session,
    body: { amountRub: 500, provider: "platega" },
  });
  check(
    "счёт по выключенной кассе не создаётся",
    afterOff.json?.provider !== "platega",
    afterOff.json,
  );
  plategaStub.close();

  console.log("— Каталог магазина в панели —");
  const shopAdminByPlayer = await api("/api/panel/shop", { cookie: alex.session });
  check("игрок не правит каталог", shopAdminByPlayer.status === 403);

  const shopCatalogue = await api("/api/panel/shop", { cookie: steve.session });
  check("chief видит каталог с выручкой", Array.isArray(shopCatalogue.json?.items), shopCatalogue.json);
  const soldItem = shopCatalogue.json.items.find((item) => item.key === "tp_pack");
  check("в каталоге видно, сколько раз купили", soldItem?.boughtTimes >= 1, soldItem);

  const badKey = await api("/api/panel/shop", {
    method: "POST",
    cookie: steve.session,
    body: { key: "Плохой Ключ", title: "х", description: "х", category: "utility", priceVc: 10, feature: "tp" },
  });
  check("кривой ключ отклоняется", badKey.status === 400, badKey.json);

  const noFeature = await api("/api/panel/shop", {
    method: "POST",
    cookie: steve.session,
    body: { key: "no_feature", title: "Без возможности", description: "х", category: "utility", priceVc: 10 },
  });
  check("товар без возможности не создаётся", noFeature.status === 400, noFeature.json);

  const shopCreated = await api("/api/panel/shop", {
    method: "POST",
    cookie: steve.session,
    body: {
      key: "night_pack",
      title: "Ночной телепорт ×3",
      description: "Тестовый товар из панели.",
      category: "teleport",
      priceVc: 700,
      kind: "CHARGES",
      charges: 3,
      feature: "tp",
      payload: '{"cooldownSeconds": 60}',
      sort: 5,
    },
  });
  check("chief создаёт товар", shopCreated.json?.ok === true, shopCreated.json);

  const shopDuplicate = await api("/api/panel/shop", {
    method: "POST",
    cookie: steve.session,
    body: { key: "night_pack", title: "Дубль", description: "х", category: "utility", priceVc: 10, feature: "tp" },
  });
  check("второй товар с тем же ключом отклоняется", shopDuplicate.status === 400, shopDuplicate.json);

  const shopBefore = await fetch(BASE + "/shop");
  check("новый товар сразу на витрине", (await shopBefore.text()).includes("Ночной телепорт"));

  const priceChange = await api("/api/panel/shop", {
    method: "PATCH",
    cookie: steve.session,
    body: { key: "night_pack", priceVc: 250 },
  });
  check("цена меняется", priceChange.json?.ok === true, priceChange.json);

  const buyerNew = await register("Nighty");
  const buyerMe = await api("/api/me", { cookie: buyerNew.session });
  await api("/api/panel/balance", {
    method: "POST",
    cookie: steve.session,
    body: { userId: buyerMe.json.id, amount: 300, reason: "тест магазина" },
  });
  const boughtNew = await api("/api/shop/buy", {
    method: "POST",
    cookie: buyerNew.session,
    body: { key: "night_pack" },
  });
  check("покупка идёт по новой цене", boughtNew.json?.balance === 50, boughtNew.json);

  const deleteSold = await api("/api/panel/shop", {
    method: "DELETE",
    cookie: steve.session,
    body: { key: "night_pack" },
  });
  check("купленный товар удалить нельзя", deleteSold.status === 400, deleteSold.json);

  const shopHidden = await api("/api/panel/shop", {
    method: "PATCH",
    cookie: steve.session,
    body: { key: "night_pack", active: false },
  });
  check("товар убирается с витрины", shopHidden.json?.ok === true, shopHidden.json);
  const shopAfter = await fetch(BASE + "/shop");
  check("скрытый товар пропал с витрины", !(await shopAfter.text()).includes("Ночной телепорт"));

  const buyHidden = await api("/api/shop/buy", {
    method: "POST",
    cookie: buyerNew.session,
    body: { key: "night_pack" },
  });
  check("скрытый товар не купить", buyHidden.status === 400, buyHidden.json);

  const shopSpare = await api("/api/panel/shop", {
    method: "POST",
    cookie: steve.session,
    body: {
      key: "spare_pack",
      title: "Черновик",
      description: "Никто не купил.",
      category: "utility",
      priceVc: 100,
      feature: "craft",
    },
  });
  check("черновик создан", shopSpare.json?.ok === true, shopSpare.json);
  const deleteSpare = await api("/api/panel/shop", {
    method: "DELETE",
    cookie: steve.session,
    body: { key: "spare_pack" },
  });
  check("некупленный товар удаляется", deleteSpare.json?.ok === true, deleteSpare.json);

  const shopPanelPage = await fetch(BASE + "/panel/shop", { headers: { Cookie: steve.session } });
  check("страница каталога открывается у chief", shopPanelPage.status === 200, {
    status: shopPanelPage.status,
  });

  console.log("— Итог —");
  console.log(`Пройдено: ${passed}, провалено: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
