# Catalogue forms database update

This is an additive change to the existing PostgreSQL database. It does not create a replacement database or alter saved product prices, tax rates or SKUs.

Prerequisite: `0018_commerce_runtime.sql` has already been applied using the existing migration process.

Using the project's normal administrative migration environment:

```sh
pnpm run db:migrate -- --staged-catalogue
pnpm run deploy
```

Do not substitute the restricted application database connection for the administrative migration connection. The migration tool records successful application.

Before this migration is applied, existing product editing remains available and the new catalogue controls show a database-update prerequisite rather than pretending to save.

## Scope

- `products.catalogue` stores vendor, category, subcategory, buying-option axes and search metadata.
- `product_options.attributes` stores the exact value tuple for each existing sellable option row. Product option IDs remain stable across ordinary edits.
- Collection search metadata uses the existing collection-content storage.
- There are up to three buying-option types and 200 combinations per product.
- Product images remain attached to the parent product. This update does not add per-variant media.

Buying options are catalogue draft preparation in this stage. Live checkout currently handles parent-product inventory, so the application does not publish variant products or add variants to an active live listing. SKU-level selection, checkout inventory deduction, returns and stock adjustments must be integrated before enabling variant publication.

The Ann modal integration is a later step; this update builds the dashboard forms and shared catalogue controls first.
