import { NextResponse, type NextRequest } from "next/server";

// When the request comes in on the "inscripciones" subdomain, serve the
// public events landing at the root URL. Everything else passes through,
// so paths like /signup/<slug> still work on the subdomain too.
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  if (host.startsWith("inscripciones.") && req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/inscripciones";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

// Only run on the root path — keeps this rule cheap and out of the way.
export const config = {
  matcher: ["/"],
};
