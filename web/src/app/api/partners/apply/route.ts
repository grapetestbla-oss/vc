import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { audit, clientIp } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { PARTNER_PLATFORMS } from "@/lib/partners";

/** Заявка на статус медиа-партнёра. Одна активная на аккаунт. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Войдите, чтобы подать заявку" }, { status: 401 });
  if (!rateLimit(`partner:${user.id}`, 10, 3600)) {
    return Response.json({ error: "Слишком часто. Попробуйте позже." }, { status: 429 });
  }

  const { platform, channelUrl, audience, contact, comment, desiredCode } =
    (await request.json()) as Record<string, string | undefined>;

  if (!platform || !PARTNER_PLATFORMS.some((item) => item.key === platform)) {
    return Response.json({ error: "Выберите площадку" }, { status: 400 });
  }
  if (!channelUrl?.trim() || !/^https?:\/\//.test(channelUrl.trim())) {
    return Response.json({ error: "Укажите ссылку на канал целиком, с https://" }, { status: 400 });
  }
  if (!audience?.trim()) {
    return Response.json({ error: "Опишите охваты — их будут проверять" }, { status: 400 });
  }
  if (!contact?.trim()) {
    return Response.json({ error: "Оставьте контакт для связи" }, { status: 400 });
  }

  const pending = await db.partnerApplication.findFirst({
    where: { userId: user.id, status: "PENDING" },
  });
  if (pending) {
    return Response.json({ error: "Заявка уже на рассмотрении" }, { status: 409 });
  }

  const code = desiredCode?.trim().toUpperCase();
  if (code && !/^[A-Z0-9_]{3,16}$/.test(code)) {
    return Response.json(
      { error: "Код: 3-16 символов, латиница, цифры и _" },
      { status: 400 },
    );
  }
  if (code && (await db.promo.findUnique({ where: { code } }))) {
    return Response.json({ error: "Такой код уже занят" }, { status: 409 });
  }

  const application = await db.partnerApplication.create({
    data: {
      userId: user.id,
      platform,
      channelUrl: channelUrl.trim().slice(0, 300),
      audience: audience.trim().slice(0, 1000),
      contact: contact.trim().slice(0, 200),
      comment: comment?.trim().slice(0, 1000) || null,
      desiredCode: code || null,
    },
  });

  await audit({
    actorId: user.id,
    action: "partner.apply",
    ip: clientIp(request),
    meta: { platform, channelUrl: application.channelUrl },
  });

  return Response.json({ ok: true, id: application.id });
}
