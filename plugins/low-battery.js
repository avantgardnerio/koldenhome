import { notify } from "../lib/notify.js";

const CC_BATTERY = 0x80;

export default async function lowBattery(_manager, config) {
  const { threshold = 20 } = config;
  const notified = new Set();

  return {
    async valueUpdated(node, args) {
      if (args.commandClass !== CC_BATTERY) return;
      if (args.propertyName !== "level") return;

      const level = args.newValue ?? args.value;
      if (level == null) return;

      if (level <= threshold && !notified.has(node.id)) {
        notified.add(node.id);
        console.log(`[low-battery] node ${node.id} battery at ${level}% (threshold: ${threshold}%)`);
        await notify({
          title: "Low Battery",
          body: `Node ${node.id} battery is at ${level}%`,
          data: { nodeId: node.id, level },
        });
      } else if (level > threshold && notified.has(node.id)) {
        notified.delete(node.id);
      }
    },
  };
}
