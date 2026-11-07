"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Variante = {
  variante_id: string;
  prenda: string;
  color: string;
  talla: string;
  stock: number;
};

type VentaReciente = {
  id: string;
  cantidad: number;
  canal: string | null;
  fecha: string;
  variantes: {
    color: string;
    talla: string;
    productos: { nombre: string } | null;
  } | null;
};

const ORDEN_TALLA = ["XS", "S", "M", "L", "XL", "XXL"];
const CANALES = ["Tienda", "Feria", "Redes sociales", "WhatsApp", "Otro"];

// Fecha de hoy en formato YYYY-MM-DD (hora local, no UTC)
function hoy() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function NuevaVentaPage() {
  const supabase = useMemo(() => createClient(), []);

  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [recientes, setRecientes] = useState<VentaReciente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [prenda, setPrenda] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [talla, setTalla] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [canal, setCanal] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoy());

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);

  const cargar = useCallback(async () => {
    const [stockRes, ventasRes] = await Promise.all([
      supabase
        .from("stock_actual")
        .select("variante_id,prenda,color,talla,stock"),
      supabase
        .from("movimientos")
        .select("id,cantidad,canal,fecha,variantes(color,talla,productos(nombre))")
        .eq("tipo", "venta")
        .not("created_by", "is", null) // solo ventas hechas desde la app
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    if (stockRes.error) {
      setErrorCarga(stockRes.error.message);
    } else {
      setVariantes((stockRes.data ?? []) as Variante[]);
      setErrorCarga(null);
    }
    if (!ventasRes.error) {
      setRecientes((ventasRes.data ?? []) as unknown as VentaReciente[]);
    }
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
    // Recordar el último canal usado
    try {
      const guardado = localStorage.getItem("coli_canal");
      if (guardado) setCanal(guardado);
    } catch {
      /* si el navegador no permite guardar, no pasa nada */
    }
  }, [cargar]);

  const prendas = useMemo(
    () => Array.from(new Set(variantes.map((v) => v.prenda))).sort(),
    [variantes]
  );

  const colores = useMemo(
    () =>
      prenda
        ? Array.from(
            new Set(variantes.filter((v) => v.prenda === prenda).map((v) => v.color))
          ).sort()
        : [],
    [variantes, prenda]
  );

  const tallas = useMemo(
    () =>
      prenda && color
        ? variantes
            .filter((v) => v.prenda === prenda && v.color === color)
            .sort(
              (a, b) =>
                ORDEN_TALLA.indexOf(a.talla) - ORDEN_TALLA.indexOf(b.talla)
            )
        : [],
    [variantes, prenda, color]
  );

  const seleccion = tallas.find((v) => v.talla === talla) ?? null;
  const stockDisponible = seleccion?.stock ?? 0;
  const puedeGuardar = !!seleccion && !!canal && cantidad >= 1 && cantidad <= stockDisponible && !guardando;

  function elegirPrenda(p: string) {
    setPrenda(p);
    setColor(null);
    setTalla(null);
    setCantidad(1);
    setMensaje(null);
  }
  function elegirColor(c: string) {
    setColor(c);
    setTalla(null);
    setCantidad(1);
    setMensaje(null);
  }
  function elegirTalla(t: string) {
    setTalla(t);
    setCantidad(1);
    setMensaje(null);
  }

  async function guardar() {
    if (!seleccion || !canal) return;
    setGuardando(true);
    setMensaje(null);

    const { error } = await supabase.from("movimientos").insert({
      variante_id: seleccion.variante_id,
      tipo: "venta",
      cantidad,
      canal,
      // A las 12:00 para que la zona horaria no cambie el día
      fecha: new Date(`${fecha}T12:00:00`).toISOString(),
    });

    setGuardando(false);

    if (error) {
      setMensaje({
        tipo: "error",
        texto: error.message.includes("Stock insuficiente")
          ? error.message
          : `No se pudo guardar la venta: ${error.message}`,
      });
      await cargar();
      return;
    }

    try {
      localStorage.setItem("coli_canal", canal);
    } catch {
      /* ignorar */
    }

    setMensaje({
      tipo: "ok",
      texto: `Venta registrada: ${seleccion.prenda} · ${seleccion.color} · talla ${seleccion.talla} × ${cantidad}. Quedan ${seleccion.stock - cantidad}.`,
    });
    setTalla(null);
    setCantidad(1);
    await cargar();
  }

  async function anular(id: string) {
    if (!window.confirm("¿Anular esta venta? La unidad vuelve al stock.")) return;
    const { error } = await supabase.from("movimientos").delete().eq("id", id);
    if (error) {
      setMensaje({ tipo: "error", texto: `No se pudo anular: ${error.message}` });
      return;
    }
    setMensaje({ tipo: "ok", texto: "Venta anulada." });
    await cargar();
  }

  if (cargando) return <p className="text-slate-500">Cargando...</p>;
  if (errorCarga)
    return (
      <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        No se pudo cargar el inventario: {errorCarga}
      </p>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold">Registrar venta</h2>

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

      <Paso numero={1} titulo="Prenda">
        {prendas.map((p) => (
          <Opcion key={p} texto={p} activa={prenda === p} onClick={() => elegirPrenda(p)} />
        ))}
      </Paso>

      {prenda && (
        <Paso numero={2} titulo="Color">
          {colores.map((c) => (
            <Opcion key={c} texto={c} activa={color === c} onClick={() => elegirColor(c)} />
          ))}
        </Paso>
      )}

      {prenda && color && (
        <Paso numero={3} titulo="Talla (entre paréntesis, lo que hay)">
          {tallas.map((v) => (
            <Opcion
              key={v.variante_id}
              texto={`${v.talla} (${v.stock})`}
              activa={talla === v.talla}
              deshabilitada={v.stock <= 0}
              onClick={() => elegirTalla(v.talla)}
            />
          ))}
        </Paso>
      )}

      {seleccion && (
        <>
          <section>
            <h3 className="mb-2 text-sm font-medium text-slate-600">4. Cantidad</h3>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                className="h-12 w-12 rounded-xl bg-white text-2xl ring-1 ring-slate-300"
                aria-label="Menos"
              >
                −
              </button>
              <span className="w-10 text-center text-2xl font-semibold">{cantidad}</span>
              <button
                onClick={() => setCantidad((c) => Math.min(stockDisponible, c + 1))}
                className="h-12 w-12 rounded-xl bg-white text-2xl ring-1 ring-slate-300"
                aria-label="Más"
              >
                +
              </button>
              <span className="text-sm text-slate-500">
                Disponibles: {stockDisponible}
              </span>
            </div>
          </section>

          <Paso numero={5} titulo="Canal de venta">
            {CANALES.map((c) => (
              <Opcion key={c} texto={c} activa={canal === c} onClick={() => setCanal(c)} />
            ))}
          </Paso>

          <section>
            <h3 className="mb-2 text-sm font-medium text-slate-600">6. Fecha</h3>
            <input
              type="date"
              value={fecha}
              max={hoy()}
              onChange={(e) => setFecha(e.target.value || hoy())}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
            />
          </section>

          <button
            onClick={guardar}
            disabled={!puedeGuardar}
            className="w-full rounded-xl bg-slate-900 py-4 text-lg font-medium text-white disabled:opacity-40"
          >
            {guardando
              ? "Guardando..."
              : `Registrar venta de ${cantidad} ${cantidad === 1 ? "unidad" : "unidades"}`}
          </button>
          {!canal && (
            <p className="-mt-3 text-sm text-slate-500">Elige el canal de venta para continuar.</p>
          )}
        </>
      )}

      {/* Últimas ventas registradas desde la app */}
      <section className="pt-4">
        <h3 className="mb-2 text-sm font-medium text-slate-600">
          Últimas ventas registradas en la app
        </h3>
        {recientes.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no hay ventas registradas aquí.</p>
        ) : (
          <ul className="space-y-2">
            {recientes.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200"
              >
                <div>
                  <p className="font-medium">
                    {r.variantes?.productos?.nombre ?? "Prenda"} · {r.variantes?.color} ·{" "}
                    {r.variantes?.talla} × {r.cantidad}
                  </p>
                  <p className="text-slate-500">
                    {new Date(r.fecha).toLocaleDateString("es-CO")} · {r.canal ?? "sin canal"}
                  </p>
                </div>
                <button
                  onClick={() => anular(r.id)}
                  className="rounded-lg px-3 py-1.5 text-red-600 hover:bg-red-50"
                >
                  Anular
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Paso({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-slate-600">
        {numero}. {titulo}
      </h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function Opcion({
  texto,
  activa,
  deshabilitada = false,
  onClick,
}: {
  texto: string;
  activa: boolean;
  deshabilitada?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitada}
      className={`min-h-12 rounded-xl px-4 py-2 text-base ring-1 ${
        activa
          ? "bg-slate-900 text-white ring-slate-900"
          : "bg-white text-slate-800 ring-slate-300 hover:bg-slate-50"
      } disabled:bg-slate-100 disabled:text-slate-400 disabled:line-through`}
    >
      {texto}
    </button>
  );
}
