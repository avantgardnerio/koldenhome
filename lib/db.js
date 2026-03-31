import pg from "pg";
import { migrate } from "postgres-migrations";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "koldenhome",
  user: process.env.DB_USER || "koldenhome",
});

export async function runMigrations() {
  const client = new pg.Client({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || "koldenhome",
    user: "koldenhome_migrations",
  });
  await client.connect();
  try {
    await migrate({ client }, join(__dirname, "..", "migrations"));
  } finally {
    await client.end();
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
  const { node_id, label, command_class, property, property_key, endpoint, sort_order, read_property, read_property_key, true_value, false_value } = fields;
  const { rows } = await pool.query(
    `INSERT INTO dashboard_items (node_id, label, command_class, property, property_key, endpoint, sort_order, read_property, read_property_key, true_value, false_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [node_id, label, command_class, property, property_key ?? null, endpoint ?? null, sort_order ?? 0, read_property ?? null, read_property_key ?? null, true_value ?? null, false_value ?? null],
  );
  return rows[0];
}

export async function updateDashboardItem(id, fields) {
  const { label, sort_order, node_id, command_class, property, property_key, endpoint, read_property, read_property_key, true_value, false_value } = fields;
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
       read_property_key = COALESCE($10, read_property_key),
       true_value = COALESCE($11, true_value),
       false_value = COALESCE($12, false_value)
     WHERE id = $1 RETURNING *`,
    [id, label ?? null, sort_order ?? null, node_id ?? null, command_class ?? null, property ?? null, property_key ?? null, endpoint ?? null, read_property ?? null, read_property_key ?? null, true_value ?? null, false_value ?? null],
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

// ─── Users ──────────────────────────────────────────────────────────────

export async function findUserById(id) {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function findUserByGoogleId(googleId) {
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE google_id = $1",
    [googleId],
  );
  return rows[0] ?? null;
}

export async function createUser({ googleId, email, name, picture }) {
  const { rows } = await pool.query(
    `INSERT INTO users (google_id, email, name, picture, last_login)
     VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
    [googleId, email, name ?? null, picture ?? null],
  );
  return rows[0];
}

export async function updateUserLogin(id, { name, picture }) {
  const { rows } = await pool.query(
    `UPDATE users SET name = COALESCE($2, name), picture = COALESCE($3, picture),
       last_login = NOW() WHERE id = $1 RETURNING *`,
    [id, name ?? null, picture ?? null],
  );
  return rows[0];
}

export async function getUserById(id) {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function getAllUsers() {
  const { rows } = await pool.query(
    "SELECT id, email, name, picture, role, created_at, last_login FROM users ORDER BY id",
  );
  return rows;
}

export async function setUserRole(id, role) {
  const { rows } = await pool.query(
    "UPDATE users SET role = $2 WHERE id = $1 RETURNING id, email, name, role",
    [id, role],
  );
  return rows[0] ?? null;
}

// ─── Plugins ─────────────────────────────────────────────────────────────────

export async function getAllPlugins() {
  const { rows } = await pool.query("SELECT * FROM plugins ORDER BY id");
  return rows;
}

export async function getEnabledPlugins() {
  const { rows } = await pool.query(
    "SELECT * FROM plugins WHERE enabled = true ORDER BY id",
  );
  return rows;
}

export async function createPlugin(type, name, config = {}) {
  const { rows } = await pool.query(
    "INSERT INTO plugins (type, name, config) VALUES ($1, $2, $3) RETURNING *",
    [type, name, JSON.stringify(config)],
  );
  return rows[0];
}

export async function updatePlugin(id, fields) {
  const { name, enabled, config } = fields;
  const { rows } = await pool.query(
    `UPDATE plugins SET
       name = COALESCE($2, name),
       enabled = COALESCE($3, enabled),
       config = COALESCE($4, config)
     WHERE id = $1 RETURNING *`,
    [id, name ?? null, enabled ?? null, config ? JSON.stringify(config) : null],
  );
  return rows[0] ?? null;
}

export async function deletePlugin(id) {
  const { rowCount } = await pool.query(
    "DELETE FROM plugins WHERE id = $1",
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
