import { getSunrise, getSunset } from "sunrise-sunset-js";
import { notify } from "../lib/notify.js";

const CC_BINARY_SWITCH = 37;

export default async function coop(manager, config) {
  const {
    node_id,
    door_endpoint = 1,
    light_endpoint = 2,
    location,
    light_on_min_before_sunset = 30,
    light_off_min_after_sunset = 30,
    door_close_min_after_sunset = 20,
  } = config;
  const [lat, lon] = location;
  const timers = [];

  const getNode = () => {
    const node = manager.getDriver().controller.nodes.get(node_id);
    if (!node) console.error(`[coop] node ${node_id} not found`);
    return node;
  };

  const setRelay = async (endpoint, on, what) => {
    const node = getNode();
    if (!node) return false;
    console.log(`[coop] ${what} ${on ? "ON" : "OFF"}`);
    try {
      await node.setValue(
        { commandClass: CC_BINARY_SWITCH, property: "targetValue", endpoint },
        on,
      );
      return true;
    } catch (e) {
      console.error(`[coop] ${what} ${on ? "ON" : "OFF"} failed:`, e.message);
      return false;
    }
  };

  // Relay is level-based: OFF = door down. JVR anti-pinch still reverses on a chicken.
  const closeDoor = async () => {
    const ok = await setRelay(door_endpoint, false, "door");
    await notify(ok
      ? { title: "Coop door closed", body: "Check for chickens locked out." }
      : { title: "Coop door FAILED to close", body: "Door may still be open — check the coop." });
  };

  const schedule = (label, getNextTime, action) => {
    const now = new Date();
    let target = getNextTime(now);
    let delay = target.getTime() - now.getTime();
    // Treat small positive delays as "we just fired" — sun drifts seconds/day,
    // so the recursive reschedule sees today's event still seconds in the future.
    if (delay < 60_000) {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      delay = getNextTime(tomorrow).getTime() - now.getTime();
    }
    console.log(`[coop] next ${label} in ${Math.round(delay / 60000)}min`);
    const id = setTimeout(() => {
      action();
      schedule(label, getNextTime, action);
    }, delay);
    timers.push(id);
  };

  schedule(
    "sunrise door-open",
    (d) => getSunrise(lat, lon, d),
    () => setRelay(door_endpoint, true, "door"),
  );

  schedule(
    "door-close (post-sunset)",
    (d) => new Date(getSunset(lat, lon, d).getTime() + door_close_min_after_sunset * 60 * 1000),
    closeDoor,
  );

  schedule(
    "light-on (pre-sunset)",
    (d) => new Date(getSunset(lat, lon, d).getTime() - light_on_min_before_sunset * 60 * 1000),
    () => setRelay(light_endpoint, true, "light"),
  );

  schedule(
    "light-off (post-sunset)",
    (d) => new Date(getSunset(lat, lon, d).getTime() + light_off_min_after_sunset * 60 * 1000),
    () => setRelay(light_endpoint, false, "light"),
  );

  return {
    valueUpdated() {},
  };
}
