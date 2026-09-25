import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getPool, withTransaction } from "./db.mjs";

const scrypt = promisify(nodeScrypt);
const SESSION_COOKIE = "jaslyn_session";
const SESSION_DAYS = 7;
const MAX_FAILURES = 8;
const PASSWORD_MIN = 12;

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid email address is required");
  return email;
}
function hashToken(token) { return createHash("sha256").update(token).digest("hex"); }
async function hashPassword(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) throw new Error("Password must contain at least 12 characters");
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return "scrypt$16384$8$1$" + salt + "$" + Buffer.from(derived).toString("base64url");
}
async function verifyPassword(password, encoded) {
  const parts = String(encoded || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  try {
    const derived = await scrypt(password, parts[4], 64, { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) });
    const a = Buffer.from(parts[5], "base64url"), b = Buffer.from(derived);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}
function meta(request) {
  return { ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null, userAgent: request.headers.get("user-agent") || null };
}

export async function registerOperator({ fullName, email, organization, password, request }) {
  const normalizedEmail = normalizeEmail(email);
  if (!String(fullName || "").trim() || !String(organization || "").trim()) throw new Error("Full name and organization are required");
  const passwordHash = await hashPassword(password);
  const m = meta(request);
  return withTransaction(async (client) => {
    const exists = await client.query("select 1 from net_users where lower(email) = $1 limit 1", [normalizedEmail]);
    if (exists.rowCount) throw new Error("An account with this email already exists");
    const org = await client.query("insert into net_organizations (name) values ($1) returning id, name", [String(organization).trim()]);
    const user = await client.query("insert into net_users (organization_id,email,full_name,password_hash,role,status,email_verified_at) values ($1,$2,$3,$4,'ISP_ADMIN','ACTIVE',now()) returning id,organization_id,email,full_name,role,status", [org.rows[0].id, normalizedEmail, String(fullName).trim(), passwordHash]);
    await client.query("insert into net_auth_events (organization_id,user_id,email,event_type,ip_address,user_agent) values ($1,$2,$3,'REGISTER',$4,$5)", [org.rows[0].id, user.rows[0].id, normalizedEmail, m.ip, m.userAgent]);
    return { user: user.rows[0], organization: org.rows[0] };
  });
}

export async function createSession({ userId, organizationId, request }) {
  const token = randomBytes(32).toString("base64url"), m = meta(request);
  await withTransaction(async (client) => {
    await client.query("insert into net_auth_sessions (user_id,organization_id,token_hash,expires_at,ip_address,user_agent) values ($1,$2,$3,now()+interval '7 days',$4,$5)", [userId, organizationId, hashToken(token), m.ip, m.userAgent]);
    await client.query("update net_users set last_login_at=now(),failed_login_count=0,locked_until=null,updated_at=now() where id=$1", [userId]);
  });
  return token;
}
export function sessionCookie(token) { return SESSION_COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + (SESSION_DAYS * 86400) + (process.env.NODE_ENV === "production" ? "; Secure" : ""); }
export function clearSessionCookie() { return SESSION_COOKIE + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (process.env.NODE_ENV === "production" ? "; Secure" : ""); }
function readCookie(request) {
  const raw = request.headers.get("cookie") || "";
  const match = raw.match(new RegExp("(?:^|;\\s*)" + SESSION_COOKIE + "=([^;]+)"));
  return match?.[1] || null;
}
export async function getSession(request) {
  const token = readCookie(request);
  if (!token) return null;
  const pool = await getPool();
  if (!pool) return null;
  const result = await pool.query("select s.id session_id,s.user_id,s.organization_id,s.expires_at,u.email,u.full_name,u.role,u.status from net_auth_sessions s join net_users u on u.id=s.user_id where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and u.status='ACTIVE' limit 1", [hashToken(token)]);
  const row = result.rows[0];
  if (!row) return null;
  await pool.query("update net_auth_sessions set last_seen_at=now() where id=$1", [row.session_id]);
  return row;
}
export async function requireSession(request, roles = []) {
  const session = await getSession(request);
  if (!session) throw new Error("AUTH_REQUIRED");
  if (roles.length && !roles.includes(session.role)) throw new Error("FORBIDDEN");
  return session;
}
export async function authenticateOperator({ email, password, request }) {
  const normalizedEmail = normalizeEmail(email), pool = await getPool();
  if (!pool) throw new Error("DATABASE_URL is not configured");
  const result = await pool.query("select id,organization_id,email,full_name,password_hash,role,status,failed_login_count,locked_until from net_users where lower(email)=$1 limit 1", [normalizedEmail]);
  const user = result.rows[0];
  if (!user) throw new Error("Invalid email or password");
  if (user.locked_until && new Date(user.locked_until) > new Date()) throw new Error("Account temporarily locked");
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await pool.query("update net_users set failed_login_count=failed_login_count+1,locked_until=case when failed_login_count+1 >= $2 then now()+interval '15 minutes' else locked_until end,updated_at=now() where id=$1", [user.id, MAX_FAILURES]);
    throw new Error("Invalid email or password");
  }
  if (user.status !== "ACTIVE") throw new Error("Account is not active");
  const token = await createSession({ userId: user.id, organizationId: user.organization_id, request });
  return { token, user: { id:user.id, organizationId:user.organization_id, email:user.email, fullName:user.full_name, role:user.role } };
}
export async function revokeSession(request) {
  const token = readCookie(request);
  if (!token) return;
  const pool = await getPool();
  if (!pool) return;
  await pool.query("update net_auth_sessions set revoked_at=now() where token_hash=$1 and revoked_at is null", [hashToken(token)]);
}
