import { getSunrise, getSunset } from "sunrise-sunset-js";

const CC_BINARY_SWITCH = 37;
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

const CC_SENSOR_MULTILEVEL = 49;

export default async function sprinkler(manager, config) {
  const { node_id, runs, location, rain_threshold_mm = 0, freeze_node_id } = config;
  const [lat, lon] = location;
  const timers = [];

  const getNode = () => {
    const node = manager.getDriver().controller.nodes.get(node_id);
    if (!node) console.error(`[sprinkler] node ${node_id} not found`);
    return node;
  };

  const runZone = async (zone, duration) => {
    const node = getNode();
    if (!node) return;
    console.log(`[sprinkler] starting zone ${zone} for ${duration}min`);
    await node.setValue(
      { commandClass: CC_BINARY_SWITCH, property: "targetValue", endpoint: zone },
      true,
    );
    await new Promise((r) => setTimeout(r, duration * 60 * 1000));
    await node.setValue(
      { commandClass: CC_BINARY_SWITCH, property: "targetValue", endpoint: zone },
      false,
    );
    console.log(`[sprinkler] zone ${zone} off`);
  };

  const checkRain = async () => {
    try {
      const url = `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lon}&hourly=precipitation&past_days=1&forecast_days=1&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      const total = data.hourly.precipitation.reduce((sum, v) => sum + v, 0);
      console.log(`[sprinkler] rain check: ${total.toFixed(1)}mm in ±24h (threshold: ${rain_threshold_mm}mm)`);
      return total;
    } catch (e) {
      console.error("[sprinkler] rain check failed, skipping run:", e.message);
      return Infinity;
    }
  };

  const checkFreeze = () => {
    if (!freeze_node_id) return false;
    try {
      const node = manager.getDriver().controller.nodes.get(freeze_node_id);
      if (!node) {
        console.error(`[sprinkler] freeze sensor node ${freeze_node_id} not found, skipping run`);
        return true;
      }
      const temp = node.getValue({ commandClass: CC_SENSOR_MULTILEVEL, property: "Air temperature" });
      if (temp == null) {
        console.error("[sprinkler] freeze sensor has no temp value, skipping run");
        return true;
      }
      console.log(`[sprinkler] outdoor temp: ${temp}°F`);
      if (temp <= 37) {
        console.log(`[sprinkler] skipping run — ${temp}°F is near or below freezing`);
        return true;
      }
      return false;
    } catch (e) {
      console.error("[sprinkler] freeze check failed, skipping run:", e.message);
      return true;
    }
  };

  const runSequence = async (zones) => {
    if (checkFreeze()) return;
    const rain = await checkRain();
    if (rain > rain_threshold_mm) {
      console.log(`[sprinkler] skipping run — ${rain.toFixed(1)}mm rain exceeds threshold`);
      return;
    }
    for (const { zone, duration } of zones) {
      await runZone(zone, duration);
    }
    console.log("[sprinkler] run complete");
  };

  const resolveStart = (start) => {
    const now = new Date();
    if (start === "sunrise") return getSunrise(lat, lon, now);
    if (start === "sunset") return getSunset(lat, lon, now);
    // Fixed HH:MM
    const [h, m] = start.split(":").map(Number);
    const t = new Date(now);
    t.setHours(h, m, 0, 0);
    return t;
  };

  const scheduleRun = (run) => {
    const now = new Date();
    let target = resolveStart(run.start);
    let delay = target.getTime() - now.getTime();
    if (delay < 0) delay += 24 * 60 * 60 * 1000; // tomorrow

    console.log(`[sprinkler] next "${run.start}" run in ${Math.round(delay / 60000)}min`);

    const id = setTimeout(() => {
      runSequence(run.zones);
      scheduleRun(run); // reschedule for next day
    }, delay);
    timers.push(id);
  };

  for (const run of runs) {
    scheduleRun(run);
  }

  return {
    valueUpdated() {},
  };
}
