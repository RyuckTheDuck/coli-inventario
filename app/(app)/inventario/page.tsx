"use client";

import { useEffect, useMemo, useState } from "react";
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
};

const ORDEN_TALLA = ["XS", "S", "M", "L", "XL", "XXL"];

// Semáforo simple (luego lo haremos configurable)
function estado(stock: number) {
  if (stock <= 2) return { texto: "Crítico", clase: "bg-red-100 text-red-700" };
  if (stock <= 5) return { texto: "Bajo", clase: "bg-amber-100 text-amber-800" };
  return { texto: "OK", clase: "bg-emerald-100 text-emerald-700" };
}

export default function InventarioPage() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prenda, setPrenda] = useState("todas");

  useEffect(() => {
    async function cargar() {
      const supabase = createClient();
      const { data, error } = await supabase.from("stock_actual").select("*");
      if (error) {
        setError(error.message);
      } else {
        setFilas((data ?? []) as Fila[]);
      }
      setCargando(false);
    }
    cargar();
  }, []);

  const prendas = useMemo(
    () => Array.from(new Set(filas.map((f) => f.prenda))).sort(),
    [filas]
  );

  const visibles = useMemo(() => {
    return filas
      .filter((f) => prenda === "todas" || f.prenda === prenda)
      .sort(
        (a, b) =>
          a.prenda.localeCompare(b.prenda) ||
          a.color.localeCompare(b.color) ||
          ORDEN_TALLA.indexOf(a.talla) - ORDEN_TALLA.indexOf(b.talla)
      );
  }, [filas, prenda]);

  const totalStock = visibles.reduce((s, f) => s + f.stock, 0);
  const totalVendidas = visibles.reduce((s, f) => s + f.vendidas, 0);
  const criticas = visibles.filter((f) => f.stock <= 2).length;

  if (cargando) return <p className="text-slate-500">Cargando inventario...</p>;
  if (error)
    return (
      <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar el inventario: {error}
      </p>
    );

  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="text-xl font-semibold">Inventario</h2>

      {/* Resumen */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tarjeta titulo="Unidades en stock" valor={totalStock} />
        <Tarjeta titulo="Variantes" valor={visibles.length} />
        <Tarjeta titulo="Vendidas (histórico)" valor={totalVendidas} />
        <Tarjeta titulo="Stock crítico" valor={criticas} alerta={criticas > 0} />
      </div>

      {/* Filtro */}
      <div className="mt-6">
        <select
          value={prenda}
          onChange={(e) => setPrenda(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base md:w-64"
        >
          <option value="todas">Todas las prendas</option>
          {prendas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Tabla (PC) */}
      <div className="mt-4 hidden overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200 md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3">Prenda</th>
              <th className="px-4 py-3">Color</th>
              <th className="px-4 py-3">Talla</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Vendidas</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const e = estado(f.stock);
              return (
                <tr key={f.variante_id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">{f.prenda}</td>
                  <td className="px-4 py-2.5">{f.color}</td>
                  <td className="px-4 py-2.5">{f.talla}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{f.stock}</td>
                  <td className="px-4 py-2.5 text-right">{f.vendidas}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.clase}`}>
                      {e.texto}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tarjetas (celular) */}
      <div className="mt-4 space-y-2 md:hidden">
        {visibles.map((f) => {
          const e = estado(f.stock);
          return (
            <div
              key={f.variante_id}
              className="flex items-center justify-between rounded-xl bg-white p-3 ring-1 ring-slate-200"
            >
              <div>
                <p className="font-medium">{f.prenda}</p>
                <p className="text-sm text-slate-500">
                  {f.color} · Talla {f.talla} · {f.vendidas} vendidas
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold">{f.stock}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.clase}`}>
                  {e.texto}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  alerta = false,
}: {
  titulo: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold ${alerta ? "text-red-600" : ""}`}>
        {valor}
      </p>
    </div>
  );
}
