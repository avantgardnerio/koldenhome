const CC_BINARY_SWITCH = 0x25;
const CC_THERMOSTAT_MODE = 0x40;
const CC_MULTILEVEL_SENSOR = 0x31;

export default async function houseFan(manager, config) {
  const {
    fan_node_id,
    thermostat_node_id,
    shutoff_temp,
    shutoff_sensor_id = thermostat_node_id,
    no_progress_window_min = 30,
    no_progress_threshold_f = 0.5,
  } = config;

  const noProgressWindowMs = no_progress_window_min * 60 * 1000;
  // Require at least 80% of window before evaluating no-progress
  const noProgressMinSpanMs = Math.floor(noProgressWindowMs * 0.8);

  const tempHistory = [];
  const resetHistory = () => { tempHistory.length = 0; };

  const checkNoProgress = (now, temp) => {
    while (tempHistory.length && now - tempHistory[0].time > noProgressWindowMs) {
      tempHistory.shift();
    }
    tempHistory.push({ time: now, temp });
    if (tempHistory.length < 2) return false;
    const span = now - tempHistory[0].time;
    if (span < noProgressMinSpanMs) return false;
    const maxInWindow = Math.max(...tempHistory.map(h => h.temp));
    const drop = maxInWindow - temp;
    return drop < no_progress_threshold_f;
  };

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

  console.log(
    `[house-fan] init: floor shutoff ${shutoff_temp ?? "disabled"}°F, ` +
    `no-progress shutoff < ${no_progress_threshold_f}°F drop over ${no_progress_window_min}min, ` +
    `via sensor ${shutoff_sensor_id}`,
  );

  return {
    async valueUpdated(node, args) {
      // Fan state change → reset history + (on-only) set thermostat off
      if (node.id === fan_node_id
          && args.commandClass === CC_BINARY_SWITCH
          && args.propertyName === "currentValue") {
        const value = args.newValue ?? args.value;
        resetHistory();
        if (!value) return;

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
        return;
      }

      // Temperature update from shutoff sensor
      if (node.id === shutoff_sensor_id
          && args.commandClass === CC_MULTILEVEL_SENSOR
          && args.propertyName === "Air temperature") {
        const temp = args.newValue ?? args.value;
        if (temp == null) return;
        if (!getFanOn()) {
          // Keep buffer clear while off so we always evaluate a fresh window
          resetHistory();
          return;
        }

        // Floor shutoff: house is cold enough, stop
        if (shutoff_temp != null && temp <= shutoff_temp) {
          console.log(`[house-fan] ${temp}°F <= ${shutoff_temp}°F floor — turning fan off`);
          try { await setFanOff(); } catch (err) {
            console.error(`[house-fan] failed to turn fan off: ${err.message}`);
          }
          return;
        }

        // No-progress shutoff: temp hasn't dropped meaningfully over the window
        const now = Date.now();
        if (checkNoProgress(now, temp)) {
          const maxInWindow = Math.max(...tempHistory.map(h => h.temp));
          console.log(
            `[house-fan] no progress (${maxInWindow}→${temp}°F = ${(maxInWindow - temp).toFixed(1)}°F over ` +
            `${no_progress_window_min}min, threshold ${no_progress_threshold_f}°F) — turning fan off`,
          );
          try { await setFanOff(); } catch (err) {
            console.error(`[house-fan] failed to turn fan off: ${err.message}`);
          }
        }
      }
    },
  };
}
