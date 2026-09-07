import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Пути, которые работают и во время техработ: иначе чиф не сможет всё выключить. */
const ALWAYS_OPEN = ["/login", "/panel", "/maintenance", "/api"];

/** На техническом сайте открыт только вход: без него пускать некого. */
const STAGING_OPEN = ["/login", "/closed", "/api"];

const STAGING = process.env.STAGING === "1";

type Gate = { enabled: boolean; blocked: boolean; staging: boolean; stagingBlocked?: boolean };

/**
 * Состояние техработ кэшируем на несколько секунд: при выключенном режиме — а
 * это норма — переход по сайту не должен тянуть за собой лишний запрос.
 *
 * На техническом сайте кэш не работает: там ответ зависит от того, кто пришёл,
 * и общий на всех кэш открыл бы стенд первому же гостю после входа хозяина.
 */
let cached: { enabled: boolean; until: number } = { enabled: false, until: 0 };

async function gate(request: NextRequest): Promise<Gate | null> {
  const url = new URL("/api/maintenance/gate", request.nextUrl.origin);

  if (!STAGING && Date.now() < cached.until && !cached.enabled) return null;

  const response = await fetch(url, {
    headers: { cookie: request.headers.get("cookie") ?? "" },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const data = (await response.json()) as Gate;
  if (!STAGING) cached = { enabled: data.enabled, until: Date.now() + 5000 };
  return data;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);

  const next = () => {
    const response = NextResponse.next({ request: { headers } });
    // Технический сайт — копия боевого. В поиске он не нужен ни строкой:
    // иначе выдача уводила бы игроков на стенд вместо настоящего сайта.
    if (STAGING) response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  };

  const open = STAGING ? STAGING_OPEN : ALWAYS_OPEN;
  if (open.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return next();
  }

  try {
    const state = await gate(request);
    if (state?.stagingBlocked) {
      return NextResponse.rewrite(new URL("/closed", request.nextUrl.origin), {
        request: { headers },
      });
    }
    if (state?.blocked) {
      // Именно rewrite, а не redirect: адрес в строке остаётся прежним, и после
      // окончания работ обновление страницы возвращает игрока туда, где он был.
      return NextResponse.rewrite(new URL("/maintenance", request.nextUrl.origin), {
        request: { headers },
      });
    }
  } catch {
    // Проверка не прошла — сайт продолжает работать, техработы не должны его ронять.
  }

  return next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts|partners).*)"],
};
