import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Host-aware routing for the bare root path "/".
//   app.lacompe.digital      -> admin portal (straight to /login; the login page
//                               forwards an already-authenticated admin to /admin)
//   cesqroo / coparefugio /  -> public events page (/inscripciones)
//   apex, other subdomains
//   localhost / IP (dev)     -> pass through to the root router
//
// Only the root is rewritten; every other path is served as-is on every host.
const ADMIN_SUBDOMAINS = new Set(["app"]);

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname !== "/") return NextResponse.next();

  const host = (req.headers.get("host") || "").split(":")[0];
  const sub = host.split(".")[0];
  const isLocal = host === "localhost" || host.endsWith(".localhost") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

  if (ADMIN_SUBDOMAINS.has(sub)) return NextResponse.redirect(new URL("/login", req.url));
  if (isLocal) return NextResponse.next();
  return NextResponse.redirect(new URL("/inscripciones", req.url));
}

export const config = { matcher: ["/"] };
