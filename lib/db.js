import pg from "pg";
import { migrate } from "postgres-migrations";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "koldenhome",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await migrate({ client }, join(__dirname, "..", "migrations"));
  } finally {
    client.release();
  }
}

export async function getConfig(key) {
  const { rows } = await pool.query(
    "SELECT value FROM config WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setConfig(key, value) {
  await pool.query(
    `INSERT INTO config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, value],
  );
}

export async function getConfigByPrefix(prefix) {
  const { rows } = await pool.query(
    "SELECT key, value FROM config WHERE key LIKE $1",
    [prefix + "%"],
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export { pool };
