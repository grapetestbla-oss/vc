import { headers } from "next/headers";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { audit, clientIp } from "@/lib/audit";
import {
  checkSkinPng,
  isVariant,
  MAX_SKIN_BYTES,
  queueSkinAction,
  skinPayload,
  validNick,
} from "@/lib/skins";

/** Текущий скин игрока — для карточки в кабинете. */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const skin = await db.playerSkin.findUnique({ where: { userId: user.id } });
  return Response.json({
    skin: skin
      ? { kind: skin.kind, nick: skin.nick, variant: skin.variant, updatedAt: skin.updatedAt }
      : null,
  });
}

/**
 * Установка скина: своей картинкой или по чужому нику. Картинку храним у себя
 * и отдаём публично — SkinsRestorer забирает её по ссылке.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Не разобрали форму" }, { status: 400 });

  const variant = form.get("variant");
  if (!isVariant(variant)) return Response.json({ error: "Неизвестный тип модели" }, { status: 400 });

  const nick = form.get("nick");
  const file = form.get("file");

  let data: Uint8Array<ArrayBuffer> | null = null;
  let kind: "UPLOAD" | "NICK";

  if (typeof nick === "string" && nick.trim()) {
    if (!validNick(nick.trim())) {
      return Response.json({ error: "Ник — 3–16 латинских букв, цифр и _" }, { status: 400 });
    }
    kind = "NICK";
  } else if (file instanceof File) {
    if (file.size > MAX_SKIN_BYTES) {
      return Response.json({ error: "Файл больше 100 КБ" }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkSkinPng(Buffer.from(bytes));
    if (!check.ok) return Response.json({ error: check.error }, { status: 400 });
    data = bytes;
    kind = "UPLOAD";
  } else {
    return Response.json({ error: "Выберите файл или укажите ник" }, { status: 400 });
  }

  const fields = {
    kind,
    data,
    nick: kind === "NICK" ? (nick as string).trim() : null,
    variant,
  };
  const skin = await db.playerSkin.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...fields },
    update: fields,
  });

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const proto = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  await queueSkinAction(user.id, user.login, skinPayload(skin, `${proto}://${host}`, user.login));

  await audit({ actorId: user.id, action: "skin.set", ip: clientIp(request), meta: { kind, variant } });
  return Response.json({ ok: true, kind, variant, updatedAt: skin.updatedAt });
}

/** Сброс на скин по умолчанию. */
export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  await db.playerSkin.deleteMany({ where: { userId: user.id } });
  await queueSkinAction(user.id, user.login, { mode: "clear" });
  await audit({ actorId: user.id, action: "skin.clear", ip: clientIp(request) });
  return Response.json({ ok: true });
}
