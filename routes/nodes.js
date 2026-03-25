import { Router } from "express";
import { asyncHandler, getNode, serializeNode, logEvent } from "../lib/helpers.js";
import { getDevice, getAllDevices, upsertDevice } from "../lib/db.js";

const router = Router();

export default (manager) => {
  const nodeOrBail = (req, res) => getNode(manager.getDriver(), req, res);

  // ─── List / Info ───────────────────────────────────────────────────────

  /**
   * @openapi
   * /nodes:
   *   get:
   *     tags: [Nodes]
   *     summary: List all nodes
   *     responses:
   *       200:
   *         description: Array of node info
   */
  router.get("/", asyncHandler(async (_req, res) => {
    const nodes = [...manager.getDriver().controller.nodes.values()].map(serializeNode);
    const devices = await getAllDevices();
    const deviceMap = Object.fromEntries(devices.map((d) => [d.node_id, d]));
    const merged = nodes.map((n) => {
      const d = deviceMap[n.id];
      return { ...n, name: d?.name ?? n.name, location: d?.location ?? n.location, notes: d?.notes ?? null };
    });
    res.json(merged);
  }));

  /**
   * @openapi
   * /nodes/{id}:
   *   get:
   *     tags: [Nodes]
   *     summary: Get node info
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Node information
   *       404:
   *         description: Node not found
   */
  router.get("/:id", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    res.json(serializeNode(node));
  });

  /**
   * @openapi
   * /nodes/{id}/metadata:
   *   get:
   *     tags: [Nodes]
   *     summary: Get device metadata from database
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Device metadata
   */
  router.get("/:id/metadata", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const device = await getDevice(node.id);
    res.json(device ?? { node_id: node.id, name: null, location: null, notes: null });
  }));

  /**
   * @openapi
   * /nodes/{id}/metadata:
   *   put:
   *     tags: [Nodes]
   *     summary: Set device metadata (name, location, notes)
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               location:
   *                 type: string
   *               notes:
   *                 type: string
   *     responses:
   *       200:
   *         description: Metadata updated
   */
  router.put("/:id/metadata", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    await upsertDevice(node.id, req.body);
    const device = await getDevice(node.id);
    res.json(device);
  }));

  /**
   * @openapi
   * /nodes/{id}/dump:
   *   get:
   *     tags: [Nodes]
   *     summary: Get a full debug dump of a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Full node dump
   */
  router.get("/:id/dump", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    res.json(node.createDump());
  });

  // ─── Values ────────────────────────────────────────────────────────────

  /**
   * @openapi
   * /nodes/{id}/values:
   *   get:
   *     tags: [Nodes - Values]
   *     summary: Get all defined value IDs for a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Array of value IDs with their current values and metadata
   */
  router.get("/:id/values", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const valueIds = node.getDefinedValueIDs();
    const values = valueIds.map((vid) => ({
      ...vid,
      value: node.getValue(vid),
      metadata: node.getValueMetadata(vid),
      timestamp: node.getValueTimestamp(vid),
    }));
    res.json(values);
  });

  /**
   * @openapi
   * /nodes/{id}/values/get:
   *   post:
   *     tags: [Nodes - Values]
   *     summary: Get a specific cached value
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [commandClass, property]
   *             properties:
   *               commandClass:
   *                 type: integer
   *               property:
   *                 type: string
   *               propertyKey:
   *                 type: string
   *               endpoint:
   *                 type: integer
   *     responses:
   *       200:
   *         description: The value, metadata, and timestamp
   */
  router.post("/:id/values/get", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const vid = req.body;
    res.json({
      value: node.getValue(vid),
      metadata: node.getValueMetadata(vid),
      timestamp: node.getValueTimestamp(vid),
    });
  });

  /**
   * @openapi
   * /nodes/{id}/values/set:
   *   post:
   *     tags: [Nodes - Values]
   *     summary: Set a value on the node (communicates with the device)
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [commandClass, property, value]
   *             properties:
   *               commandClass:
   *                 type: integer
   *               property:
   *                 type: string
   *               propertyKey:
   *                 type: string
   *               endpoint:
   *                 type: integer
   *               value: {}
   *               options:
   *                 type: object
   *     responses:
   *       200:
   *         description: Set result
   */
  router.post("/:id/values/set", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const { value, options, ...valueId } = req.body;
    const result = await node.setValue(valueId, value, options);
    res.json(result);
  }));

  /**
   * @openapi
   * /nodes/{id}/values/poll:
   *   post:
   *     tags: [Nodes - Values]
   *     summary: Poll a value from the node (requests fresh value)
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [commandClass, property]
   *             properties:
   *               commandClass:
   *                 type: integer
   *               property:
   *                 type: string
   *               propertyKey:
   *                 type: string
   *               endpoint:
   *                 type: integer
   *     responses:
   *       200:
   *         description: The polled value
   */
  router.post("/:id/values/poll", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const value = await node.pollValue(req.body);
    res.json({ value });
  }));

  // ─── Ping / Interview / Refresh ────────────────────────────────────────

  /**
   * @openapi
   * /nodes/{id}/ping:
   *   post:
   *     tags: [Nodes]
   *     summary: Ping a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether the node responded
   */
  router.post("/:id/ping", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const responded = await node.ping();
    res.json({ responded });
  }));

  /**
   * @openapi
   * /nodes/{id}/interview:
   *   post:
   *     tags: [Nodes]
   *     summary: Start or resume deferred interview
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Interview started (runs async, does not wait for completion)
   */
  router.post("/:id/interview", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    node.interview().catch((err) => {
      logEvent("node", "interview-error", { nodeId: node.id, error: err.message });
    });
    res.json({ ok: true, message: "Interview started in background" });
  });

  /**
   * @openapi
   * /nodes/{id}/refresh-info:
   *   post:
   *     tags: [Nodes]
   *     summary: Reset node info and force fresh interview
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               resetSecurityClasses:
   *                 type: boolean
   *               waitForWakeup:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Refresh started (runs async)
   */
  router.post("/:id/refresh-info", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    node.refreshInfo(req.body).catch((err) => {
      logEvent("node", "refresh-info-error", { nodeId: node.id, error: err.message });
    });
    res.json({ ok: true, message: "Refresh started in background" });
  });

  /**
   * @openapi
   * /nodes/{id}/refresh-values:
   *   post:
   *     tags: [Nodes]
   *     summary: Refresh all non-static values from actuator and sensor CCs
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Refresh started (runs async)
   */
  router.post("/:id/refresh-values", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    node.refreshValues().catch((err) => {
      logEvent("node", "refresh-values-error", { nodeId: node.id, error: err.message });
    });
    res.json({ ok: true, message: "Value refresh started in background" });
  });

  // ─── Health Checks ─────────────────────────────────────────────────────

  /**
   * @openapi
   * /nodes/{id}/health/lifeline:
   *   post:
   *     tags: [Nodes - Health]
   *     summary: Check lifeline health (controller <-> node)
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               rounds:
   *                 type: integer
   *                 default: 5
   *     responses:
   *       200:
   *         description: Health check summary
   */
  router.post("/:id/health/lifeline", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const rounds = req.body?.rounds ?? 5;
    const summary = await node.checkLifelineHealth(rounds);
    res.json(summary);
  }));

  /**
   * @openapi
   * /nodes/{id}/health/route:
   *   post:
   *     tags: [Nodes - Health]
   *     summary: Check route health (node <-> target node)
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [targetNodeId]
   *             properties:
   *               targetNodeId:
   *                 type: integer
   *               rounds:
   *                 type: integer
   *                 default: 5
   *     responses:
   *       200:
   *         description: Route health check summary
   */
  router.post("/:id/health/route", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const { targetNodeId, rounds = 5 } = req.body;
    const summary = await node.checkRouteHealth(targetNodeId, rounds);
    res.json(summary);
  }));

  /**
   * @openapi
   * /nodes/{id}/health/abort:
   *   post:
   *     tags: [Nodes - Health]
   *     summary: Abort ongoing health check
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Abort requested
   */
  router.post("/:id/health/abort", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    node.abortHealthCheck();
    res.json({ ok: true });
  });

  // ─── Firmware ──────────────────────────────────────────────────────────

  /**
   * @openapi
   * /nodes/{id}/firmware/capabilities:
   *   get:
   *     tags: [Nodes - Firmware]
   *     summary: Get firmware update capabilities (cached)
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Firmware update capabilities
   */
  router.get("/:id/firmware/capabilities", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    res.json(node.getFirmwareUpdateCapabilitiesCached());
  });

  /**
   * @openapi
   * /nodes/{id}/firmware/capabilities/fresh:
   *   get:
   *     tags: [Nodes - Firmware]
   *     summary: Get firmware update capabilities (queries node)
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Firmware update capabilities
   */
  router.get("/:id/firmware/capabilities/fresh", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const caps = await node.getFirmwareUpdateCapabilities();
    res.json(caps);
  }));

  /**
   * @openapi
   * /nodes/{id}/firmware/abort:
   *   post:
   *     tags: [Nodes - Firmware]
   *     summary: Abort firmware update in progress
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Abort requested
   */
  router.post("/:id/firmware/abort", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    await node.abortFirmwareUpdate();
    res.json({ ok: true });
  }));

  // ─── Date/Time ─────────────────────────────────────────────────────────

  /**
   * @openapi
   * /nodes/{id}/date-time:
   *   get:
   *     tags: [Nodes]
   *     summary: Get date/time from node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Date and time info
   */
  router.get("/:id/date-time", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const dt = await node.getDateAndTime();
    res.json(dt);
  }));

  /**
   * @openapi
   * /nodes/{id}/date-time:
   *   post:
   *     tags: [Nodes]
   *     summary: Set date/time on node (uses current time if none provided)
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether setting succeeded
   */
  router.post("/:id/date-time", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const success = await node.setDateAndTime();
    res.json({ success });
  }));

  // ─── Notifications ─────────────────────────────────────────────────────

  /**
   * @openapi
   * /nodes/{id}/notifications:
   *   get:
   *     tags: [Nodes]
   *     summary: Get supported notification events for a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Supported notification capabilities
   */
  router.get("/:id/notifications", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    res.json(node.getSupportedNotificationEvents());
  });

  // ─── Endpoints (multi-channel) ─────────────────────────────────────────

  /**
   * @openapi
   * /nodes/{id}/endpoints:
   *   get:
   *     tags: [Nodes - Endpoints]
   *     summary: List endpoints for a node
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Array of endpoint info
   */
  router.get("/:id/endpoints", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const count = node.getEndpointCount?.() ?? 0;
    const endpoints = [];
    for (let i = 0; i <= count; i++) {
      const ep = node.getEndpoint(i);
      if (ep) {
        const ccs = [];
        for (const [ccId, info] of ep.getCCs()) {
          ccs.push({ ccId, ...info });
        }
        endpoints.push({
          index: ep.index,
          deviceClass: ep.deviceClass ? {
            basic: ep.deviceClass.basic,
            generic: ep.deviceClass.generic,
            specific: ep.deviceClass.specific,
          } : null,
          endpointLabel: ep.endpointLabel,
          installerIcon: ep.installerIcon,
          userIcon: ep.userIcon,
          commandClasses: ccs,
        });
      }
    }
    res.json(endpoints);
  });

  /**
   * @openapi
   * /nodes/{id}/endpoints/{endpointIndex}/cc/{ccId}/invoke:
   *   post:
   *     tags: [Nodes - Endpoints]
   *     summary: Invoke a CC API method on a specific endpoint
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *       - name: endpointIndex
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *       - name: ccId
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [method]
   *             properties:
   *               method:
   *                 type: string
   *               args:
   *                 type: array
   *     responses:
   *       200:
   *         description: Method result
   */
  router.post("/:id/endpoints/:endpointIndex/cc/:ccId/invoke", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const ep = node.getEndpoint(Number(req.params.endpointIndex));
    if (!ep) {
      return res.status(404).json({ error: `Endpoint ${req.params.endpointIndex} not found` });
    }
    const ccId = Number(req.params.ccId);
    const { method, args = [] } = req.body;
    const result = await ep.invokeCCAPI(ccId, method, ...args);
    res.json({ result });
  }));

  // ─── Command Classes (root endpoint shortcut) ──────────────────────────

  /**
   * @openapi
   * /nodes/{id}/cc/{ccId}/invoke:
   *   post:
   *     tags: [Nodes - Command Classes]
   *     summary: Invoke a CC API method on the root endpoint
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *       - name: ccId
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [method]
   *             properties:
   *               method:
   *                 type: string
   *               args:
   *                 type: array
   *     responses:
   *       200:
   *         description: Method result
   */
  router.post("/:id/cc/:ccId/invoke", asyncHandler(async (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const ccId = Number(req.params.ccId);
    const { method, args = [] } = req.body;
    const result = await node.invokeCCAPI(ccId, method, ...args);
    res.json({ result });
  }));

  /**
   * @openapi
   * /nodes/{id}/cc/{ccId}/supported:
   *   get:
   *     tags: [Nodes - Command Classes]
   *     summary: Check if a CC API is supported on the root endpoint
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *       - name: ccId
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether the CC API is supported
   */
  router.get("/:id/cc/:ccId/supported", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const supported = node.supportsCCAPI(Number(req.params.ccId));
    res.json({ supported });
  });

  /**
   * @openapi
   * /nodes/{id}/cc/{ccId}/version:
   *   get:
   *     tags: [Nodes - Command Classes]
   *     summary: Get the supported version of a CC
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *       - name: ccId
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: CC version (0 if not supported)
   */
  router.get("/:id/cc/:ccId/version", (req, res) => {
    const node = nodeOrBail(req, res);
    if (!node) return;
    const version = node.getCCVersion(Number(req.params.ccId));
    res.json({ version });
  });

  return router;
};
