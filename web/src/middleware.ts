import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Пути, которые работают и во время техработ: иначе чиф не сможет всё выключить. */
const ALWAYS_OPEN = ["/login", "/panel", "/maintenance", "/api"];

/**
 * Состояние техработ кэшируем на несколько секунд: при выключенном режиме — а
 * это норма — переход по сайту не должен тянуть за собой лишний запрос.
 */
let cached: { enabled: boolean; until: number } = { enabled: false, until: 0 };

async function gate(request: NextRequest): Promise<boolean> {
  const url = new URL("/api/maintenance/gate", request.nextUrl.origin);

  if (Date.now() < cached.until && !cached.enabled) return false;

  const response = await fetch(url, {
    headers: { cookie: request.headers.get("cookie") ?? "" },
    cache: "no-store",
  });
  if (!response.ok) return false;

  const data = (await response.json()) as { enabled: boolean; blocked: boolean };
  cached = { enabled: data.enabled, until: Date.now() + 5000 };
  return data.blocked;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  const next = () => NextResponse.next({ request: { headers } });

  if (ALWAYS_OPEN.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return next();
  }

  try {
    if (await gate(request)) {
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
