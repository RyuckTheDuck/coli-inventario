// Piezas visuales reutilizables (botones de opción y bloques con título)

export function Paso({
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

export function Opcion({
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
      type="button"
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
