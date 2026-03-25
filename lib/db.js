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

// ─── Devices ────────────────────────────────────────────────────────────────

export async function getDevice(nodeId) {
  const { rows } = await pool.query(
    "SELECT * FROM devices WHERE node_id = $1",
    [nodeId],
  );
  return rows[0] ?? null;
}

export async function getAllDevices() {
  const { rows } = await pool.query("SELECT * FROM devices ORDER BY node_id");
  return rows;
}

export async function upsertDevice(nodeId, fields) {
  const { name, location, notes } = fields;
  await pool.query(
    `INSERT INTO devices (node_id, name, location, notes) VALUES ($1, $2, $3, $4)
     ON CONFLICT (node_id) DO UPDATE SET
       name = COALESCE($2, devices.name),
       location = COALESCE($3, devices.location),
       notes = COALESCE($4, devices.notes)`,
    [nodeId, name ?? null, location ?? null, notes ?? null],
  );
}

// ─── Events ─────────────────────────────────────────────────────────────────

export async function insertEvent(nodeId, property, value) {
  await pool.query(
    "INSERT INTO events (time, node_id, property, value) VALUES (NOW(), $1, $2, $3)",
    [nodeId, property, JSON.stringify(value)],
  );
}

export { pool };
