"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Paso, Opcion } from "@/components/ui";

type Variante = {
  variante_id: string;
  prenda: string;
  color: string;
  talla: string;
  stock: number;
};

type IngresoReciente = {
  id: string;
  cantidad: number;
  fecha: string;
  nota: string | null;
  variantes: {
    color: string;
    talla: string;
    productos: { nombre: string } | null;
  } | null;
};

const ORDEN_TALLA = ["XS", "S", "M", "L", "XL", "XXL"];

function hoy() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function IngresoStockPage() {
  const supabase = useMemo(() => createClient(), []);

  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [recientes, setRecientes] = useState<IngresoReciente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [prenda, setPrenda] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [talla, setTalla] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState(hoy());

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);

  const cargar = useCallback(async () => {
    const [stockRes, ingresosRes] = await Promise.all([
      supabase
        .from("stock_actual")
        .select("variante_id,prenda,color,talla,stock"),
      supabase
        .from("movimientos")
        .select("id,cantidad,fecha,nota,variantes(color,talla,productos(nombre))")
        .eq("tipo", "entrada")
        .not("created_by", "is", null)
        .is("anulado_at", null)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    if (stockRes.error) {
      setErrorCarga(stockRes.error.message);
    } else {
      setVariantes((stockRes.data ?? []) as Variante[]);
      setErrorCarga(null);
    }
    if (!ingresosRes.error) {
      setRecientes((ingresosRes.data ?? []) as unknown as IngresoReciente[]);
    }
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
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
  const puedeGuardar =
    !!seleccion && cantidad >= 1 && cantidad <= 10000 && !guardando;

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
    if (!seleccion) return;
    setGuardando(true);
    setMensaje(null);

    const { error } = await supabase.from("movimientos").insert({
      variante_id: seleccion.variante_id,
      tipo: "entrada",
      cantidad,
      nota: nota.trim() || null,
      fecha: new Date(`${fecha}T12:00:00`).toISOString(),
    });

    setGuardando(false);

    if (error) {
      setMensaje({
        tipo: "error",
        texto: `No se pudo guardar el ingreso: ${error.message}`,
      });
      return;
    }

    setMensaje({
      tipo: "ok",
      texto: `Ingreso registrado: ${seleccion.prenda} · ${seleccion.color} · talla ${seleccion.talla} + ${cantidad}. Ahora hay ${seleccion.stock + cantidad}.`,
    });
    setTalla(null);
    setCantidad(1);
    setNota("");
    await cargar();
  }

  async function anular(id: string) {
    if (!window.confirm("¿Anular este ingreso? Se restan esas unidades del stock y queda registrado como anulado.")) return;
    const { error } = await supabase.rpc("anular_movimiento", { p_id: id });
    if (error) {
      setMensaje({ tipo: "error", texto: error.message });
      return;
    }
    setMensaje({ tipo: "ok", texto: "Ingreso anulado." });
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
      <div>
        <h2 className="text-xl font-semibold">Ingresar stock</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cuando llega mercancía de una prenda que ya existe. Si es una prenda, color
          o talla nueva, usa la sección <strong>Productos</strong>.
        </p>
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
        <Paso numero={3} titulo="Talla (entre paréntesis, lo que hay ahora)">
          {tallas.map((v) => (
            <Opcion
              key={v.variante_id}
              texto={`${v.talla} (${v.stock})`}
              activa={talla === v.talla}
              onClick={() => elegirTalla(v.talla)}
            />
          ))}
        </Paso>
      )}

      {seleccion && (
        <>
          <section>
            <h3 className="mb-2 text-sm font-medium text-slate-600">4. Cantidad que llegó</h3>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                className="h-12 w-12 rounded-xl bg-white text-2xl ring-1 ring-slate-300"
                aria-label="Menos"
              >
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                value={cantidad}
                onChange={(e) =>
                  setCantidad(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                }
                className="h-12 w-24 rounded-xl border border-slate-300 bg-white text-center text-xl font-semibold"
              />
              <button
                onClick={() => setCantidad((c) => Math.min(10000, c + 1))}
                className="h-12 w-12 rounded-xl bg-white text-2xl ring-1 ring-slate-300"
                aria-label="Más"
              >
                +
              </button>
              {[5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setCantidad((c) => Math.min(10000, c + n))}
                  className="h-12 rounded-xl bg-white px-4 text-base ring-1 ring-slate-300"
                >
                  +{n}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-slate-600">5. Fecha</h3>
            <input
              type="date"
              value={fecha}
              max={hoy()}
              onChange={(e) => setFecha(e.target.value || hoy())}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
            />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-slate-600">
              6. Nota (opcional: proveedor, pedido, etc.)
            </h3>
            <input
              type="text"
              value={nota}
              maxLength={120}
              onChange={(e) => setNota(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
            />
          </section>

          <button
            onClick={guardar}
            disabled={!puedeGuardar}
            className="w-full rounded-xl bg-slate-900 py-4 text-lg font-medium text-white disabled:opacity-40"
          >
            {guardando ? "Guardando..." : `Registrar ingreso de ${cantidad} ${cantidad === 1 ? "unidad" : "unidades"}`}
          </button>
        </>
      )}

      <section className="pt-4">
        <h3 className="mb-2 text-sm font-medium text-slate-600">
          Últimos ingresos registrados en la app
        </h3>
        {recientes.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no hay ingresos registrados aquí.</p>
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
                    {r.variantes?.talla} + {r.cantidad}
                  </p>
                  <p className="text-slate-500">
                    {new Date(r.fecha).toLocaleDateString("es-CO")}
                    {r.nota ? ` · ${r.nota}` : ""}
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
