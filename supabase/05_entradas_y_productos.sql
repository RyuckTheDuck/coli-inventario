-- =====================================================
-- LOTE 4 · Entradas de stock y productos nuevos
-- Pegar completo en Supabase > SQL Editor > Run
-- (si aparece "potential issue", es por los DROP/REVOKE: confirmar)
-- =====================================================

-- 1) Crear producto y/o variantes (color x talla) con stock, TODO en una sola operación.
--    Si el producto ya existe, agrega variantes nuevas y suma stock como "entrada".
--    Si es nuevo, el stock cuenta como "inicial".
create or replace function public.crear_variantes(
  p_producto  text,
  p_categoria text  default null,
  p_items     jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_nombre        text := trim(p_producto);
  v_producto_id   uuid;
  v_nuevo         boolean := false;
  v_item          jsonb;
  v_color         text;
  v_talla_raw     text;
  v_talla_txt     text;
  v_cant          integer;
  v_var_id        uuid;
  v_vars_nuevas   integer := 0;
  v_unidades      integer := 0;
begin
  if v_nombre is null or v_nombre = '' then
    raise exception 'El nombre del producto es obligatorio';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debes indicar al menos una variante';
  end if;

  select id into v_producto_id
  from public.productos
  where lower(nombre) = lower(v_nombre);

  if v_producto_id is null then
    insert into public.productos (nombre, categoria)
    values (v_nombre, nullif(trim(p_categoria), ''))
    returning id into v_producto_id;
    v_nuevo := true;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_color     := trim(v_item->>'color');
    v_talla_raw := trim(v_item->>'talla');
    v_cant      := coalesce((v_item->>'cantidad')::integer, 0);

    if v_color is null or v_color = '' or v_talla_raw is null or v_talla_raw = '' then
      raise exception 'Cada variante necesita color y talla';
    end if;
    if v_cant < 0 then
      raise exception 'La cantidad no puede ser negativa';
    end if;

    v_color := upper(left(v_color, 1)) || substr(v_color, 2);
    v_talla_txt := case
      when length(v_talla_raw) <= 3 then upper(v_talla_raw)
      else upper(left(v_talla_raw, 1)) || substr(v_talla_raw, 2)
    end;

    v_var_id := null;
    select id into v_var_id
    from public.variantes
    where producto_id = v_producto_id
      and lower(color) = lower(v_color)
      and upper(talla) = upper(v_talla_raw);

    if v_var_id is null then
      insert into public.variantes (producto_id, color, talla)
      values (v_producto_id, v_color, v_talla_txt)
      returning id into v_var_id;
      v_vars_nuevas := v_vars_nuevas + 1;
    else
      update public.variantes set activo = true where id = v_var_id and not activo;
    end if;

    if v_cant > 0 then
      insert into public.movimientos (variante_id, tipo, cantidad, nota)
      values (
        v_var_id,
        case when v_nuevo then 'inicial' else 'entrada' end,
        v_cant,
        case when v_nuevo then 'Stock inicial al crear el producto'
             else 'Ingreso de stock desde Productos' end
      );
      v_unidades := v_unidades + v_cant;
    end if;
  end loop;

  return jsonb_build_object(
    'producto_nuevo',   v_nuevo,
    'variantes_nuevas', v_vars_nuevas,
    'unidades',         v_unidades
  );
end;
$$;

revoke execute on function public.crear_variantes(text, text, jsonb) from public, anon;
grant  execute on function public.crear_variantes(text, text, jsonb) to authenticated;

-- 2) No permitir anular una entrada si ya se vendieron esas unidades (stock negativo)
create or replace function public.validar_borrado_movimiento()
returns trigger
language plpgsql
as $$
declare
  v_stock integer;
  v_delta integer;
begin
  if old.tipo in ('inicial', 'entrada') then
    v_delta := old.cantidad;
  elsif old.tipo = 'ajuste' and old.cantidad > 0 then
    v_delta := old.cantidad;
  else
    return old;
  end if;

  perform 1 from public.variantes where id = old.variante_id for update;

  select coalesce(sum(case when tipo = 'venta' then -cantidad else cantidad end), 0)
    into v_stock
  from public.movimientos
  where variante_id = old.variante_id;

  if v_stock - v_delta < 0 then
    raise exception 'No se puede anular: ya se vendieron unidades de este ingreso (stock actual %)', v_stock;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_validar_borrado on public.movimientos;
create trigger trg_validar_borrado
before delete on public.movimientos
for each row execute function public.validar_borrado_movimiento();
