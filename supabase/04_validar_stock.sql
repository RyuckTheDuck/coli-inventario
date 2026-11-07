-- =====================================================
-- LOTE 3 · Validación de stock en la base de datos
-- Pegar completo en Supabase > SQL Editor > Run
-- Impide registrar una venta (o un ajuste negativo) que deje el stock bajo 0,
-- aunque la app falle o alguien intente saltarse la pantalla.
-- =====================================================

create or replace function public.validar_stock_movimiento()
returns trigger
language plpgsql
as $$
declare
  v_stock integer;
  v_delta integer;
begin
  -- Solo validamos movimientos que restan stock
  if new.tipo = 'venta' then
    v_delta := -new.cantidad;
  elsif new.tipo = 'ajuste' and new.cantidad < 0 then
    v_delta := new.cantidad;
  else
    return new;
  end if;

  -- Bloquea la variante mientras se valida (evita dos ventas simultáneas)
  perform 1 from public.variantes where id = new.variante_id for update;

  select coalesce(sum(case when tipo = 'venta' then -cantidad else cantidad end), 0)
    into v_stock
  from public.movimientos
  where variante_id = new.variante_id;

  if v_stock + v_delta < 0 then
    raise exception 'Stock insuficiente: solo hay % unidades disponibles', v_stock;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_stock on public.movimientos;
create trigger trg_validar_stock
before insert on public.movimientos
for each row execute function public.validar_stock_movimiento();
