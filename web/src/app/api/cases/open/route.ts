import { currentUser } from "@/lib/session";
import { CaseError, openCase } from "@/lib/cases";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`case:${user.id}`, 60, 60)) {
    return Response.json({ error: "Слишком быстро" }, { status: 429 });
  }

  const { caseKey } = (await request.json()) as { caseKey?: string };
  if (!caseKey) return Response.json({ error: "caseKey required" }, { status: 400 });

  try {
    const result = await openCase(user.id, caseKey);
    return Response.json(result);
  } catch (error) {
    if (error instanceof CaseError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
