alter table public.opening_balances
  drop constraint if exists opening_balances_exact_target;

alter table public.opening_balances
  add constraint opening_balances_exact_target
  check (
    (
      kind in ('cash','bank')
      and account_id is not null
      and customer_id is null
      and supplier_id is null
      and material_id is null
      and model_id is null
      and amount is not null
      and amount > 0
      and quantity is null
      and unit_cost is null
    )
    or (
      kind = 'inventory'
      and material_id is not null
      and account_id is null
      and customer_id is null
      and supplier_id is null
      and model_id is null
      and quantity is not null
      and quantity > 0
      and unit_cost is not null
      and unit_cost >= 0
      and amount is null
    )
    or (
      kind = 'customer_receivable'
      and customer_id is not null
      and account_id is null
      and supplier_id is null
      and material_id is null
      and model_id is null
      and amount is not null
      and amount > 0
      and quantity is null
      and unit_cost is null
    )
    or (
      kind = 'supplier_payable'
      and supplier_id is not null
      and account_id is null
      and customer_id is null
      and material_id is null
      and model_id is null
      and amount is not null
      and amount > 0
      and quantity is null
      and unit_cost is null
    )
    or (
      kind = 'ready'
      and model_id is not null
      and account_id is null
      and customer_id is null
      and supplier_id is null
      and material_id is null
      and quantity is not null
      and quantity > 0
      and quantity = trunc(quantity)
      and unit_cost is not null
      and unit_cost >= 0
      and amount is null
    )
  );