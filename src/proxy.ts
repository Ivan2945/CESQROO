import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  // Subdomain routing: on the "inscripciones" host, the bare root serves the
  // public events landing. (Vercel forwards the public host as x-forwarded-host.)
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").toLowerCase();
  if (host.startsWith("inscripciones.") && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/inscripciones";
    return NextResponse.rewrite(url);
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // refresh session cookie if needed
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
