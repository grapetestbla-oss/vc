import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { audit, clientIp } from "@/lib/audit";
import { slugify } from "@/lib/news";

/** Публикация новости. Только chief administrator. */
export async function POST(request: Request) {
  const admin = await requirePanel(5);
  if (!admin) return Response.json({ error: "Нужен 5 уровень" }, { status: 403 });

  const { title, summary, body, coverUrl, pinned, broadcast, published } =
    (await request.json()) as {
      title?: string;
      summary?: string;
      body?: string;
      coverUrl?: string;
      pinned?: boolean;
      broadcast?: boolean;
      published?: boolean;
    };

  if (!title?.trim() || !body?.trim()) {
    return Response.json({ error: "Нужны заголовок и текст" }, { status: 400 });
  }

  // Заголовки повторяются — добавляем хвост, чтобы адрес остался уникальным.
  let slug = slugify(title);
  if (await db.news.findUnique({ where: { slug } })) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const news = await db.news.create({
    data: {
      slug,
      title: title.trim(),
      summary: (summary?.trim() || body.trim().slice(0, 160)),
      body: body.trim(),
      coverUrl: coverUrl?.trim() || null,
      pinned: Boolean(pinned),
      broadcast: Boolean(broadcast),
      published: published !== false,
      authorId: admin.id,
    },
  });

  await audit({
    actorId: admin.id,
    action: "panel.news.create",
    ip: clientIp(request),
    meta: { slug: news.slug, broadcast: news.broadcast },
  });

  return Response.json({ ok: true, slug: news.slug });
}

/** Правка новости: снять с публикации, закрепить, поменять текст. */
export async function PATCH(request: Request) {
  const admin = await requirePanel(5);
  if (!admin) return Response.json({ error: "Нужен 5 уровень" }, { status: 403 });

  const { id, ...fields } = (await request.json()) as {
    id?: string;
    title?: string;
    summary?: string;
    body?: string;
    coverUrl?: string | null;
    pinned?: boolean;
    published?: boolean;
  };
  if (!id) return Response.json({ error: "id обязателен" }, { status: 400 });

  const news = await db.news.update({ where: { id }, data: fields });
  await audit({
    actorId: admin.id,
    action: "panel.news.update",
    ip: clientIp(request),
    meta: { slug: news.slug, fields: Object.keys(fields) },
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const admin = await requirePanel(5);
  if (!admin) return Response.json({ error: "Нужен 5 уровень" }, { status: 403 });

  const { id } = (await request.json()) as { id?: string };
  if (!id) return Response.json({ error: "id обязателен" }, { status: 400 });

  const news = await db.news.delete({ where: { id } });
  await audit({
    actorId: admin.id,
    action: "panel.news.delete",
    ip: clientIp(request),
    meta: { slug: news.slug },
  });

  return Response.json({ ok: true });
}
