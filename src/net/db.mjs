let poolPromise;

export async function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!poolPromise) {
    poolPromise = import("pg").then(({ Pool }) => {
      const ssl = process.env.DATABASE_SSL === "disable" ? false : {
        rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== "0",
        ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT } : {}),
      };
      return new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.JASLYN_DB_POOL_MAX || 10), idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, ssl });
    });
  }
  return poolPromise;
}

export async function databaseHealth() {
  const pool = await getPool();
  if (!pool) return { configured: false, ok: false, error: "DATABASE_URL is not configured." };
  const started = Date.now();
  try {
    const result = await pool.query("select 1 as ok");
    return { configured: true, ok: result.rows[0]?.ok === 1, latencyMs: Date.now() - started };
  } catch (error) {
    return { configured: true, ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function withTransaction(work) {
  const pool = await getPool();
  if (!pool) throw new Error("DATABASE_URL is not configured");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
