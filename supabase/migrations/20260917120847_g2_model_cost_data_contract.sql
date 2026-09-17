begin;

-- G2: Model Cost Data Contract
-- Source: FACTORY_SYSTEM_V1_CANONICAL_MASTER_CLEANED_2026-09-16
-- Applied to Supabase as migration 20260917120847.
--
-- Contract:
-- * A model may use multiple materials.
-- * Accessories may be defined with a quantity per piece.
-- * Variable production costs include sewing, ironing, and other approved
--   model-level variable costs.
-- * Factory fixed costs remain separate and are not allocated to models in V1.

alter table public.model_materials
  add column if not exists quantity_per_piece numeric(14,4);

alter table public.model_materials
  drop constraint if exists model_materials_quantity_per_piece_nonnegative;

alter table public.model_materials
  add constraint model_materials_quantity_per_piece_nonnegative
  check (quantity_per_piece is null or quantity_per_piece > 0);

create table if not exists public.model_variable_costs (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete cascade,
  cost_type text not null check (cost_type in ('sewing','ironing','other')),
  name text not null,
  amount_per_piece numeric(14,2) not null check (amount_per_piece >= 0),
  notes text,
  created_at timestamptz not null default now(),
  factory_id uuid references public.factories(id),
  constraint model_variable_costs_model_type_name_key unique (model_id, cost_type, name)
);

create index if not exists model_variable_costs_model_id_idx
  on public.model_variable_costs(model_id);

create trigger set_factory_scope
before insert on public.model_variable_costs
for each row execute function private.set_factory_scope();

alter table public.model_variable_costs enable row level security;

create policy factory_scope_select on public.model_variable_costs
  for select using (factory_id = (select private.current_factory_id()));

create policy factory_scope_insert on public.model_variable_costs
  for insert with check (factory_id = (select private.current_factory_id()));

create policy factory_scope_update on public.model_variable_costs
  for update
  using (factory_id = (select private.current_factory_id()))
  with check (factory_id = (select private.current_factory_id()));

create policy factory_scope_delete on public.model_variable_costs
  for delete using (factory_id = (select private.current_factory_id()));

commit;
