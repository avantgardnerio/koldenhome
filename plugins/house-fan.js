const CC_BINARY_SWITCH = 0x25;
const CC_THERMOSTAT_MODE = 0x40;
const CC_MULTILEVEL_SENSOR = 0x31;

export default async function houseFan(manager, config) {
  const {
    fan_node_id,
    thermostat_node_id,
    shutoff_temp,
    shutoff_sensor_id = thermostat_node_id,
    shutoff_switches = [],
  } = config;

  const getFanOn = () => {
    try {
      const node = manager.getDriver().controller.nodes.get(fan_node_id);
      if (!node) return false;
      return !!node.getValue({ commandClass: CC_BINARY_SWITCH, property: "currentValue" });
    } catch { return false; }
  };

  const setFanOff = async () => {
    const node = manager.getDriver().controller.nodes.get(fan_node_id);
    if (!node) throw new Error(`fan node ${fan_node_id} not found`);
    await node.setValue({ commandClass: CC_BINARY_SWITCH, property: "targetValue" }, false);
  };

  const setSwitchOff = async (switchNodeId) => {
    const node = manager.getDriver().controller.nodes.get(switchNodeId);
    if (!node) throw new Error(`switch node ${switchNodeId} not found`);
    await node.setValue({ commandClass: CC_BINARY_SWITCH, property: "targetValue" }, false);
  };

  console.log(
    `[house-fan] init: floor shutoff ${shutoff_temp ?? "disabled"}°F via sensor ${shutoff_sensor_id}` +
    (shutoff_switches.length ? `, shutoff switches: ${shutoff_switches.join(",")}` : ""),
  );

  return {
    async valueUpdated(node, args) {
      // Fan turned on → set thermostat off + shut off conflicting switches
      if (node.id === fan_node_id
          && args.commandClass === CC_BINARY_SWITCH
          && args.propertyName === "currentValue") {
        const value = args.newValue ?? args.value;
        if (!value) return;

        console.log(`[house-fan] attic fan turned on, setting thermostat to Off`);
        try {
          const thermostat = manager.getDriver().controller.nodes.get(thermostat_node_id);
          if (!thermostat) {
            console.error(`[house-fan] thermostat node ${thermostat_node_id} not found`);
          } else {
            await thermostat.setValue(
              { commandClass: CC_THERMOSTAT_MODE, property: "mode" },
              0, // Off
            );
            console.log(`[house-fan] thermostat set to Off`);
          }
        } catch (err) {
          console.error(`[house-fan] failed to set thermostat mode: ${err.message}`);
        }

        for (const switchNodeId of shutoff_switches) {
          try {
            await setSwitchOff(switchNodeId);
            console.log(`[house-fan] switch ${switchNodeId} set to Off`);
          } catch (err) {
            console.error(`[house-fan] failed to turn switch ${switchNodeId} off: ${err.message}`);
          }
        }
        return;
      }

      // Temperature update from shutoff sensor → floor shutoff
      if (node.id === shutoff_sensor_id
          && args.commandClass === CC_MULTILEVEL_SENSOR
          && args.propertyName === "Air temperature") {
        const temp = args.newValue ?? args.value;
        if (temp == null) return;
        if (!getFanOn()) return;

        if (shutoff_temp != null && temp <= shutoff_temp) {
          console.log(`[house-fan] ${temp}°F <= ${shutoff_temp}°F floor — turning fan off`);
          try { await setFanOff(); } catch (err) {
            console.error(`[house-fan] failed to turn fan off: ${err.message}`);
          }
        }
      }
    },
  };
}
