import { getSunrise, getSunset } from "sunrise-sunset-js";

const CC_IRRIGATION = 107;

export default async function sprinkler(manager, config) {
  const { node_id, runs, location } = config;
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
      { commandClass: CC_IRRIGATION, property: zone, propertyKey: "duration" },
      duration,
    );
    await node.setValue(
      { commandClass: CC_IRRIGATION, property: zone, propertyKey: "startStop" },
      true,
    );
  };

  const runSequence = async (zones) => {
    for (const { zone, duration } of zones) {
      await runZone(zone, duration);
      await new Promise((r) => setTimeout(r, duration * 60 * 1000));
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
