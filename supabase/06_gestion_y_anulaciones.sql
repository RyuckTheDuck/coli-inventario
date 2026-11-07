-- =====================================================
-- LOTE 5 · Anulaciones con historial, desactivar/eliminar y editar
-- Pegar completo en Supabase > SQL Editor > Run
-- (aparecerá "potential issue" por los DROP/REVOKE: confirmar con Run this query)
-- =====================================================

-- 1) Columnas nuevas ---------------------------------------------------
alter table public.movimientos
  add column if not exists anulado_at timestamptz,
  add column if not exists anulado_por uuid,
  add column if not exists motivo_anulacion text;

alter table public.productos
  add column if not exists activo boolean not null default true;

-- 2) Vistas: ignoran movimientos anulados -------------------------------
-- variantes_detalle: TODAS las variantes (activas e inactivas) con su stock
create or replace view public.variantes_detalle
with (security_invoker = true) as
select
  v.id as variante_id,
  p.nombre as prenda,
  p.categoria,
  v.color,
  v.talla,
  coalesce(sum(case when m.tipo = 'venta' then -m.cantidad else m.cantidad end), 0)::int as stock,
  coalesce(sum(m.cantidad) filter (where m.tipo in ('inicial','entrada')), 0)::int as ingresado,
  coalesce(sum(m.cantidad) filter (where m.tipo = 'venta'), 0)::int as vendidas,
  max(m.fecha) filter (where m.tipo = 'venta') as ultima_venta,
  p.id as producto_id,
  p.activo as producto_activo,
  v.activo as variante_activa
from public.variantes v
join public.productos p on p.id = v.producto_id
left join public.movimientos m on m.variante_id = v.id and m.anulado_at is null
group by v.id, p.id, p.nombre, p.categoria, p.activo, v.color, v.talla, v.activo;

-- stock_actual: solo lo activo (es lo que ven Inventario, Vender e Ingresar)
create or replace view public.stock_actual
with (security_invoker = true) as
select variante_id, prenda, categoria, color, talla, stock, ingresado, vendidas, ultima_venta
from public.variantes_detalle
where producto_activo and variante_activa;

-- 3) Validación de stock: ignorar anulados ------------------------------
create or replace function public.validar_stock_movimiento()
returns trigger
language plpgsql
as $$
declare
  v_stock integer;
  v_delta integer;
begin
  if new.tipo = 'venta' then
    v_delta := -new.cantidad;
  elsif new.tipo = 'ajuste' and new.cantidad < 0 then
    v_delta := new.cantidad;
  else
    return new;
  end if;

  perform 1 from public.variantes where id = new.variante_id for update;

  select coalesce(sum(case when tipo = 'venta' then -cantidad else cantidad end), 0)
    into v_stock
  from public.movimientos
  where variante_id = new.variante_id
    and anulado_at is null;

  if v_stock + v_delta < 0 then
    raise exception 'Stock insuficiente: solo hay % unidades disponibles', v_stock;
  end if;

  return new;
end;
$$;

-- El borrado de movimientos ya no se usa desde la app (se anula, no se borra)
drop trigger if exists trg_validar_borrado on public.movimientos;
drop function if exists public.validar_borrado_movimiento();

-- 4) Anular un movimiento (queda guardado como anulado) -----------------
create or replace function public.anular_movimiento(p_id uuid, p_motivo text default null)
returns void
language plpgsql
as $$
declare
  v_mov   public.movimientos%rowtype;
  v_stock integer;
