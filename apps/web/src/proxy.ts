import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const headers = new Headers(request.headers);
    headers.set("x-di-forwarded-origin", request.nextUrl.origin);
    return NextResponse.next({ request: { headers } });
  }

  return handleI18nRouting(request);
}

export const config = {
  matcher: ["/((?!api|healthz|_next|_vercel|.*\\..*).*)", "/api/:path*"],
};
