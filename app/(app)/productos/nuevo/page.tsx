"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Producto = { nombre: string; categoria: string | null };
type Existente = { prenda: string; color: string; talla: string; stock: number };

const TALLAS_BASE = ["XS", "S", "M", "L", "XL", "XXL"];
const MAX_VARIANTES = 100;

const clave = (color: string, talla: string) =>
  `${color.toLowerCase()}|${talla.toUpperCase()}`;

const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default function ProductosPage() {
  const supabase = useMemo(() => createClient(), []);

  const [modo, setModo] = useState<"nuevo" | "existente">("nuevo");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [existentes, setExistentes] = useState<Existente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [colores, setColores] = useState<string[]>([]);
  const [colorTxt, setColorTxt] = useState("");
  const [tallas, setTallas] = useState<string[]>([]);
  const [tallaTxt, setTallaTxt] = useState("");
  const [cant, setCant] = useState<Record<string, number>>({});

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);

  const cargar = useCallback(async () => {
    const [pRes, sRes] = await Promise.all([
      supabase.from("productos").select("nombre,categoria").order("nombre"),
      supabase.from("stock_actual").select("prenda,color,talla,stock"),
    ]);
    if (pRes.error || sRes.error) {
      setErrorCarga((pRes.error ?? sRes.error)!.message);
    } else {
      setProductos((pRes.data ?? []) as Producto[]);
      setExistentes((sRes.data ?? []) as Existente[]);
      setErrorCarga(null);
    }
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const categorias = useMemo(
    () =>
      Array.from(
        new Set(productos.map((p) => p.categoria).filter((c): c is string => !!c))
      ).sort(),
    [productos]
  );

  // Variantes que ya existen del producto elegido (solo modo "existente")
  const delProducto = useMemo(() => {
    const mapa = new Map<string, number>();
    if (modo === "existente" && nombre) {
      existentes
        .filter((e) => e.prenda === nombre)
        .forEach((e) => mapa.set(clave(e.color, e.talla), e.stock));
    }
    return mapa;
  }, [existentes, modo, nombre]);

  const combos = useMemo(
    () => colores.flatMap((c) => tallas.map((t) => ({ color: c, talla: t }))),
    [colores, tallas]
  );
  const totalUnidades = combos.reduce(
    (s, x) => s + (cant[clave(x.color, x.talla)] ?? 0),
    0
  );

  function cambiarModo(m: "nuevo" | "existente") {
    setModo(m);
    setNombre("");
    setCategoria("");
    setColores([]);
    setTallas([]);
    setCant({});
    setMensaje(null);
  }

  function agregarColor() {
    const c = capitalizar(colorTxt.trim());
    if (!c) return;
    if (!colores.some((x) => x.toLowerCase() === c.toLowerCase())) {
      setColores([...colores, c]);
    }
    setColorTxt("");
  }

  function alternarTalla(t: string) {
    setTallas((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      const nuevo = [...prev, t];
      const idx = (x: string) => {
        const i = TALLAS_BASE.indexOf(x);
        return i === -1 ? 99 : i;
      };
      return nuevo.sort((a, b) => idx(a) - idx(b));
    });
  }

  function agregarTallaPersonalizada() {
    const t = tallaTxt.trim().toUpperCase();
    if (!t) return;
    if (!tallas.includes(t)) setTallas([...tallas, t]);
    setTallaTxt("");
  }

  function cargarDelProducto() {
    const filas = existentes.filter((e) => e.prenda === nombre);
    const cols = Array.from(new Set(filas.map((f) => f.color))).sort();
    const tals = Array.from(new Set(filas.map((f) => f.talla))).sort((a, b) => {
      const ia = TALLAS_BASE.indexOf(a);
      const ib = TALLAS_BASE.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    setColores(cols);
    setTallas(tals);
  }

  async function guardar() {
    setMensaje(null);
    const nombreLimpio = nombre.trim();

    if (!nombreLimpio) {
      setMensaje({ tipo: "error", texto: "Escribe o elige el nombre del producto." });
      return;
    }
    if (
      modo === "nuevo" &&
      productos.some((p) => p.nombre.toLowerCase() === nombreLimpio.toLowerCase())
    ) {
      setMensaje({
        tipo: "error",
        texto: "Ese producto ya existe. Cambia a 'Producto existente' para agregarle colores, tallas o stock.",
      });
      return;
    }
    if (combos.length === 0) {
      setMensaje({ tipo: "error", texto: "Agrega al menos un color y una talla." });
      return;
    }
    if (combos.length > MAX_VARIANTES) {
      setMensaje({
        tipo: "error",
        texto: `Son ${combos.length} variantes. El máximo por vez es ${MAX_VARIANTES}.`,
      });
      return;
    }

    setGuardando(true);
    const items = combos.map((x) => ({
      color: x.color,
      talla: x.talla,
      cantidad: cant[clave(x.color, x.talla)] ?? 0,
    }));

    const { data, error } = await supabase.rpc("crear_variantes", {
      p_producto: nombreLimpio,
      p_categoria: categoria.trim() || null,
      p_items: items,
    });
    setGuardando(false);

    if (error) {
      setMensaje({ tipo: "error", texto: `No se pudo guardar: ${error.message}` });
      return;
    }

    const r = data as {
      producto_nuevo: boolean;
      variantes_nuevas: number;
      unidades: number;
    };
    setMensaje({
      tipo: "ok",
      texto: `${r.producto_nuevo ? "Producto creado" : "Producto actualizado"}: ${nombreLimpio}. Variantes nuevas: ${r.variantes_nuevas}. Unidades ingresadas: ${r.unidades}.`,
    });
    setColores([]);
    setTallas([]);
    setCant({});
    if (modo === "nuevo") {
      setNombre("");
      setCategoria("");
    }
    await cargar();
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
      <div>
        <h2 className="text-xl font-semibold">Productos y variantes</h2>
        <p className="mt-1 text-sm text-slate-500">
          Crea una prenda nueva o agrega colores y tallas nuevas a una que ya existe,
          con su stock.
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

      {/* Modo */}
      <div className="inline-flex rounded-xl bg-slate-200 p-1">
        {(["nuevo", "existente"] as const).map((m) => (
          <button
            key={m}
            onClick={() => cambiarModo(m)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              modo === m ? "bg-white shadow-sm" : "text-slate-600"
            }`}
          >
            {m === "nuevo" ? "Producto nuevo" : "Producto existente"}
          </button>
        ))}
      </div>

      {/* Nombre y categoría */}
      <section className="space-y-3">
        {modo === "nuevo" ? (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">
                Nombre del producto
              </label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Buzo mujer"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">
                Categoría (opcional)
              </label>
              <input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                list="categorias"
                placeholder="Ej: Buzos"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
              />
              <datalist id="categorias">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Producto
            </label>
            <select
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                setColores([]);
                setTallas([]);
                setCant({});
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
            >
              <option value="">Elige un producto</option>
              {productos.map((p) => (
                <option key={p.nombre} value={p.nombre}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {nombre && (
              <button
                type="button"
                onClick={cargarDelProducto}
                className="mt-2 text-sm text-slate-700 underline"
              >
                Cargar los colores y tallas que ya tiene (para ingresar stock en lote)
              </button>
            )}
          </div>
        )}
      </section>

      {/* Colores */}
      <section>
        <h3 className="mb-2 text-sm font-medium text-slate-600">Colores</h3>
        <div className="flex gap-2">
          <input
            value={colorTxt}
            onChange={(e) => setColorTxt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregarColor();
              }
            }}
            placeholder="Ej: Negro"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
          />
          <button
            type="button"
            onClick={agregarColor}
            className="rounded-lg bg-slate-900 px-4 text-white"
          >
            Agregar
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {colores.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-slate-300"
            >
              {c}
              <button
                type="button"
                onClick={() => setColores(colores.filter((x) => x !== c))}
                aria-label={`Quitar ${c}`}
                className="text-slate-400 hover:text-red-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Tallas */}
      <section>
        <h3 className="mb-2 text-sm font-medium text-slate-600">Tallas</h3>
        <div className="flex flex-wrap gap-2">
          {TALLAS_BASE.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => alternarTalla(t)}
              className={`min-h-11 min-w-12 rounded-xl px-3 ring-1 ${
                tallas.includes(t)
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-800 ring-slate-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={tallaTxt}
            onChange={(e) => setTallaTxt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregarTallaPersonalizada();
              }
            }}
            placeholder="Otra talla (Ej: 28, Única)"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
          />
          <button
            type="button"
            onClick={agregarTallaPersonalizada}
            className="rounded-lg bg-slate-200 px-4"
          >
            Agregar
          </button>
        </div>
        {tallas.filter((t) => !TALLAS_BASE.includes(t)).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {tallas
              .filter((t) => !TALLAS_BASE.includes(t))
              .map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-slate-300"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTallas(tallas.filter((x) => x !== t))}
                    aria-label={`Quitar ${t}`}
                    className="text-slate-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              ))}
          </div>
        )}
      </section>

      {/* Cuadrícula de stock */}
      {combos.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-medium text-slate-600">
            {modo === "nuevo"
              ? "Unidades iniciales por color y talla"
              : "Unidades que llegaron por color y talla"}
          </h3>
          <p className="mb-2 text-xs text-slate-500">
            Deja 0 donde no haya unidades. Se crearán {combos.length} variantes
            (las que ya existan solo suman stock).
          </p>
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">Color</th>
                  {tallas.map((t) => (
                    <th key={t} className="px-3 py-2 text-center">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colores.map((c) => (
                  <tr key={c} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{c}</td>
                    {tallas.map((t) => {
                      const k = clave(c, t);
                      const hay = delProducto.get(k);
                      return (
                        <td key={t} className="px-2 py-2 text-center">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={cant[k] ?? 0}
                            onChange={(e) =>
                              setCant({
                                ...cant,
                                [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              })
                            }
                            className="w-16 rounded-lg border border-slate-300 px-2 py-2 text-center text-base"
                          />
                          {hay !== undefined && (
                            <div className="mt-0.5 text-[11px] text-slate-400">
                              hay {hay}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Total a ingresar: <strong>{totalUnidades}</strong> unidades
          </p>
        </section>
      )}

      <button
        onClick={guardar}
        disabled={guardando || !nombre.trim() || combos.length === 0}
        className="w-full rounded-xl bg-slate-900 py-4 text-lg font-medium text-white disabled:opacity-40"
      >
        {guardando
          ? "Guardando..."
          : modo === "nuevo"
          ? "Crear producto"
          : "Guardar cambios"}
      </button>
    </div>
  );
}
