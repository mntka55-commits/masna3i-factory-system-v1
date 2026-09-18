
drop policy if exists factory_scope_select on public.model_variable_costs;
drop policy if exists factory_scope_insert on public.model_variable_costs;
drop policy if exists factory_scope_update on public.model_variable_costs;
drop policy if exists factory_scope_delete on public.model_variable_costs;

create policy factory_scope_select
on public.model_variable_costs
for select to authenticated
using (factory_id = (select private.current_factory_id()));

create policy factory_scope_insert
on public.model_variable_costs
for insert to authenticated
with check (factory_id = (select private.current_factory_id()));

create policy factory_scope_update
on public.model_variable_costs
for update to authenticated
using (factory_id = (select private.current_factory_id()))
with check (factory_id = (select private.current_factory_id()));

create policy factory_scope_delete
on public.model_variable_costs
for delete to authenticated
using (factory_id = (select private.current_factory_id()));
