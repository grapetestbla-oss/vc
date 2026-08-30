import { db } from "@/lib/db";

/**
 * Публичная отдача скина: по этой ссылке за картинкой приходит SkinsRestorer,
 * а кабинет показывает предпросмотр. Адрес вида /api/skins/Steve.png.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!file.endsWith(".png")) return new Response("not found", { status: 404 });

  const login = decodeURIComponent(file.slice(0, -4));
  const user = await db.user.findUnique({ where: { login }, select: { id: true } });
  if (!user) return new Response("not found", { status: 404 });

  const skin = await db.playerSkin.findUnique({ where: { userId: user.id } });
  if (!skin?.data) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(skin.data), {
    headers: {
      "Content-Type": "image/png",
      // Скин меняется редко, но при смене ссылка должна отдать новое: держим
      // короткий кэш и метку версии, чтобы MineSkin не забрал старую картинку.
      "Cache-Control": "public, max-age=60",
      ETag: `"${skin.updatedAt.getTime()}"`,
    },
  });
}
