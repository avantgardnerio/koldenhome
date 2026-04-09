import { notify } from "../lib/notify.js";

const CC_SOUND_SWITCH = 0x79; // 121

export default async function doorbell(_manager, config) {
  const { node_id } = config;

  return {
    async valueUpdated(node, args) {
      if (node.id !== node_id) return;
      if (args.commandClass !== CC_SOUND_SWITCH) return;
      if (args.propertyName !== "toneId") return;

      const toneId = args.newValue ?? args.value;
      if (!toneId) return; // ignore 0 (stopped)

      console.log(`[doorbell] node ${node.id} rang (tone ${toneId})`);
      await notify({
        title: "Doorbell",
        body: "Someone is at the door!",
        data: { nodeId: node.id, toneId },
      });
    },
  };
}
