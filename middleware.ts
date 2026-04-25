import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware runs on the Edge runtime — cannot touch better-sqlite3. We only
 * check cookie presence here and redirect HTML routes to /login. Full session
 * validation happens in API routes via getCurrentUser() (Node runtime).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip: login page, auth API, webhook (Meta must reach it), Next internals,
  // public static assets (logo, favicon, robots, etc — anything with a file
  // extension served from /public). The login page can't load /prompt-logo.png
  // unless this bypass exists, because the request has no auth cookie yet.
  // Also skip the click-tracker `/r/<code>` short-link redirector.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/webhook" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/r/") ||
    pathname === "/favicon.ico" ||
    /\.(?:png|jpe?g|gif|svg|ico|webp|avif|css|js|map|woff2?|ttf|otf|txt|xml|json)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("wa_session")?.value;

  // Unauthenticated HTML page → redirect to login
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
