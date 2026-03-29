import { getEnabledPlugins } from "./db.js";

let instances = [];

export async function loadPlugins(manager) {
  const rows = await getEnabledPlugins();
  instances = [];

  for (const row of rows) {
    try {
      const mod = await import(`../plugins/${row.type}.js`);
      const instance = await mod.default(manager, row.config);
      instances.push({ id: row.id, name: row.name, type: row.type, instance });
      console.log(`[plugins] loaded "${row.name}" (${row.type})`);
    } catch (err) {
      console.error(`[plugins] failed to load "${row.name}" (${row.type}): ${err.message}`);
    }
  }

  return instances;
}

export function getPluginInstances() {
  return instances;
}
