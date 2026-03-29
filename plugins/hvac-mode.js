// Thermostat Mode CC = 64, Multilevel Sensor CC = 49
const CC_THERMOSTAT_MODE = 0x40;
const CC_MULTILEVEL_SENSOR = 0x31;

export default async function hvacMode(manager, config) {
  const { sensor_node_id, thermostat_node_id, heat_below, cool_above } = config;

  const MODES = { OFF: 0, HEAT: 1, COOL: 2 };

  const getCurrentMode = () => {
    try {
      const node = manager.getDriver().controller.nodes.get(thermostat_node_id);
      if (!node) {
        console.warn(`[hvac-mode] thermostat node ${thermostat_node_id} not found, can't read mode`);
        return null;
      }
      return node.getValue({
        commandClass: CC_THERMOSTAT_MODE,
        property: "mode",
      });
    } catch (err) {
      console.error(`[hvac-mode] failed to read thermostat mode: ${err.message}`);
      return null;
    }
  };

  const setMode = async (mode) => {
    const node = manager.getDriver().controller.nodes.get(thermostat_node_id);
    if (!node) {
      console.error(`[hvac-mode] thermostat node ${thermostat_node_id} not found`);
      return;
    }
    await node.setValue(
      { commandClass: CC_THERMOSTAT_MODE, property: "mode" },
      mode,
    );
  };

  const evaluate = async (temp) => {
    if (temp == null) {
      console.warn("[hvac-mode] evaluate called with null temp, skipping");
      return;
    }

    const currentMode = getCurrentMode();

    if (temp < heat_below && currentMode !== MODES.HEAT) {
      console.log(`[hvac-mode] ${temp}°F < ${heat_below}°F — switching to Heat`);
      await setMode(MODES.HEAT);
    } else if (temp > cool_above && currentMode !== MODES.COOL) {
      console.log(`[hvac-mode] ${temp}°F > ${cool_above}°F — switching to Cool`);
      await setMode(MODES.COOL);
    }
  };

  // Sync mode on startup from current sensor reading
  try {
    const sensorNode = manager.getDriver().controller.nodes.get(sensor_node_id);
    if (!sensorNode) {
      console.warn(`[hvac-mode] init: sensor node ${sensor_node_id} not found`);
    } else {
      const temp = sensorNode.getValue({
        commandClass: CC_MULTILEVEL_SENSOR,
        property: "Air temperature",
      });
      if (temp == null) {
        console.warn(`[hvac-mode] init: sensor ${sensor_node_id} has no temp reading yet`);
      } else {
        console.log(`[hvac-mode] init: sensor ${sensor_node_id} reads ${temp}°F`);
        await evaluate(temp);
      }
    }
  } catch (err) {
    console.error(`[hvac-mode] init sync failed: ${err.message}`);
  }

  return {
    async valueUpdated(node, args) {
      if (node.id !== sensor_node_id) return;
      if (args.propertyName !== "Air temperature") return;
      const temp = args.newValue ?? args.value;
      await evaluate(temp);
    },
  };
}
