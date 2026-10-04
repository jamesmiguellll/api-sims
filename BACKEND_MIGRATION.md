# Next.js backend migration

The application currently runs in hybrid mode. Migrated endpoints are implemented as Next.js App Router handlers under `app/api`; requests for API paths that do not have a local handler fall back to the existing SCMS service through `next.config.ts`.

## Migrated modules

- Categories and units of measure
- Items
- Suppliers
- Finished products, including image upload
- Recipes
- Purchase requisitions and status transitions
- Purchase orders, receipt upload, status transitions, and PR quantity summaries
- Deliveries and delivery status transitions
- Goods receipts and GRN status transitions

The Prisma schema in `prisma/schema.prisma` maps the existing PostgreSQL database. Generate the client after changing it:

```bash
npm run prisma:generate
```

## Verification

```bash
npx prisma validate --schema prisma/schema.prisma
npx tsc --noEmit
npm run build
```

Read-only smoke tests have been run successfully against the configured database for collection and detail routes across items, suppliers, purchase requisitions, purchase orders, deliveries, goods receipts, categories, units, finished products, and recipes.

## Remaining .NET-backed modules

The most visible remaining endpoints are production batches, supplier-item catalog management, inventory and lots, stock transfers and locations, cycle counts, quality inspections, stock-in and put-away, MRP, reports, traceability, valuation, and authentication. Existing calls under `/api/scms/*`, plus unmatched `/api/*` paths, continue to use the configured .NET services until each module is migrated.

When adding a local dynamic route, keep the generic legacy proxy in the `fallback` rewrite phase. Moving it to `beforeFiles` or a flat rewrite array causes the proxy to intercept local `[id]` handlers.
