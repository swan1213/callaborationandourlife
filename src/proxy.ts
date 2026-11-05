import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { canOpen, pageFor } from "@/lib/pageAccess";

// Optimistic redirects only; every API route and page re-checks the user in the database.
export async function proxy(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;

  if (!session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  // The server home route selects a destination using current stored permissions.
  const home = () => NextResponse.redirect(new URL("/", req.url));

  const adminOnly = pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/keys") || pathname.startsWith("/admin/notifications") || pathname.startsWith("/admin/feedback") || pathname.startsWith("/admin/logs") || pathname.startsWith("/admin/prompt-test") || pathname.startsWith("/admin/api-access") || pathname.startsWith("/admin/work-time") || pathname.startsWith("/admin/page-access");
  const staff = session.role === "admin" || session.role === "user";
  const caller = session.role === "caller";
  // Callers only use their interview pages, profiles and My Page.
  if (caller && !["/caller", "/me", "/profiles", "/notifications", "/feedback", "/help", "/interview-history", "/chat"].some((p) => pathname.startsWith(p))) {
    return home();
  }
  // Bidders work from Generate, Generate Resume and View Generated Resumes; Overview and Feedback are hidden from them.
  if (session.role === "bidder" && ["/overview", "/feedback"].some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return home();
  }
  // Interview History: admins, users and callers only.
  if (session.role === "bidder" && pathname.startsWith("/interview-history")) {
    return home();
  }
  if (!caller && pathname.startsWith("/caller")) {
    return home();
  }
  if (pathname.startsWith("/admin") && (!staff || (adminOnly && session.role !== "admin"))) {
    return home();
  }
  const page = pageFor(pathname);
  if (page && !canOpen(session.role, page.key, {})) return home();
  // Overwrite client input: server components use this trusted pathname for page access.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tailorbid-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/dashboard/:path*", "/applications/:path*", "/profiles/:path*", "/me/:path*", "/admin/:path*", "/interviews/:path*", "/caller/:path*", "/notifications/:path*", "/feedback/:path*", "/overview/:path*", "/chat/:path*", "/help", "/interview-history/:path*"],
};
