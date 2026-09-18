-- Supplier returns V1: return only physically available inventory from a purchase line.
alter type public.inventory_movement_kind add value if not exists 'supplier_return_out';