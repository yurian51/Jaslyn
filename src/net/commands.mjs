import { getPool } from "./db.mjs";

const COMMANDS = Object.freeze([
  "show offline routers",
  "show offline access points",
  "show active sessions",
  "show payments today",
  "show network incidents",
  "show expired subscriptions",
  "show high bandwidth users",
]);

export function normalizeCommand(input) {
  const command = String(input || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!command) throw new Error("Command is required");
  if (!COMMANDS.includes(command)) throw new Error(`Unsupported command. Supported read commands: ${COMMANDS.join(", ")}`);
  return command;
}

export async function executeReadCommand(input, { organizationId = null } = {}) {
  const command = normalizeCommand(input);
  const pool = await getPool();
  if (!pool) return { ok: false, command, error: "DATABASE_URL is not configured." };
  const params = organizationId ? [organizationId] : [];
  const org = (alias) => organizationId ? ` where ${alias}.organization_id = $1` : "";
  const siteOrg = organizationId ? " where s.organization_id = $1" : "";
  const customerOrg = organizationId ? " where c.organization_id = $1" : "";

  let query;
  let mapper = (rows) => rows;
  switch (command) {
    case "show offline routers":
      query = `select d.id, d.hostname, d.vendor, d.model, d.state, d.last_heartbeat_at, s.name as site_name from net_devices d join net_sites s on s.id=d.site_id${siteOrg} ${organizationId ? "and" : "where"} d.role in ('ROUTER','GATEWAY') and d.state='OFFLINE' order by d.updated_at desc limit 100`;
      break;
    case "show offline access points":
      query = `select d.id, d.hostname, d.vendor, d.model, d.state, d.last_heartbeat_at, s.name as site_name from net_devices d join net_sites s on s.id=d.site_id${siteOrg} ${organizationId ? "and" : "where"} d.role='ACCESS_POINT' and d.state='OFFLINE' order by d.updated_at desc limit 100`;
      break;
    case "show active sessions":
      query = `select s.id, s.username, s.nas_identifier, host(s.ip_address) as ip_address, s.mac_address, s.state, s.started_at, s.last_accounting_at, s.input_octets, s.output_octets, c.name as customer_name from net_sessions s left join net_customers c on c.id=s.customer_id${customerOrg} ${organizationId ? "and" : "where"} s.state in ('AUTHENTICATED','ACTIVE','STALE') order by coalesce(s.last_accounting_at,s.started_at) desc nulls last limit 100`;
      break;
    case "show payments today":
      query = `select p.id, p.provider, p.amount_minor, p.currency, p.status, p.provider_reference, p.received_at, c.name as customer_name from net_payments p join net_customers c on c.id=p.customer_id${org("p")} ${organizationId ? "and" : "where"} p.created_at >= date_trunc('day', now()) order by p.created_at desc limit 100`;
      break;
    case "show network incidents":
      query = `select i.id, i.category, i.severity, i.status, i.title, i.first_seen_at, i.last_seen_at, coalesce((select count(*) from net_incident_impacts x where x.incident_id=i.id and x.impact_state='AFFECTED'),0)::int as impact_count from net_incidents i${org("i")} order by case i.severity when 'CRITICAL' then 0 when 'WARNING' then 1 else 2 end, i.last_seen_at desc limit 100`;
      break;
    case "show expired subscriptions":
      query = `select s.id, c.name as customer_name, p.name as plan_name, s.status, s.expires_at from net_subscriptions s join net_customers c on c.id=s.customer_id join net_plans p on p.id=s.plan_id${customerOrg()} ${organizationId ? "and" : "where"} s.expires_at <= now() and s.status <> 'CANCELLED' order by s.expires_at desc limit 100`;
      break;
    case "show high bandwidth users":
      query = `select s.id, s.username, c.name as customer_name, s.nas_identifier, host(s.ip_address) as ip_address, s.input_octets, s.output_octets, s.last_accounting_at from net_sessions s left join net_customers c on c.id=s.customer_id${customerOrg()} ${organizationId ? "and" : "where"} s.state in ('AUTHENTICATED','ACTIVE','STALE') order by (s.input_octets+s.output_octets) desc limit 100`;
      break;
    default:
      throw new Error("Unsupported command");
  }

  try {
    const result = await pool.query(query, params);
    return { ok: true, command, count: result.rows.length, rows: mapper(result.rows), executedAt: new Date().toISOString() };
  } catch (error) {
    return { ok: false, command, error: error instanceof Error ? error.message : String(error), rows: [] };
  }
}
