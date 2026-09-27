alter table public.ready_lots
  drop constraint if exists ready_lots_exactly_one_source;

alter table public.ready_lots
  add constraint ready_lots_exactly_one_source
  check (
    (
      (source_wip_lot_id is not null)::integer +
      (source_return_line_id is not null)::integer +
      (source_opening_balance_id is not null)::integer
    ) = 1
  );