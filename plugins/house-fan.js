const CC_BINARY_SWITCH = 0x25;
const CC_THERMOSTAT_MODE = 0x40;

export default async function houseFan(manager, config) {
  const { fan_node_id, thermostat_node_id } = config;

  return {
    async valueUpdated(node, args) {
      if (node.id !== fan_node_id) return;
      if (args.commandClass !== CC_BINARY_SWITCH) return;
      if (args.propertyName !== "currentValue") return;

      const value = args.newValue ?? args.value;
      if (!value) return; // only act on fan turning ON

      console.log(`[house-fan] attic fan turned on, setting thermostat to Off`);

      try {
        const thermostat = manager.getDriver().controller.nodes.get(thermostat_node_id);
        if (!thermostat) {
          console.error(`[house-fan] thermostat node ${thermostat_node_id} not found`);
          return;
        }
        await thermostat.setValue(
          { commandClass: CC_THERMOSTAT_MODE, property: "mode" },
          0, // Off
        );
        console.log(`[house-fan] thermostat set to Off`);
      } catch (err) {
        console.error(`[house-fan] failed to set thermostat mode: ${err.message}`);
      }
    },
  };
}
