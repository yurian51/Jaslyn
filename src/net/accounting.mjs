import { withTransaction } from "./db.mjs";

const statuses = new Set(["Start", "Interim-Update", "Stop"]);
const counter = (value, name) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a finite non-negative number`);
  return n;
};

export function normalizeAccounting(input) {
  if (!input?.nasIdentifier || !input?.acctSessionId || !statuses.has(input.acctStatusType)) throw new Error("nasIdentifier, acctSessionId and a valid acctStatusType are required");
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
  if (Number.isNaN(receivedAt.getTime())) throw new Error("receivedAt must be a valid timestamp");
  return {
    nasIdentifier: String(input.nasIdentifier),
    acctSessionId: String(input.acctSessionId),
    username: input.username ? String(input.username) : null,
    macAddress: input.macAddress ? String(input.macAddress) : null,
    ipAddress: input.ipAddress ? String(input.ipAddress) : null,
    acctStatusType: input.acctStatusType,
    sessionTime: input.sessionTime == null ? null : counter(input.sessionTime, "sessionTime"),
    inputOctets: counter(input.inputOctets, "inputOctets"),
    outputOctets: counter(input.outputOctets, "outputOctets"),
    terminationCause: input.terminationCause ? String(input.terminationCause) : null,
    receivedAt: receivedAt.toISOString(),
  };
}

export async function persistAccounting(input) {
  const event = normalizeAccounting(input);
  return withTransaction(async (client) => {
    const state = event.acctStatusType === "Stop" ? "TERMINATED" : "ACTIVE";
    const result = await client.query(
      `insert into net_sessions (nas_identifier, acct_session_id, username, mac_address, ip_address, state, started_at, last_accounting_at, ended_at, input_octets, output_octets, termination_cause)
       values ($1,$2,$3,$4,$5::inet,$6,case when $7 = 'Start' then $8::timestamptz else null end,$8::timestamptz,case when $7 = 'Stop' then $8::timestamptz else null end,$9,$10,$11)
       on conflict (nas_identifier, acct_session_id) do update set
         username=coalesce(excluded.username, net_sessions.username),
         mac_address=coalesce(excluded.mac_address, net_sessions.mac_address),
         ip_address=coalesce(excluded.ip_address, net_sessions.ip_address),
         state=case when excluded.state='TERMINATED' then 'TERMINATED' else net_sessions.state end,
         started_at=coalesce(net_sessions.started_at, excluded.started_at),
         last_accounting_at=excluded.last_accounting_at,
         ended_at=coalesce(excluded.ended_at, net_sessions.ended_at),
         input_octets=greatest(net_sessions.input_octets, excluded.input_octets),
         output_octets=greatest(net_sessions.output_octets, excluded.output_octets),
         termination_cause=coalesce(excluded.termination_cause, net_sessions.termination_cause),
         updated_at=now()
       returning id, state, last_accounting_at, input_octets, output_octets`,
      [event.nasIdentifier, event.acctSessionId, event.username, event.macAddress, event.ipAddress, state, event.acctStatusType, event.receivedAt, event.inputOctets, event.outputOctets, event.terminationCause]
    );
    return result.rows[0];
  });
}
