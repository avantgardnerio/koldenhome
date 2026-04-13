import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";
import { getEnabledCameras } from "../lib/db.js";

const router = Router();

export default () => {
  /**
   * @openapi
   * /cameras:
   *   get:
   *     tags: [Cameras]
   *     summary: List enabled cameras
   *     responses:
   *       200:
   *         description: Array of cameras
   */
  router.get("/", asyncHandler(async (_req, res) => {
    const rows = await getEnabledCameras();
    res.json(rows.map((r) => ({ streamId: r.stream_id, name: r.name })));
  }));

  return router;
};
