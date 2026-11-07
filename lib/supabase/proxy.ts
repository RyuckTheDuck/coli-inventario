// Refresca la sesión de Supabase y redirige según si hay usuario o no.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers?: Record<string, string>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          if (headers) {
            Object.entries(headers).forEach(([key, value]) =>
              supabaseResponse.headers.set(key, value)
            );
          }
        },
      },
    }
  );

  // Verifica la sesión (no ejecutar código entre createServerClient y esta línea)
  const { data } = await supabase.auth.getClaims();
  const haySesion = !!data?.claims;
  const ruta = request.nextUrl.pathname;
  const enLogin = ruta.startsWith("/login");

  if (!haySesion && !enLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (haySesion && enLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/inventario";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
