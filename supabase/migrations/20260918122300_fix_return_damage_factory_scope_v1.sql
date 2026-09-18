-- Fix return damage factory scope and enforce factory lineage.
update public.return_damage_lots rdl
set factory_id = rl.factory_id
from public.return_lines rl
where rl.id = rdl.return_line_id
  and rdl.factory_id is null;

drop trigger if exists set_factory_scope on public.return_damage_lots;
create trigger set_factory_scope
before insert on public.return_damage_lots
for each row execute function private.set_factory_scope();

alter table public.return_damage_lots
  alter column factory_id set not null;
