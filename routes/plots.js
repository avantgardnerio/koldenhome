import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";
import { getPlotData, getAllDevices } from "../lib/db.js";

const router = Router();

export default () => {
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

    const devices = await getAllDevices();
    const deviceMap = Object.fromEntries(devices.map((d) => [d.node_id, d]));

    res.json({
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

    res.json({
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
