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

// ─── Dashboard Items ────────────────────────────────────────────────────────

export async function getAllDashboardItems() {
  const { rows } = await pool.query(
    "SELECT * FROM dashboard_items ORDER BY sort_order, id",
  );
  return rows;
}

export async function createDashboardItem(fields) {
  const { node_id, label, command_class, property, property_key, endpoint, sort_order, read_property, read_property_key } = fields;
  const { rows } = await pool.query(
    `INSERT INTO dashboard_items (node_id, label, command_class, property, property_key, endpoint, sort_order, read_property, read_property_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [node_id, label, command_class, property, property_key ?? null, endpoint ?? null, sort_order ?? 0, read_property ?? null, read_property_key ?? null],
  );
  return rows[0];
}

export async function updateDashboardItem(id, fields) {
  const { label, sort_order, node_id, command_class, property, property_key, endpoint, read_property, read_property_key } = fields;
  const { rows } = await pool.query(
    `UPDATE dashboard_items SET
       label = COALESCE($2, label),
       sort_order = COALESCE($3, sort_order),
       node_id = COALESCE($4, node_id),
       command_class = COALESCE($5, command_class),
       property = COALESCE($6, property),
       property_key = COALESCE($7, property_key),
       endpoint = COALESCE($8, endpoint),
       read_property = COALESCE($9, read_property),
       read_property_key = COALESCE($10, read_property_key)
     WHERE id = $1 RETURNING *`,
    [id, label ?? null, sort_order ?? null, node_id ?? null, command_class ?? null, property ?? null, property_key ?? null, endpoint ?? null, read_property ?? null, read_property_key ?? null],
  );
  return rows[0] ?? null;
}

export async function deleteDashboardItem(id) {
  const { rowCount } = await pool.query(
    "DELETE FROM dashboard_items WHERE id = $1",
    [id],
  );
  return rowCount > 0;
}

// ─── Events ─────────────────────────────────────────────────────────────────

export async function insertEvent(nodeId, property, value) {
  await pool.query(
    "INSERT INTO events (time, node_id, property, value) VALUES (NOW(), $1, $2, $3)",
    [nodeId, property, JSON.stringify(value)],
  );
}

export { pool };
