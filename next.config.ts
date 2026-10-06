import type { NextConfig } from "next";

const authApiUrl = (
  process.env.AUTH_API_URL ||
  "http://localhost:5007"
).replace(/\/$/, "");

// Maps PascalCase C# controller names (used by frontend-scms) to the
// kebab-case Next.js App Router paths in this app.
// Frontend calls e.g. /api/Items, /api/PurchaseOrders → rewrite to /api/items, /api/purchase-orders
const pascalToKebabAliases = [
  { pascal: "Items",                  kebab: "items" },
  { pascal: "Suppliers",              kebab: "suppliers" },
  { pascal: "Categories",             kebab: "categories" },
  { pascal: "UnitOfMeasures",         kebab: "unit-of-measures" },
  { pascal: "FinishedProducts",       kebab: "finished-products" },
  { pascal: "Recipes",                kebab: "recipes" },
  { pascal: "PurchaseRequisitions",   kebab: "purchase-requisitions" },
  { pascal: "PurchaseOrders",         kebab: "purchase-orders" },
  { pascal: "Deliveries",             kebab: "deliveries" },
  { pascal: "GoodsReceipts",          kebab: "goods-receipts" },
  { pascal: "Inventory",              kebab: "inventory" },
  { pascal: "Locations",              kebab: "locations" },
  { pascal: "StockTransfers",         kebab: "stock-transfers" },
  { pascal: "SupplierItems",          kebab: "supplier-items" },
  { pascal: "CycleCounts",            kebab: "cycle-counts" },
  { pascal: "Traceability",           kebab: "traceability" },
  { pascal: "Valuation",              kebab: "valuation" },
  { pascal: "Mrp",                    kebab: "mrp" },
  { pascal: "Reports",                kebab: "reports" },
  { pascal: "AuditLogs",              kebab: "audit-logs" },
  { pascal: "Discrepancies",          kebab: "Discrepancies" },
  { pascal: "LossReports",            kebab: "LossReports" },
  { pascal: "ProductionBatches",      kebab: "ProductionBatches" },
  { pascal: "QualityInspections",     kebab: "QualityInspections" },
  { pascal: "ReturnToVendors",        kebab: "ReturnToVendors" },
  { pascal: "StockIns",               kebab: "StockIns" },
  { pascal: "Lots",                   kebab: "inventory" }, // Lots are part of inventory
];

const nextConfig: NextConfig = {
  async rewrites() {
    const aliases = pascalToKebabAliases.flatMap(({ pascal, kebab }) => [
      // Exact match: /api/Items → /api/items
      {
        source: `/api/${pascal}`,
        destination: `/api/${kebab}`,
      },
      // With sub-path: /api/Items/:path* → /api/items/:path*
      {
        source: `/api/${pascal}/:path*`,
        destination: `/api/${kebab}/:path*`,
      },
    ]);

    return {
      beforeFiles: [
        {
          // Auth microservice proxy
          source: "/api/erp-auth/:path*",
          destination: `${authApiUrl}/api/erp-auth/:path*`,
        },
        // Strip legacy /api/scms/api/ or /api/scms/ prefix if called
        {
          source: "/api/scms/api/:path*",
          destination: "/api/:path*",
        },
        {
          source: "/api/scms/:path*",
          destination: "/api/:path*",
        },
        ...aliases,
      ],
    };
  },
};

export default nextConfig;
