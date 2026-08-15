import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { externalRequestOrigin } from "@/lib/external-request-origin";

const handleI18nRouting = createMiddleware(routing);

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/api/") ||
    request.nextUrl.pathname === "/graphql"
  ) {
    const headers = new Headers(request.headers);
    headers.set(
      "x-di-forwarded-origin",
      externalRequestOrigin(headers, request.nextUrl),
    );
    return NextResponse.next({ request: { headers } });
  }

  return handleI18nRouting(request);
}

export const config = {
  matcher: [
    "/((?!api|graphql|healthz|_next|_vercel|.*\\..*).*)",
    "/api/:path*",
    "/graphql",
  ],
};
