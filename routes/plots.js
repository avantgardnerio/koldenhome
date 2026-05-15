import { Router } from "express";
import { getSunrise, getSunset } from "sunrise-sunset-js";
import { asyncHandler } from "../lib/helpers.js";
import { getPlotData, getAllDevices, getEnabledPlugins } from "../lib/db.js";

const router = Router();
const LAT = 40.585, LON = -105.084;

function computeBands(days) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 86400000);
  const nights = [];
  const peaks = [];

  // Walk day by day from start-1 to now+1 (to catch partial bands at edges)
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  const end = new Date(now);
  end.setDate(end.getDate() + 1);

  while (d <= end) {
    const sunset = getSunset(LAT, LON, d);
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextSunrise = getSunrise(LAT, LON, nextDay);
    // Clamp to data window
    const nStart = sunset < start ? start : sunset;
    const nEnd = nextSunrise > now ? now : nextSunrise;
    if (nStart < nEnd) {
      nights.push({ start: nStart.toISOString(), end: nEnd.toISOString() });
    }

    // TOU peak: M-F only (0=Sun, 6=Sat)
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      const month = d.getMonth(); // 0-indexed
      let peakStart, peakEnd;
      if (month >= 4 && month <= 8) {
        // May-Sep: 2-7pm
        peakStart = new Date(d); peakStart.setHours(14, 0, 0, 0);
        peakEnd = new Date(d); peakEnd.setHours(19, 0, 0, 0);
      } else {
        // Oct-Apr: 5-9pm
        peakStart = new Date(d); peakStart.setHours(17, 0, 0, 0);
        peakEnd = new Date(d); peakEnd.setHours(21, 0, 0, 0);
      }
      const pStart = peakStart < start ? start : peakStart;
      const pEnd = peakEnd > now ? now : peakEnd;
      if (pStart < pEnd) {
        peaks.push({ start: pStart.toISOString(), end: pEnd.toISOString() });
      }
    }

    d.setDate(d.getDate() + 1);
  }
  return { nights, peaks };
}

export default (manager) => {
  /**
   * @openapi
   * /plots/hvac:
   *   get:
   *     tags: [Plots]
   *     summary: Temperature + duty cycle data for HVAC plot
   *     parameters:
   *       - name: days
   *         in: query
   *         schema:
   *           type: integer
   *           default: 7
   *     responses:
   *       200:
   *         description: Plot data grouped by series
   */
  router.get("/hvac", asyncHandler(async (req, res) => {
    const days = Math.min(Number(req.query.days) || 7, 30);
    // Brent's Office (14), Rachel's Office (15), Back Porch (16), Kitchen thermostat (6)
    const tempNodes = [14, 15, 16, 6];
    const temps = await getPlotData(tempNodes, ["Air temperature"], days);

    // Thermostat operating state (CC 66) and mode (CC 64) and fan mode (CC 68)
    const stateData = await getPlotData([6], ["state", "mode"], days);

    // Attic fan (19) binary switch
    const atticFanData = await getPlotData([19], ["currentValue"], days);

    const devices = await getAllDevices();
    const deviceMap = Object.fromEntries(devices.map((d) => [d.node_id, d]));

    const thresholds = {};
    try {
      const node = manager.getDriver().controller.nodes.get(6);
      if (node) {
        const heat = node.getValue({ commandClass: 0x43, property: "setpoint", propertyKey: 1 });
        const cool = node.getValue({ commandClass: 0x43, property: "setpoint", propertyKey: 2 });
        if (heat != null) thresholds.heatBelow = heat;
        if (cool != null) thresholds.coolAbove = cool;
      }
    } catch {};

    const bands = computeBands(days);

    res.json({
      thresholds,
      bands,
      temps: temps.map((r) => ({
        nodeId: r.node_id,
        time: r.time,
        value: r.value,
        name: deviceMap[r.node_id]?.name || `Node ${r.node_id}`,
      })),
      states: stateData
        .filter((r) => r.command_class === 66)
        .map((r) => ({ time: r.time, value: r.value })),
      modes: stateData
        .filter((r) => r.command_class === 64)
        .map((r) => ({ time: r.time, value: r.value })),
      fanModes: stateData
        .filter((r) => r.command_class === 68)
        .map((r) => ({ time: r.time, value: r.value })),
      atticFan: atticFanData.map((r) => ({ time: r.time, value: r.value })),
    });
  }));

  /**
   * @openapi
   * /plots/coop:
   *   get:
   *     tags: [Plots]
   *     summary: Temperature + heater duty cycle data for coop plot
   *     parameters:
   *       - name: days
   *         in: query
   *         schema:
   *           type: integer
   *           default: 7
   *     responses:
   *       200:
   *         description: Plot data grouped by series
   */
  router.get("/coop", asyncHandler(async (req, res) => {
    const days = Math.min(Number(req.query.days) || 7, 30);
    // Coop Temp (2), Back Porch / outside (16)
    const temps = await getPlotData([2, 16], ["Air temperature"], days);

    // Coop Heater (13) binary switch state
    const heater = await getPlotData([13], ["currentValue"], days);

    const devices = await getAllDevices();
    const deviceMap = Object.fromEntries(devices.map((d) => [d.node_id, d]));

    const bands = computeBands(days);

    res.json({
      bands,
      temps: temps.map((r) => ({
        nodeId: r.node_id,
        time: r.time,
        value: r.value,
        name: deviceMap[r.node_id]?.name || `Node ${r.node_id}`,
      })),
      heater: heater.map((r) => ({ time: r.time, value: r.value })),
    });
  }));

  return router;
};
