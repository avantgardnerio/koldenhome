// Thermostat Mode CC = 64, Multilevel Sensor CC = 49, Fan Mode CC = 68
const CC_THERMOSTAT_MODE = 0x40;
const CC_MULTILEVEL_SENSOR = 0x31;
const CC_THERMOSTAT_FAN_MODE = 0x44;

const FAN = { AUTO_LOW: 0, CIRCULATION: 6 };

export default async function hvacMode(manager, config) {
  const {
    sensor_node_id, thermostat_node_id, heat_below, cool_above,
    zone_sensors = [], circ_fan_on, circ_fan_off,
    outdoor_sensor_id, balance_point = 40, balance_point_hysteresis = 3,
  } = config;

  const zoneTemps = new Map();

  const MODES = { OFF: 0, HEAT: 1, COOL: 2, AUX_HEAT: 4 };

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

  const getCurrentFanMode = () => {
    try {
      const node = manager.getDriver().controller.nodes.get(thermostat_node_id);
      if (!node) return null;
      return node.getValue({
        commandClass: CC_THERMOSTAT_FAN_MODE,
        property: "mode",
      });
    } catch (err) {
      console.error(`[hvac-mode] failed to read fan mode: ${err.message}`);
      return null;
    }
  };

  const setFanMode = async (mode) => {
    const node = manager.getDriver().controller.nodes.get(thermostat_node_id);
    if (!node) {
      console.error(`[hvac-mode] thermostat node ${thermostat_node_id} not found`);
      return;
    }
    await node.setValue(
      { commandClass: CC_THERMOSTAT_FAN_MODE, property: "mode" },
      mode,
    );
  };

  // DISABLED: circ fan runs almost continuously with current zone spread,
  // risk of burning out the PSC blower motor. Revisit after insulation work.
  const evaluateZoneSpread = async () => {
    // if (zoneTemps.size < 2) return;
    // const temps = [...zoneTemps.values()];
    // const spread = Math.max(...temps) - Math.min(...temps);
    // const fanMode = getCurrentFanMode();

    // if (spread > circ_fan_on && fanMode !== FAN.CIRCULATION) {
    //   console.log(`[hvac-mode] zone spread ${spread.toFixed(1)}°F > ${circ_fan_on}°F — enabling Circulation`);
    //   await setFanMode(FAN.CIRCULATION);
    // } else if (spread < circ_fan_off && fanMode === FAN.CIRCULATION) {
    //   console.log(`[hvac-mode] zone spread ${spread.toFixed(1)}°F < ${circ_fan_off}°F — returning to Auto Low`);
    //   await setFanMode(FAN.AUTO_LOW);
    // }
  };

  const getOutdoorTemp = () => {
    if (!outdoor_sensor_id) return null;
    try {
      const node = manager.getDriver().controller.nodes.get(outdoor_sensor_id);
      if (!node) return null;
      return node.getValue({
        commandClass: CC_MULTILEVEL_SENSOR,
        property: "Air temperature",
      });
    } catch { return null; }
  };

  const pickHeatingMode = (currentMode) => {
    const outdoorTemp = getOutdoorTemp();
    if (outdoorTemp == null) return MODES.HEAT;

    if (currentMode === MODES.AUX_HEAT && outdoorTemp > balance_point + balance_point_hysteresis) {
      console.log(`[hvac-mode] outdoor ${outdoorTemp}°F > ${balance_point + balance_point_hysteresis}°F — switching furnace → HP`);
      return MODES.HEAT;
    }
    if (outdoorTemp < balance_point) {
      if (currentMode !== MODES.AUX_HEAT) {
        console.log(`[hvac-mode] outdoor ${outdoorTemp}°F < ${balance_point}°F — switching HP → furnace`);
      }
      return MODES.AUX_HEAT;
    }
    return currentMode === MODES.AUX_HEAT ? MODES.AUX_HEAT : MODES.HEAT;
  };

  const evaluate = async (temp) => {
    if (temp == null) {
      console.warn("[hvac-mode] evaluate called with null temp, skipping");
      return;
    }

    const currentMode = getCurrentMode();

    if (temp < heat_below) {
      const desiredMode = pickHeatingMode(currentMode);
      if (currentMode !== desiredMode) {
        const label = desiredMode === MODES.AUX_HEAT ? "Aux Heat (furnace)" : "Heat (HP)";
        console.log(`[hvac-mode] ${temp}°F < ${heat_below}°F — switching to ${label} (outdoor: ${getOutdoorTemp() ?? "unknown"}°F)`);
        await setMode(desiredMode);
      }
    } else if (temp > cool_above && currentMode !== MODES.COOL) {
      console.log(`[hvac-mode] ${temp}°F > ${cool_above}°F — switching to Cool`);
      await setMode(MODES.COOL);
    }
  };

  // Log outdoor temp on startup
  if (outdoor_sensor_id) {
    const outdoorTemp = getOutdoorTemp();
    console.log(`[hvac-mode] init: outdoor sensor ${outdoor_sensor_id} reads ${outdoorTemp ?? "unknown"}°F (balance point: ${balance_point}°F ±${balance_point_hysteresis}°F)`);
  }

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

  // Sync zone temps on startup
  for (const id of zone_sensors) {
    try {
      const node = manager.getDriver().controller.nodes.get(id);
      if (!node) continue;
      const temp = node.getValue({
        commandClass: CC_MULTILEVEL_SENSOR,
        property: "Air temperature",
      });
      if (temp != null) {
        zoneTemps.set(id, temp);
        console.log(`[hvac-mode] init: zone sensor ${id} reads ${temp}°F`);
      }
    } catch (err) {
      console.error(`[hvac-mode] init zone sensor ${id} failed: ${err.message}`);
    }
  }
  await evaluateZoneSpread();

  return {
    async valueUpdated(node, args) {
      if (args.commandClass !== CC_MULTILEVEL_SENSOR) return;
      if (args.propertyName !== "Air temperature") return;
      const temp = args.newValue ?? args.value;

      if (node.id === sensor_node_id) {
        await evaluate(temp);
      }

      if (node.id === outdoor_sensor_id) {
        console.log(`[hvac-mode] outdoor temp update: ${temp}°F`);
        // Re-evaluate with cached indoor temp
        const sensorNode = manager.getDriver().controller.nodes.get(sensor_node_id);
        const indoorTemp = sensorNode?.getValue({
          commandClass: CC_MULTILEVEL_SENSOR,
          property: "Air temperature",
        });
        await evaluate(indoorTemp);
      }

      if (zone_sensors.includes(node.id)) {
        zoneTemps.set(node.id, temp);
        await evaluateZoneSpread();
      }
    },
  };
}
