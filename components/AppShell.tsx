"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Secciones del menú. "activo: false" = todavía no construida.
const SECCIONES = [
  { href: "/inventario", nombre: "Inventario", icono: "📦", activo: true },
  { href: "/ventas/nueva", nombre: "Vender", icono: "🛒", activo: true },
  { href: "/ingresos/nuevo", nombre: "Ingresar", icono: "📥", activo: true },
  { href: "/productos", nombre: "Productos", icono: "🏷️", activo: true },
  { href: "/dashboard", nombre: "Dashboard", icono: "📊", activo: false },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function salir() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen md:flex">
      {/* Menú lateral: solo en pantallas medianas y grandes (PC) */}
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-slate-200 md:bg-white md:p-4">
        <h1 className="mb-6 text-lg font-semibold">Coli · Inventario</h1>
        <nav className="flex flex-1 flex-col gap-1">
          {SECCIONES.map((s) =>
            s.activo ? (
              <Link
                key={s.href}
                href={s.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  pathname.startsWith(s.href)
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {s.icono} {s.nombre}
              </Link>
            ) : (
              <span
                key={s.href}
                className="rounded-lg px-3 py-2 text-sm text-slate-400"
              >
                {s.icono} {s.nombre} <em className="text-xs">(pronto)</em>
              </span>
            )
          )}
        </nav>
        <button
          onClick={salir}
          className="rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100"
        >
          Cerrar sesión
        </button>
      </aside>

      {/* Barra superior: solo en celular */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <h1 className="font-semibold">Coli · Inventario</h1>
        <button onClick={salir} className="text-sm text-slate-600">
          Salir
        </button>
      </header>

      <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">{children}</main>

      {/* Menú inferior: solo en celular */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white md:hidden">
        {SECCIONES.map((s) =>
          s.activo ? (
            <Link
              key={s.href}
              href={s.href}
              className={`flex flex-1 flex-col items-center py-2 text-xs ${
                pathname.startsWith(s.href)
                  ? "font-semibold text-slate-900"
                  : "text-slate-500"
              }`}
            >
              <span className="text-lg">{s.icono}</span>
              {s.nombre}
            </Link>
          ) : (
            <span
              key={s.href}
              className="flex flex-1 flex-col items-center py-2 text-xs text-slate-300"
            >
              <span className="text-lg">{s.icono}</span>
              {s.nombre}
            </span>
          )
        )}
      </nav>
    </div>
  );
}
