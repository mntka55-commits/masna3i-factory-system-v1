# مصنعي — Factory System V1

Greenfield factory-management system built from the Canonical Master dated 16/09/2026.

## Source of truth

`FACTORY_SYSTEM_V1_CANONICAL_MASTER_CLEANED_2026-09-16.docx` is the authoritative product reference. Older RETAG/prototype rules are not implementation sources when they conflict with the Canonical Master.

## V1 operating boundary

- PC is the operational center: data entry, transactions, invoices, and printing.
- Mobile is for owner monitoring/reports only in V1.
- V1 is a single real factory with one operational PC user.
- No standalone Orders stage in V1.
- Core flow: Purchase → Warehouse → Cutting → WIP → READY → Sale → Invoice → Collection → Return/Review → Expenses → Reports.

## First implementation slice

This repository starts with authentication and first-factory onboarding. No demo/test factory data is created.

The app uses the Factory System Supabase project through the browser client and calls the secured `create_first_factory` RPC after a real authenticated session is established.

## Security boundary

Business tables are protected by RLS in Supabase. Client code must never contain a service-role key.
