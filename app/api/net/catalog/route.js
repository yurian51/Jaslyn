import { NextResponse } from "next/server";
import { getPool } from "../../../../src/net/db.mjs";
import { getNetworkRuntime } from "../../../../src/net/runtime.mjs";
import { requireSession } from "../../../../src/net/auth.mjs";

export const dynamic = "force-dynamic";

const resources = {
  customers: { label: "Customers", from: "net_customers c", scope: "c.organization_id = $1" },
  plans: { label: "Plans & Packages", from: "net_plans p", scope: "p.organization_id = $1" },
  subscriptions: { label: "Subscriptions", from: "net_subscriptions s join net_customers c on c.id = s.customer_id", scope: "c.organization_id = $1" },
  payments: { label: "Payments", from: "net_payments p", scope: "p.organization_id = $1" },
  devices: { label: "Devices & Routers", from: "net_devices d join net_sites s on s.id = d.site_id", scope: "s.organization_id = $1" },
  sessions: { label: "Sessions & Accounting", from: "net_sessions s join net_customers c on c.id = s.customer_id", scope: "c.organization_id = $1" },
  sites: { label: "Sites", from: "net_sites s", scope: "s.organization_id = $1" },
  networks: { label: "Networks", table: "net_networks" },
  authorizations: { label: "Entitlements / Authorizations", table: "net_authorizations" },
  incidents: { label: "Incidents", table: "net_incidents" },
  commands: { label: "Network Commands", from: "net_commands c", scope: "c.organization_id = $1" },
  audit: { label: "Audit Log", from: "net_audit_log a", scope: "a.organization_id = $1" },
  invoices: { label: "Invoices", from: "net_invoices i", scope: "i.organization_id = $1" },
  wallets: { label: "Wallets", from: "net_wallet_accounts w", scope: "w.organization_id = $1" },
  vouchers: { label: "Vouchers", from: "net_vouchers v", scope: "v.organization_id = $1" },
};

async function count(pool, table) {
  try {
    const result = await pool.query(`select count(*)::int as count from ${table}`);
    return result.rows[0]?.count ?? 0;
  } catch {
    return null;
  }
}

export async function GET(request) {
  let session;\n  try { session = await requireSession(request); } catch (error) { const status = error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401; return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : "Unauthorized" }, { status }); }

  const runtime = getNetworkRuntime();
  const pool = await getPool();

  if (!pool) {
    return NextResponse.json({
      ok: false,
      configured: false,
      source: "jaslyn-net-database",
      runtime,
      resources: Object.fromEntries(Object.keys(resources).map((key) => [key, {
        label: resources[key].label,
        count: null,
        state: "NOT_CONFIGURED",
      }])),
      message: "DATABASE_URL is not configured. No operational records are fabricated.",
      fetchedAt: new Date().toISOString(),
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const entries = await Promise.all(
    Object.entries(resources).map(async ([key, meta]) => {
      const value = await count(pool, meta, session.organization_id);
      return [key, {
        label: meta.label,
        count: value,
        state: value === null ? "UNAVAILABLE" : "CONNECTED",
      }];
    }),
  );

  return NextResponse.json({
    ok: true,
    configured: true,
    source: "postgresql",
    runtime,
    resources: Object.fromEntries(entries),
    fetchedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
