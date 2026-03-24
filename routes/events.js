import { Router } from "express";
import { getEventLog } from "../lib/helpers.js";

const router = Router();

export default () => {
  /**
   * @openapi
   * /events:
   *   get:
   *     tags: [Events]
   *     summary: Get recent event log entries
   *     parameters:
   *       - name: since
   *         in: query
   *         description: ISO timestamp — only return events after this time
   *         schema:
   *           type: string
   *       - name: source
   *         in: query
   *         description: Filter by source (driver, controller, node)
   *         schema:
   *           type: string
   *       - name: event
   *         in: query
   *         description: Filter by event name (e.g. "dead", "value updated")
   *         schema:
   *           type: string
   *       - name: limit
   *         in: query
   *         description: Max entries to return (default 200)
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Array of event log entries
   */
  router.get("/", (req, res) => {
    const { since, source, event, limit } = req.query;
    res.json(getEventLog({
      since,
      source,
      event,
      limit: limit ? Number(limit) : undefined,
    }));
  });

  return router;
};
