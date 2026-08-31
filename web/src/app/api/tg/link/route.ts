import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { issueLinkCode, linkUrl, LINK_CODE_MINUTES } from "@/lib/telegram";

/** Состояние привязки для кабинета. */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const link = await db.telegramAccount.findUnique({ where: { userId: user.id } });
  return Response.json({
    linked: link ? { username: link.username, linkedAt: link.linkedAt } : null,
  });
}

/** Выдать код привязки. */
export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const code = await issueLinkCode(user.id);
  return Response.json({ code: code.code, url: linkUrl(code.code), minutes: LINK_CODE_MINUTES });
}

/** Отвязать. */
export async function DELETE() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  await db.telegramAccount.deleteMany({ where: { userId: user.id } });
  return Response.json({ ok: true });
}
