-- ============================================================
-- 0006_stock_on_orders.sql
-- Order → inventory integration, server-side and atomic:
--   • placing an order decrements product stock + logs history
--   • cancelling an order restores the stock
--   • stock can never go negative (raises, rolling back the order)
-- ============================================================

create or replace function public.decrement_stock_on_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prod public.products%rowtype;
begin
  select * into prod from public.products where id = new.product_id for update;
  if not found then
    raise exception 'Product % does not exist', new.product_id;
  end if;
  if prod.stock < new.quantity then
    raise exception 'Only % of "%" in stock', prod.stock, prod.name;
  end if;

  update public.products set stock = stock - new.quantity where id = new.product_id;

  insert into public.inventory_history (shop_id, product_id, change, reason, note)
  values (prod.shop_id, new.product_id, -new.quantity, 'sale',
          'Order ' || left(new.order_id::text, 8));

  return new;
end $$;

drop trigger if exists order_items_decrement_stock on public.order_items;
create trigger order_items_decrement_stock after insert on public.order_items
  for each row execute function public.decrement_stock_on_order();

-- Restore stock when an order is cancelled (only once, on the transition).
create or replace function public.restore_stock_on_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  it record;
  prod public.products%rowtype;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    for it in
      select oi.product_id, oi.quantity
        from public.order_items oi
       where oi.order_id = new.id and oi.product_id is not null
    loop
      select * into prod from public.products where id = it.product_id for update;
      if found then
        update public.products set stock = stock + it.quantity where id = it.product_id;
        insert into public.inventory_history (shop_id, product_id, change, reason, note)
        values (new.shop_id, it.product_id, it.quantity, 'cancel',
                'Order ' || left(new.id::text, 8) || ' cancelled');
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists orders_restore_stock on public.orders;
create trigger orders_restore_stock after update of status on public.orders
  for each row execute function public.restore_stock_on_cancel();
