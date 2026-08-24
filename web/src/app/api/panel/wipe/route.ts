import { db } from "@/lib/db";
import { requirePanel } from "@/lib/panel";
import { wipeAccount } from "@/lib/wipe";

/** Обнуление аккаунта: статистика на сайте и инвентарь в игре. Только 5 уровень. */
export async function POST(request: Request) {
  const admin = await requirePanel(5);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { userId, reason, clearInventory, confirm } = (await request.json()) as {
    userId?: string;
    reason?: string;
    clearInventory?: boolean;
    confirm?: string;
  };
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, login: true, adminLevel: true },
  });
  if (!target) return Response.json({ error: "Игрок не найден" }, { status: 404 });
  if (target.adminLevel >= admin.adminLevel && target.id !== admin.id) {
    return Response.json({ error: "Цель того же уровня или выше" }, { status: 403 });
  }

  // Ник вводится руками: обнуление необратимо, промах мышью его не запустит.
  if ((confirm ?? "").trim() !== target.login) {
    return Response.json({ error: `Впишите ник ${target.login} для подтверждения` }, { status: 400 });
  }

  const text = (reason ?? "").trim().slice(0, 300);
  if (text.length < 3) return Response.json({ error: "Укажите причину" }, { status: 400 });

  const result = await wipeAccount({
    userId,
    adminId: admin.id,
    reason: text,
    clearInventory: clearInventory !== false,
  });

  return Response.json({ ok: true, ...result });
}
