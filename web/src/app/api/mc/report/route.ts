import { db } from "@/lib/db";
import { serverTokenValid, unauthorized } from "@/lib/mcauth";
import { rateLimit } from "@/lib/ratelimit";

/** /report <текст> — создать репорт. */
export async function POST(request: Request) {
  if (!serverTokenValid(request)) return unauthorized();

  const { login, text } = (await request.json()) as { login?: string; text?: string };
  if (!login || !text?.trim()) return Response.json({ error: "bad request" }, { status: 400 });
  if (!rateLimit(`report:${login}`, 3, 300)) {
    return Response.json({ error: "rate_limited", message: "Не больше 3 репортов за 5 минут" }, { status: 429 });
  }

  const author = await db.user.findUnique({ where: { login } });
  if (!author) return Response.json({ error: "not_found" }, { status: 404 });

  const report = await db.report.create({
    data: { authorId: author.id, text: text.trim().slice(0, 500) },
  });
  return Response.json({ ok: true, report: { id: report.id, text: report.text, author: login } });
}
