import { NextResponse } from "next/server";
import { getPool } from "../../../../src/net/db.mjs";
import { getNetworkRuntime } from "../../../../src/net/runtime.mjs";

export const dynamic = "force-dynamic";

const resources = {
  customers: { label: "Customers", table: "net_customers" },
  plans: { label: "Plans & Packages", table: "net_plans" },
  subscriptions: { label: "Subscriptions", table: "net_subscriptions" },
  payments: { label: "Payments", table: "net_payments" },
  devices: { label: "Devices & Routers", table: "net_devices" },
  sessions: { label: "Sessions & Accounting", table: "net_sessions" },
  sites: { label: "Sites", table: "net_sites" },
  networks: { label: "Networks", table: "net_networks" },
  authorizations: { label: "Entitlements / Authorizations", table: "net_authorizations" },
  incidents: { label: "Incidents", table: "net_incidents" },
  commands: { label: "Network Commands", table: "net_commands" },
  audit: { label: "Audit Log", table: "net_audit_log" },
};

async function count(pool, table) {
  try {
    const result = await pool.query(`select count(*)::int as count from ${table}`);
    return result.rows[0]?.count ?? 0;
  } catch {
    return null;
  }
}

export async function GET() {
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
      const value = await count(pool, meta.table);
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
