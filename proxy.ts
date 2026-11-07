// Next.js 16: "proxy.ts" reemplaza a "middleware.ts".
// Se ejecuta antes de cada página: refresca la sesión y protege las rutas.
import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
