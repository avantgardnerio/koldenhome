import { notify } from "../lib/notify.js";
import { getDevice } from "../lib/db.js";

const CC_BATTERY = 0x80;

export default async function lowBattery(manager, config) {
  const { threshold = 20 } = config;
  const notified = new Set();

  async function check(node, level) {
    if (level == null) return;

    if (level <= threshold && !notified.has(node.id)) {
      notified.add(node.id);
      const device = await getDevice(node.id);
      const name = device?.name ?? node.name ?? `Node ${node.id}`;
      console.log(`[low-battery] ${name} (node ${node.id}) battery at ${level}% (threshold: ${threshold}%)`);
      await notify({
        title: "Low Battery",
        body: `${name} battery is at ${level}%`,
        data: { nodeId: node.id, level },
      });
    } else if (level > threshold && notified.has(node.id)) {
      notified.delete(node.id);
    }
  }

  // Battery devices report rarely (weekly), so check cached levels at startup
  // instead of waiting for the next report.
  for (const node of manager.getDriver().controller.nodes.values()) {
    await check(node, node.getValue({ commandClass: CC_BATTERY, property: "level" }));
  }

  return {
    async valueUpdated(node, args) {
      if (args.commandClass !== CC_BATTERY) return;
      if (args.propertyName !== "level") return;
      await check(node, args.newValue ?? args.value);
    },
  };
}
