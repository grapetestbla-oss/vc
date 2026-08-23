import { currentUser } from "@/lib/session";
import { buyWithShards, CaseError } from "@/lib/cases";

/** Покупка предмета за осколки. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { key } = (await request.json()) as { key?: string };
  if (!key) return Response.json({ error: "key required" }, { status: 400 });

  try {
    const result = await buyWithShards(user.id, key);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CaseError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
