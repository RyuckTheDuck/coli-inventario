"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Fila = {
  variante_id: string;
  prenda: string;
  categoria: string | null;
  color: string;
  talla: string;
  stock: number;
  ingresado: number;
  vendidas: number;
  ultima_venta: string | null;
  producto_id: string;
  producto_activo: boolean;
  variante_activa: boolean;
};

type Grupo = {
  id: string;
  nombre: string;
  categoria: string | null;
  activo: boolean;
  filas: Fila[];
  stock: number;
  vendidas: number;
};

const ORDEN_TALLA = ["XS", "S", "M", "L", "XL", "XXL"];
const ordenTalla = (t: string) => {
  const i = ORDEN_TALLA.indexOf(t);
  return i === -1 ? 99 : i;
};
const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const normalizarTalla = (t: string) =>
  t.length <= 3 ? t.toUpperCase() : capitalizar(t);

type ErrorDB = { code?: string; message: string } | null;

export default function ProductosAdminPage() {
  const supabase = useMemo(() => createClient(), []);

  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);

  const [editP, setEditP] = useState<{
    id: string;
    nombre: string;
    categoria: string;
  } | null>(null);
  const [editV, setEditV] = useState<{
    id: string;
    color: string;
    talla: string;
  } | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("variantes_detalle").select("*");
    if (error) {
      setErrorCarga(error.message);
    } else {
      setFilas((data ?? []) as Fila[]);
      setErrorCarga(null);
    }
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Grupo>();
    for (const f of filas) {
      let g = mapa.get(f.producto_id);
      if (!g) {
        g = {
          id: f.producto_id,
          nombre: f.prenda,
          categoria: f.categoria,
          activo: f.producto_activo,
          filas: [],
          stock: 0,
          vendidas: 0,
        };
        mapa.set(f.producto_id, g);
      }
      g.filas.push(f);
      if (f.variante_activa) g.stock += f.stock;
      g.vendidas += f.vendidas;
    }
    const lista = Array.from(mapa.values());
    lista.forEach((g) =>
      g.filas.sort(
        (a, b) =>
          a.color.localeCompare(b.color) || ordenTalla(a.talla) - ordenTalla(b.talla)
      )
    );
    return lista.sort(
      (a, b) =>
        Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre)
    );
  }, [filas]);

  const colores = useMemo(() => {
    const mapa = new Map<string, number>();
    filas.forEach((f) => mapa.set(f.color, (mapa.get(f.color) ?? 0) + 1));
    return Array.from(mapa.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filas]);

  // Ejecuta una operación, muestra el resultado y recarga
  async function ejecutar(
    fn: () => PromiseLike<{ error: ErrorDB }>,
    ok: string,
    msgDuplicado = "Ese nombre ya existe."
  ) {
    const { error } = await fn();
    if (error) {
      setMensaje({
        tipo: "error",
        texto: error.code === "23505" ? msgDuplicado : error.message,
      });
      return false;
    }
    setMensaje({ tipo: "ok", texto: ok });
    await cargar();
    return true;
  }

  async function guardarProducto() {
    if (!editP) return;
    const nombre = editP.nombre.trim();
    if (!nombre) {
      setMensaje({ tipo: "error", texto: "El nombre no puede quedar vacío." });
      return;
    }
    const ok = await ejecutar(
      () =>
        supabase
          .from("productos")
          .update({ nombre, categoria: editP.categoria.trim() || null })
          .eq("id", editP.id),
      "Producto actualizado.",
      "Ya existe un producto con ese nombre."
    );
    if (ok) setEditP(null);
  }

  async function alternarProducto(g: Grupo) {
    await ejecutar(
      () => supabase.from("productos").update({ activo: !g.activo }).eq("id", g.id),
      g.activo ? `${g.nombre} desactivado.` : `${g.nombre} reactivado.`
    );
  }

  async function eliminarProducto(g: Grupo) {
    const escrito = window.prompt(
      `Esto borra el producto y todo su stock de forma DEFINITIVA.\nPara confirmar escribe el nombre exacto:\n${g.nombre}`
    );
    if (escrito === null) return;
    if (escrito.trim() !== g.nombre) {
      setMensaje({ tipo: "error", texto: "El nombre no coincide. No se eliminó nada." });
      return;
    }
    await ejecutar(
      () => supabase.rpc("eliminar_producto", { p_producto_id: g.id }),
      `${g.nombre} eliminado.`
    );
  }

  async function guardarVariante() {
    if (!editV) return;
    const color = capitalizar(editV.color.trim());
    const talla = normalizarTalla(editV.talla.trim());
    if (!color || !talla) {
      setMensaje({ tipo: "error", texto: "Color y talla son obligatorios." });
      return;
    }
    const ok = await ejecutar(
      () => supabase.from("variantes").update({ color, talla }).eq("id", editV.id),
      "Variante actualizada.",
      "Ya existe esa combinación de color y talla en este producto."
    );
    if (ok) setEditV(null);
  }

  async function alternarVariante(f: Fila) {
    await ejecutar(
      () =>
        supabase.from("variantes").update({ activo: !f.variante_activa }).eq("id", f.variante_id),
      f.variante_activa ? "Variante desactivada." : "Variante reactivada."
    );
  }

  async function eliminarVariante(f: Fila) {
    if (
      !window.confirm(
        `¿Eliminar definitivamente ${f.prenda} · ${f.color} · ${f.talla}? No se puede deshacer.`
      )
    )
      return;
    await ejecutar(
      () => supabase.rpc("eliminar_variante", { p_variante_id: f.variante_id }),
      "Variante eliminada."
    );
  }

  async function renombrarColor(antiguo: string) {
    const nuevo = window.prompt(
      `Nuevo nombre para el color "${antiguo}" (se cambia en todas las prendas):`,
      antiguo
    );
    if (nuevo === null) return;
    const limpio = capitalizar(nuevo.trim());
    if (!limpio || limpio === antiguo) return;
    await ejecutar(
      () => supabase.from("variantes").update({ color: limpio }).eq("color", antiguo),
      `Color "${antiguo}" ahora es "${limpio}".`,
      "No se pudo: alguna prenda ya tiene ese color en la misma talla."
    );
  }

  if (cargando) return <p className="text-slate-500">Cargando...</p>;
  if (errorCarga)
    return (
      <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar: {errorCarga}
      </p>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Productos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Edita, desactiva o elimina prendas, colores y tallas.
          </p>
        </div>
        <Link
          href="/productos/nuevo"
          className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white"
        >
          ＋ Nuevo producto / agregar variantes
        </Link>
      </div>

      {mensaje && (
        <div
          role="status"
          className={`rounded-lg p-3 text-sm ${
            mensaje.tipo === "ok"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      <div className="space-y-3">
        {grupos.map((g) => (
          <details
            key={g.id}
            className={`rounded-xl bg-white ring-1 ring-slate-200 ${g.activo ? "" : "opacity-60"}`}
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {g.nombre}{" "}
                  {!g.activo && (
                    <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs">
                      Inactivo
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-500">
                  {g.categoria ?? "Sin categoría"} · {g.filas.length} variantes
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold">{g.stock} en stock</p>
                <p className="text-slate-500">{g.vendidas} vendidas</p>
              </div>
            </summary>

            <div className="space-y-4 border-t border-slate-100 p-4">
              {/* Acciones del producto */}
              {editP?.id === g.id ? (
                <div className="space-y-2">
                  <input
                    value={editP.nombre}
                    onChange={(e) => setEditP({ ...editP, nombre: e.target.value })}
                    placeholder="Nombre"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
                  />
                  <input
                    value={editP.categoria}
                    onChange={(e) => setEditP({ ...editP, categoria: e.target.value })}
                    placeholder="Categoría"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={guardarProducto}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditP(null)}
                      className="rounded-lg bg-slate-200 px-4 py-2 text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      setEditP({ id: g.id, nombre: g.nombre, categoria: g.categoria ?? "" })
                    }
                    className="rounded-lg bg-slate-100 px-3 py-2 text-sm"
                  >
                    Editar nombre / categoría
                  </button>
                  <button
                    onClick={() => alternarProducto(g)}
                    className="rounded-lg bg-slate-100 px-3 py-2 text-sm"
                  >
                    {g.activo ? "Desactivar" : "Reactivar"}
                  </button>
                  <button
                    onClick={() => eliminarProducto(g)}
                    className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                </div>
              )}

              {/* Variantes */}
              <ul className="space-y-2">
                {g.filas.map((f) => (
                  <li
                    key={f.variante_id}
                    className={`rounded-lg bg-slate-50 p-3 text-sm ${
                      f.variante_activa ? "" : "opacity-60"
                    }`}
                  >
                    {editV?.id === f.variante_id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={editV.color}
                          onChange={(e) => setEditV({ ...editV, color: e.target.value })}
                          className="w-32 rounded-lg border border-slate-300 px-2 py-2"
                          aria-label="Color"
                        />
                        <input
                          value={editV.talla}
                          onChange={(e) => setEditV({ ...editV, talla: e.target.value })}
                          className="w-20 rounded-lg border border-slate-300 px-2 py-2"
                          aria-label="Talla"
                        />
                        <button
                          onClick={guardarVariante}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-white"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setEditV(null)}
                          className="rounded-lg bg-slate-200 px-3 py-2"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-medium">
                            {f.color} · {f.talla}
                          </span>
                          {!f.variante_activa && (
                            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs">
                              Inactiva
                            </span>
                          )}
                          <span className="ml-2 text-slate-500">
                            {f.stock} en stock · {f.vendidas} vendidas
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() =>
                              setEditV({ id: f.variante_id, color: f.color, talla: f.talla })
                            }
                            className="rounded-lg px-2 py-1.5 hover:bg-slate-200"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => alternarVariante(f)}
                            className="rounded-lg px-2 py-1.5 hover:bg-slate-200"
                          >
                            {f.variante_activa ? "Desactivar" : "Reactivar"}
                          </button>
                          <button
                            onClick={() => eliminarVariante(f)}
                            className="rounded-lg px-2 py-1.5 text-red-600 hover:bg-red-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        ))}
      </div>

      {/* Colores */}
      <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <h3 className="font-medium">Colores</h3>
        <p className="mt-1 text-sm text-slate-500">
          Renombrar un color lo cambia en todas las prendas (útil para unificar, por
          ejemplo, &quot;Blanca&quot; y &quot;Blanco&quot;).
        </p>
        <ul className="mt-3 space-y-1">
          {colores.map(([color, n]) => (
            <li key={color} className="flex items-center justify-between text-sm">
              <span>
                {color} <span className="text-slate-400">({n} variantes)</span>
              </span>
              <button
                onClick={() => renombrarColor(color)}
                className="rounded-lg px-3 py-1.5 hover:bg-slate-100"
              >
                Renombrar
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
