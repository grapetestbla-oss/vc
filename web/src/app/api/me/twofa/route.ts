import { db } from "@/lib/db";
import { generate2faCode } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

/** Кабинет выдаёт код, который игрок вводит в игре командой /2fa. */
export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`twofa:${user.id}`, 6, 600)) {
    return Response.json({ error: "Подождите немного" }, { status: 429 });
  }

  const code = generate2faCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await db.user.update({
    where: { id: user.id },
    data: { twoFactorCode: code, twoFactorExpiresAt: expiresAt },
  });

  return Response.json({ code, expiresAt });
}