begin
  select * into v_mov from public.movimientos where id = p_id for update;

  if not found then
    raise exception 'Movimiento no encontrado';
  end if;
  if v_mov.anulado_at is not null then
    raise exception 'Este movimiento ya estaba anulado';
  end if;
  if v_mov.created_by is null then
    raise exception 'Los datos históricos importados no se pueden anular desde la app';
  end if;

  -- Anular un ingreso resta stock: no puede dejarlo negativo
  if v_mov.tipo in ('inicial', 'entrada') or (v_mov.tipo = 'ajuste' and v_mov.cantidad > 0) then
    perform 1 from public.variantes where id = v_mov.variante_id for update;

    select coalesce(sum(case when tipo = 'venta' then -cantidad else cantidad end), 0)
      into v_stock
    from public.movimientos
    where variante_id = v_mov.variante_id
      and anulado_at is null;

    if v_stock - v_mov.cantidad < 0 then
      raise exception 'No se puede anular: ya se vendieron unidades de este ingreso (stock actual %)', v_stock;
    end if;
  end if;

  update public.movimientos
     set anulado_at = now(),
         anulado_por = auth.uid(),
         motivo_anulacion = nullif(trim(p_motivo), '')
   where id = p_id;
end;
$$;

-- 5) Eliminar definitivamente (solo si NO tiene ventas vigentes) --------
create or replace function public.eliminar_producto(p_producto_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ventas integer;
begin
  if auth.uid() is null then
    raise exception 'Se requiere iniciar sesión';
  end if;

  select count(*) into v_ventas
  from public.movimientos m
  join public.variantes v on v.id = m.variante_id
  where v.producto_id = p_producto_id
    and m.tipo = 'venta'
    and m.anulado_at is null;

  if v_ventas > 0 then
    raise exception 'No se puede eliminar: el producto tiene % ventas registradas. Desactívalo en su lugar.', v_ventas;
  end if;

  delete from public.movimientos
   where variante_id in (select id from public.variantes where producto_id = p_producto_id);
  delete from public.variantes where producto_id = p_producto_id;
  delete from public.productos where id = p_producto_id;
end;
$$;

create or replace function public.eliminar_variante(p_variante_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ventas integer;
begin
  if auth.uid() is null then
    raise exception 'Se requiere iniciar sesión';
  end if;

  select count(*) into v_ventas
  from public.movimientos
  where variante_id = p_variante_id
    and tipo = 'venta'
    and anulado_at is null;

  if v_ventas > 0 then
    raise exception 'No se puede eliminar: esta variante tiene % ventas registradas. Desactívala en su lugar.', v_ventas;
  end if;

  delete from public.movimientos where variante_id = p_variante_id;
  delete from public.variantes where id = p_variante_id;
end;
$$;

revoke execute on function public.anular_movimiento(uuid, text) from public, anon;
revoke execute on function public.eliminar_producto(uuid)       from public, anon;
revoke execute on function public.eliminar_variante(uuid)       from public, anon;
grant  execute on function public.anular_movimiento(uuid, text) to authenticated;
grant  execute on function public.eliminar_producto(uuid)       to authenticated;
grant  execute on function public.eliminar_variante(uuid)       to authenticated;

-- 6) Seguridad: sin borrados directos; el historial no se puede reescribir
drop policy if exists "autenticados productos"   on public.productos;
drop policy if exists "autenticados variantes"   on public.variantes;
drop policy if exists "autenticados movimientos" on public.movimientos;

create policy "productos leer"   on public.productos for select to authenticated using (true);
create policy "productos crear"  on public.productos for insert to authenticated with check (true);
create policy "productos editar" on public.productos for update to authenticated using (true) with check (true);

create policy "variantes leer"   on public.variantes for select to authenticated using (true);
create policy "variantes crear"  on public.variantes for insert to authenticated with check (true);
create policy "variantes editar" on public.variantes for update to authenticated using (true) with check (true);

create policy "movimientos leer"   on public.movimientos for select to authenticated using (true);
create policy "movimientos crear"  on public.movimientos for insert to authenticated with check (true);
create policy "movimientos editar" on public.movimientos for update to authenticated using (true) with check (true);

revoke delete on public.productos, public.variantes, public.movimientos from authenticated;
-- De los movimientos solo se puede modificar la anulación (no cantidades ni fechas)
revoke update on public.movimientos from authenticated;
grant  update (anulado_at, anulado_por, motivo_anulacion) on public.movimientos to authenticated;

-- Comprobación: debe seguir dando 36 variantes (o más si agregaste productos reales)
select count(*) as variantes, sum(stock) as stock_total from public.stock_actual;
