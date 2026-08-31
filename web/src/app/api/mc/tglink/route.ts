import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { issueLinkCode, linkUrl, LINK_CODE_MINUTES } from "@/lib/telegram";

/** Код привязки для команды /tg в игре. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { login } = (await request.json().catch(() => ({}))) as { login?: string };
  if (!login) return Response.json({ error: "login required" }, { status: 400 });

  const user = await db.user.findUnique({
    where: { login },
    select: { id: true, telegram: { select: { username: true } } },
  });
  if (!user) return Response.json({ error: "not found" }, { status: 404 });

  if (user.telegram) {
    return Response.json({ status: "linked", username: user.telegram.username });
  }

  const code = await issueLinkCode(user.id);
  return Response.json({
    status: "ok",
    code: code.code,
    url: linkUrl(code.code),
    minutes: LINK_CODE_MINUTES,
  });
}
