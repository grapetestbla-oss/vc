import { requirePanel } from "@/lib/panel";
import { reviewAppeal, AppealError } from "@/lib/appeals";

/** Решение по заявлению о разбане. Только чиф-администратор. */
export async function POST(request: Request) {
  const admin = await requirePanel(5, "appeals.review");
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { appealId, approve, note } = (await request.json()) as {
    appealId?: string;
    approve?: boolean;
    note?: string;
  };
  if (!appealId) return Response.json({ error: "appealId required" }, { status: 400 });

  try {
    const result = await reviewAppeal({
      appealId,
      adminId: admin.id,
      approve: approve === true,
      note: (note ?? "").trim().slice(0, 500) || null,
    });
    return Response.json({ ok: true, status: approve ? "approved" : "rejected", ...result });
  } catch (error) {
    if (error instanceof AppealError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
