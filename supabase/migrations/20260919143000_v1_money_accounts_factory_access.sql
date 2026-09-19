-- V1 money accounts: enable authenticated factory members to read/create/activate accounts.
-- Scope is strictly limited to the user's active factory membership.

drop policy if exists money_accounts_select_v1 on public.money_accounts;
drop policy if exists money_accounts_insert_v1 on public.money_accounts;
drop policy if exists money_accounts_update_v1 on public.money_accounts;

create policy money_accounts_select_v1
on public.money_accounts
for select
to authenticated
using (factory_id = private.current_factory_id());

create policy money_accounts_insert_v1
on public.money_accounts
for insert
to authenticated
with check (factory_id = private.current_factory_id());

create policy money_accounts_update_v1
on public.money_accounts
for update
to authenticated
using (factory_id = private.current_factory_id())
with check (factory_id = private.current_factory_id());
