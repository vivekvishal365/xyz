import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { parsePublicEnv } from "@/lib/env";
import { isAuthBypassActive } from "@/lib/auth/bypass";

/** Routes that require a session. Everything else is public. */
const PROTECTED_PREFIXES = [
  "/home",
  "/signals",
  "/markets",
  "/explore",
  "/watchlist",
  "/alerts",
  "/settings",
  "/companies",
  "/sectors",
  "/indicators",
  "/macro",
  "/admin",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Paths a signed-in user should never sit on. */
function isSignedInRedirect(pathname: string): boolean {
  return pathname === "/" || pathname === "/login";
}

function redirectToHome(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/home";
  url.search = "";
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  // TEMPORARY (see src/lib/auth/bypass.ts). Skips route protection entirely so
  // the app routes can be viewed without a session. Returning early also avoids
  // a pointless Supabase round-trip on every request while it is on.
  if (isAuthBypassActive()) {
    // The placeholder user is effectively signed in, so the same
    // already-signed-in redirects have to apply. Without this, `/` fell through
    // to the root page's unconditional redirect and sent you to /login WITH the
    // bypass on — which looks exactly like the bypass not working.
    if (isSignedInRedirect(request.nextUrl.pathname)) {
      return redirectToHome(request);
    }
    return NextResponse.next({ request });
  }

  const env = parsePublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase. getSession() only reads the
  // cookie, which is spoofable — do not swap these.
  //
  // If Supabase is unreachable we treat the request as anonymous rather than
  // returning 500. That fails closed for protected routes (the user is sent to
  // /login) while keeping public pages — including the disclaimer — available.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  const { pathname } = request.nextUrl;

  if (!user && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isSignedInRedirect(pathname)) {
    return redirectToHome(request);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
