import { getPool } from "./db.mjs";

const money = (value) => Number(value ?? 0);

function organizationClause(organizationId, params) {
  if (!organizationId) return { sql: "", params };
  params.push(organizationId);
  return { sql: ` where organization_id = $${params.length}`, params };
}

export async function getCommandCenterSnapshot({ organizationId = null } = {}) {
  const pool = await getPool();
  if (!pool) {
    return {
      ok: false,
      configured: false,
      source: "none",
      metrics: null,
      incidents: [],
      payments: [],
      sessions: [],
      events: [],
      error: "DATABASE_URL is not configured.",
      fetchedAt: new Date().toISOString(),
    };
  }

  const params = organizationId ? [organizationId] : [];
  const org = organizationClause(organizationId, params);
  const customerWhere = org.sql.replace("organization_id", "c.organization_id");
  const paymentWhere = org.sql.replace("organization_id", "p.organization_id");
  const deviceWhere = org.sql.replace("organization_id", "o.id");
  const incidentWhere = org.sql.replace("organization_id", "i.organization_id");
  const eventWhere = org.sql.replace("organization_id", "e.organization_id");

  const queries = [
    pool.query(`select
      (select count(*) from net_customers c${customerWhere})::int as customers,
      (select count(*) from net_subscriptions s join net_customers c on c.id=s.customer_id${organizationId ? ` where c.organization_id = $${params.length}` : ""} and s.status='ACTIVE' and s.expires_at > now())::int as active_subscriptions,
      (select count(*) from net_sessions s join net_customers c on c.id=s.customer_id${organizationId ? ` where c.organization_id = $${params.length}` : ""} and s.state in ('AUTHENTICATED','ACTIVE','STALE'))::int as active_sessions,
      (select coalesce(sum(p.amount_minor),0) from net_payments p${paymentWhere} and p.status in ('VERIFIED','SETTLED'))::bigint as settled_revenue_minor,
      (select count(*) from net_devices d join net_sites o on o.id=d.site_id${organizationId ? ` where o.organization_id = $${params.length}` : ""} and d.state='ONLINE')::int as online_devices,
      (select count(*) from net_devices d join net_sites o on o.id=d.site_id${organizationId ? ` where o.organization_id = $${params.length}` : ""} and d.state='OFFLINE')::int as offline_devices,
      (select coalesce(sum(s.input_octets+s.output_octets),0) from net_sessions s join net_customers c on c.id=s.customer_id${organizationId ? ` where c.organization_id = $${params.length}` : ""})::numeric as total_usage_bytes,
      (select count(*) from net_incidents i${incidentWhere} and i.status in ('OPEN','ACKNOWLEDGED'))::int as open_incidents`, params),
    pool.query(`select i.id, i.category, i.severity, i.status, i.title, i.site_id, i.device_id, i.first_seen_at, i.last_seen_at,
      coalesce((select count(*) from net_incident_impacts x where x.incident_id=i.id and x.impact_state='AFFECTED'),0)::int as impact_count
      from net_incidents i${incidentWhere} and i.status in ('OPEN','ACKNOWLEDGED')
      order by case i.severity when 'CRITICAL' then 0 when 'WARNING' then 1 else 2 end, i.last_seen_at desc limit 8`, params),
    pool.query(`select p.id, p.provider, p.amount_minor, p.currency, p.status, p.provider_reference, p.received_at, c.name as customer_name
      from net_payments p join net_customers c on c.id=p.customer_id${paymentWhere}
      order by p.created_at desc limit 8`, params),
    pool.query(`select s.id, s.username, s.nas_identifier, s.mac_address, host(s.ip_address) as ip_address, s.state, s.started_at, s.last_accounting_at,
      s.input_octets, s.output_octets, c.name as customer_name, p.name as plan_name
      from net_sessions s left join net_customers c on c.id=s.customer_id left join net_subscriptions sub on sub.id=(select ss.id from net_subscriptions ss where ss.customer_id=s.customer_id order by ss.created_at desc limit 1) left join net_plans p on p.id=sub.plan_id${organizationId ? ` where c.organization_id = $${params.length}` : ""} and s.state in ('AUTHENTICATED','ACTIVE','STALE')
      order by coalesce(s.last_accounting_at,s.started_at) desc nulls last limit 10`, params),
    pool.query(`select e.id, e.event_type, e.aggregate_type, e.aggregate_id, e.correlation_id, e.occurred_at
      from net_events e${eventWhere}
      order by e.occurred_at desc limit 12`, params),
  ];

  try {
    const [metricResult, incidentResult, paymentResult, sessionResult, eventResult] = await Promise.all(queries);
    const m = metricResult.rows[0] || {};
    return {
      ok: true,
      configured: true,
      source: "postgresql",
      metrics: {
        customers: Number(m.customers || 0),
        activeSubscriptions: Number(m.active_subscriptions || 0),
        activeSessions: Number(m.active_sessions || 0),
        settledRevenueMinor: money(m.settled_revenue_minor),
        onlineDevices: Number(m.online_devices || 0),
        offlineDevices: Number(m.offline_devices || 0),
        totalUsageBytes: Number(m.total_usage_bytes || 0),
        openIncidents: Number(m.open_incidents || 0),
      },
      incidents: incidentResult.rows,
      payments: paymentResult.rows,
      sessions: sessionResult.rows,
      events: eventResult.rows,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      source: "postgresql",
      metrics: null,
      incidents: [],
      payments: [],
      sessions: [],
      events: [],
      error: error instanceof Error ? error.message : String(error),
      fetchedAt: new Date().toISOString(),
    };
  }
}
