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
  producto_id: string;
  producto_activo: boolean;
  variante_activa: boolean;
};

type Venta = {
  variante_id: string;
  cantidad: number;
  canal: string | null;
  fecha: string;
  created_by: string | null; // null = dato histórico importado del Excel
};

// ---------- Fechas (todo en formato AAAA-MM-DD, en UTC, para evitar corrimientos) ----------
const MS_DIA = 86400000;

function hoyISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const aISO = (f: string) => new Date(f).toISOString().slice(0, 10);
const dias = (desde: string, hasta: string) =>
  Math.round(
    (Date.parse(hasta + "T00:00:00Z") - Date.parse(desde + "T00:00:00Z")) / MS_DIA
  );
function sumarDias(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function lunes(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
const corto = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

// ---------- Descarga CSV (abre directo en Excel) ----------
function descargarCSV(nombre: string, filas: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "\uFEFF" + filas.map((f) => f.map(esc).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

async function cargarVentas(
  supabase: ReturnType<typeof createClient>
): Promise<Venta[]> {
  const salida: Venta[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("movimientos")
      .select("variante_id,cantidad,canal,fecha,created_by")
      .eq("tipo", "venta")
      .is("anulado_at", null)
      .order("fecha", { ascending: false })
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    salida.push(...((data ?? []) as Venta[]));
    if (!data || data.length < 1000) break;
  }
  return salida;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const hoy = useMemo(() => hoyISO(), []);

  const [filas, setFilas] = useState<Fila[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [incluirHist, setIncluirHist] = useState(false);
  const [umbral, setUmbral] = useState(45);
  const [agrupar, setAgrupar] = useState<"prenda" | "color" | "talla">("prenda");

  useEffect(() => {
    async function cargar() {
      try {
        const [detalle, v] = await Promise.all([
          supabase.from("variantes_detalle").select("*"),
          cargarVentas(supabase),
        ]);
        if (detalle.error) throw new Error(detalle.error.message);
        setFilas((detalle.data ?? []) as Fila[]);
        setVentas(v);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
      setCargando(false);
    }
    cargar();
  }, [supabase]);

  const activas = useMemo(
    () => filas.filter((f) => f.variante_activa && f.producto_activo),
    [filas]
  );
  const porId = useMemo(() => new Map(filas.map((f) => [f.variante_id, f])), [filas]);

  const ventasApp = useMemo(() => ventas.filter((v) => v.created_by !== null), [ventas]);
  const ventasVisibles = incluirHist ? ventas : ventasApp;

  // ---------- Indicadores ----------
  const stockTotal = activas.reduce((s, f) => s + f.stock, 0);
  const criticas = activas.filter((f) => f.stock <= 2).length;

  const ultimos = (n: number) =>
    ventasVisibles
      .filter((v) => {
        const d = dias(aISO(v.fecha), hoy);
        return d >= 0 && d < n;
      })
      .reduce((s, v) => s + v.cantidad, 0);
  const v7 = ultimos(7);
  const v30 = ultimos(30);

  const primeraApp = ventasApp.length
    ? ventasApp.map((v) => aISO(v.fecha)).sort()[0]
    : null;
  const totalApp = ventasApp.reduce((s, v) => s + v.cantidad, 0);
  const semanasApp = primeraApp ? Math.max(1, dias(primeraApp, hoy) / 7) : 0;
  const promedioSemanal = primeraApp ? totalApp / semanasApp : null;

  // ---------- Ventas por semana (últimas 12) ----------
  const semanas = useMemo(() => {
    const inicio = sumarDias(lunes(hoy), -77);
    const arr = Array.from({ length: 12 }, (_, i) => ({
      inicio: sumarDias(inicio, i * 7),
      total: 0,
    }));
    ventasVisibles.forEach((v) => {
      const l = lunes(aISO(v.fecha));
      const s = arr.find((x) => x.inicio === l);
      if (s) s.total += v.cantidad;
    });
    return arr;
  }, [ventasVisibles, hoy]);
  const maxSemana = Math.max(1, ...semanas.map((s) => s.total));

  // ---------- Ventas por canal ----------
  const canales = useMemo(() => {
    const m = new Map<string, number>();
    ventasVisibles.forEach((v) => {
      const c = v.canal ?? "Sin canal";
      m.set(c, (m.get(c) ?? 0) + v.cantidad);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [ventasVisibles]);
  const maxCanal = Math.max(1, ...canales.map((c) => c[1]));

  // ---------- Rotación ----------
  const rotacion = useMemo(() => {
    const m = new Map<
      string,
      { clave: string; ingresado: number; vendidas: number; stock: number }
    >();
    activas.forEach((f) => {
      const k = agrupar === "prenda" ? f.prenda : agrupar === "color" ? f.color : f.talla;
      const g = m.get(k) ?? { clave: k, ingresado: 0, vendidas: 0, stock: 0 };
      g.ingresado += f.ingresado;
      g.vendidas += f.vendidas;
      g.stock += f.stock;
      m.set(k, g);
    });
    return Array.from(m.values())
      .map((g) => ({ ...g, rot: g.ingresado > 0 ? g.vendidas / g.ingresado : null }))
      .sort((a, b) => (b.rot ?? -1) - (a.rot ?? -1));
  }, [activas, agrupar]);

  // ---------- Listas de acción ----------
  const sinDatos = activas.filter(
    (f) => f.stock > 0 && f.ingresado === 0 && f.vendidas === 0
  );
  const estancadas = activas
    .filter((f) => f.stock > 0 && !(f.ingresado === 0 && f.vendidas === 0))
    .map((f) => ({
      ...f,
      diasSinVenta: f.ultima_venta ? dias(aISO(f.ultima_venta), hoy) : null,
    }))
    .filter(
      (f) =>
        f.vendidas === 0 || (f.diasSinVenta !== null && f.diasSinVenta >= umbral)
    )
    .sort((a, b) => b.stock - a.stock);

  const reponer = activas
    .filter((f) => f.stock <= 2 && f.vendidas > 0)
    .sort((a, b) => b.vendidas - a.vendidas)
    .slice(0, 10);

  const top = [...activas].sort((a, b) => b.vendidas - a.vendidas).slice(0, 5);
  const maxTop = Math.max(1, ...top.map((t) => t.vendidas));

  function exportarInventario() {
    const filasCSV: (string | number | null)[][] = [
      ["Prenda", "Categoría", "Color", "Talla", "Stock", "Ingresado", "Vendidas", "Última venta", "Estado"],
      ...filas.map((f) => [
        f.prenda,
        f.categoria,
        f.color,
        f.talla,
        f.stock,
        f.ingresado,
        f.vendidas,
        f.ultima_venta ? aISO(f.ultima_venta) : null,
        f.variante_activa && f.producto_activo ? "Activa" : "Inactiva",
      ]),
    ];
    descargarCSV(`inventario_coli_${hoy}.csv`, filasCSV);
  }

  function exportarVentas() {
    const filasCSV: (string | number | null)[][] = [
      ["Fecha", "Prenda", "Color", "Talla", "Cantidad", "Canal", "Origen"],
      ...ventas.map((v) => {
        const f = porId.get(v.variante_id);
        return [
          aISO(v.fecha),
          f?.prenda ?? "",
          f?.color ?? "",
          f?.talla ?? "",
          v.cantidad,
          v.canal,
          v.created_by === null ? "Histórica (Excel)" : "App",
        ];
      }),
    ];
    descargarCSV(`ventas_coli_${hoy}.csv`, filasCSV);
  }

  if (cargando) return <p className="text-slate-500">Cargando dashboard...</p>;
  if (error)
    return (
      <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar el dashboard: {error}
      </p>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportarInventario}
            className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-300"
          >
            ⬇ Inventario (Excel/CSV)
          </button>
          <button
            onClick={exportarVentas}
            className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-300"
          >
            ⬇ Ventas (Excel/CSV)
          </button>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi titulo="Unidades en stock" valor={stockTotal} />
        <Kpi titulo="Vendidas últimos 7 días" valor={v7} />
        <Kpi titulo="Vendidas últimos 30 días" valor={v30} />
        <Kpi
          titulo="Promedio semanal (app)"
          valor={promedioSemanal === null ? "—" : promedioSemanal.toFixed(1)}
          nota={primeraApp ? `desde el ${corto(primeraApp)}` : "sin ventas en la app aún"}
        />
        <Kpi titulo="Stock crítico (≤2)" valor={criticas} alerta={criticas > 0} />
        <Kpi titulo="Variantes estancadas" valor={estancadas.length} alerta={estancadas.length > 0} />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={incluirHist}
          onChange={(e) => setIncluirHist(e.target.checked)}
          className="h-4 w-4"
        />
        Incluir en los indicadores de ventas las del Excel inicial (Feria EVA, fecha aproximada)
      </label>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ventas por semana */}
        <Bloque titulo="Ventas por semana (últimas 12)">
          <div className="flex h-44 items-end gap-1.5">
            {semanas.map((s) => (
              <div key={s.inicio} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] text-slate-500">{s.total || ""}</span>
                <div
                  className="w-full rounded-t bg-slate-800"
                  style={{ height: `${(s.total / maxSemana) * 100}%`, minHeight: s.total ? 4 : 1 }}
                />
                <span className="text-[10px] text-slate-400">{corto(s.inicio)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Cada barra es una semana (empieza el lunes indicado).
          </p>
        </Bloque>

        {/* Canales */}
        <Bloque titulo="Ventas por canal">
          {canales.length === 0 ? (
            <Vacio texto="Todavía no hay ventas con canal para mostrar." />
          ) : (
            <div className="space-y-2">
              {canales.map(([canal, n]) => (
                <Barra key={canal} etiqueta={canal} valor={n} max={maxCanal} derecha={`${n}`} />
              ))}
            </div>
          )}
        </Bloque>

        {/* Rotación */}
        <Bloque
          titulo="Rotación (vendidas ÷ ingresadas)"
          derecha={
            <select
              value={agrupar}
              onChange={(e) => setAgrupar(e.target.value as "prenda" | "color" | "talla")}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
            >
              <option value="prenda">Por prenda</option>
              <option value="color">Por color</option>
              <option value="talla">Por talla</option>
            </select>
          }
        >
          <div className="space-y-2">
            {rotacion.map((g) => (
              <Barra
                key={g.clave}
                etiqueta={g.clave}
                valor={g.rot === null ? 0 : g.rot * 100}
                max={100}
                derecha={g.rot === null ? "Sin datos" : `${Math.round(g.rot * 100)}% · ${g.stock} en stock`}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Más alto = se vende más rápido. &quot;Sin datos&quot; = no hay inventario inicial registrado.
          </p>
        </Bloque>

        {/* Más vendidas */}
        <Bloque titulo="Variantes más vendidas">
          {top.every((t) => t.vendidas === 0) ? (
            <Vacio texto="Todavía no hay ventas." />
          ) : (
            <div className="space-y-2">
              {top.map((t) => (
                <Barra
                  key={t.variante_id}
                  etiqueta={`${t.prenda} · ${t.color} · ${t.talla}`}
                  valor={t.vendidas}
                  max={maxTop}
                  derecha={`${t.vendidas}`}
                />
              ))}
            </div>
          )}
        </Bloque>
      </div>

      {/* Reponer */}
      <Bloque titulo="Por reponer (se venden y quedan 2 o menos)">
        {reponer.length === 0 ? (
          <Vacio texto="Nada urgente por reponer." />
        ) : (
          <TablaSimple
            columnas={["Prenda", "Color", "Talla", "En stock", "Vendidas"]}
            filas={reponer.map((f) => [f.prenda, f.color, f.talla, f.stock, f.vendidas])}
            resaltar={(fila) => fila[3] === 0}
          />
        )}
      </Bloque>

      {/* Estancadas */}
      <Bloque
        titulo="Stock estancado"
        derecha={
          <select
            value={umbral}
            onChange={(e) => setUmbral(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value={30}>Sin ventas 30+ días</option>
            <option value={45}>Sin ventas 45+ días</option>
            <option value={60}>Sin ventas 60+ días</option>
          </select>
        }
      >
        {estancadas.length === 0 ? (
          <Vacio texto="No hay variantes estancadas con este criterio." />
        ) : (
          <TablaSimple
            columnas={["Prenda", "Color", "Talla", "En stock", "Situación"]}
            filas={estancadas.map((f) => [
              f.prenda,
              f.color,
              f.talla,
              f.stock,
              f.vendidas === 0
                ? "Nunca se ha vendido"
                : `${f.diasSinVenta} días sin venta`,
            ])}
          />
        )}
        <p className="mt-2 text-xs text-slate-400">
          Las ventas del Excel inicial tienen fecha aproximada (16/09), así que los
          &quot;días sin venta&quot; de esas variantes son una estimación.
        </p>
      </Bloque>

      {sinDatos.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong>{sinDatos.length} variantes</strong> (
          {sinDatos.reduce((s, f) => s + f.stock, 0)} unidades) no tienen inventario inicial
          ni ventas registradas
          {" "}({Array.from(new Set(sinDatos.map((f) => f.prenda))).join(", ")}).
          No aparecen como estancadas porque no hay datos para saberlo.
        </div>
      )}
    </div>
  );
}

// ---------- Piezas visuales ----------
function Kpi({
  titulo,
  valor,
  nota,
  alerta = false,
}: {
  titulo: string;
  valor: number | string;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold ${alerta ? "text-red-600" : ""}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] text-slate-400">{nota}</p>}
    </div>
  );
}

function Bloque({
  titulo,
  derecha,
  children,
}: {
  titulo: string;
  derecha?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-medium">{titulo}</h3>
        {derecha}
      </div>
      {children}
    </section>
  );
}

function Barra({
  etiqueta,
  valor,
  max,
  derecha,
}: {
  etiqueta: string;
  valor: number;
  max: number;
  derecha: string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between gap-2 text-sm">
        <span className="truncate">{etiqueta}</span>
        <span className="shrink-0 text-slate-500">{derecha}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100">
        <div
          className="h-2.5 rounded-full bg-slate-800"
          style={{ width: `${Math.min(100, (valor / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="text-sm text-slate-400">{texto}</p>;
}

function TablaSimple({
  columnas,
  filas,
  resaltar,
}: {
  columnas: string[];
  filas: (string | number)[][];
  resaltar?: (fila: (string | number)[]) => boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-slate-500">
          <tr>
            {columnas.map((c) => (
              <th key={c} className="px-2 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr
              key={i}
              className={`border-t border-slate-100 ${
                resaltar?.(fila) ? "bg-red-50" : ""
              }`}
            >
              {fila.map((celda, j) => (
                <td key={j} className="px-2 py-2">
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
