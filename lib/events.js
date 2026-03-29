import { logEvent } from "./helpers.js";
import { insertEvent } from "./db.js";
import { loadPlugins, getPluginInstances } from "./plugins.js";

const persistValue = (nodeId, args) => {
  const prop = args.propertyName + (args.propertyKeyName ? `.${args.propertyKeyName}` : "");
  insertEvent(nodeId, prop, args.newValue ?? args.value ?? null).catch((err) => {
    console.error(`[db] failed to persist event: ${err.message}`);
  });
};

export const wireNodeEvents = (node) => {
  node.on("value added", (_node, args) => logEvent("node", "value added", { nodeId: node.id, ...args }));
  node.on("value updated", (_node, args) => {
    logEvent("node", "value updated", { nodeId: node.id, ...args });
    persistValue(node.id, args);
    for (const { instance, name } of getPluginInstances()) {
      try { instance.valueUpdated(node, args); } catch (err) {
        console.error(`[plugins] error in "${name}": ${err.message}`);
      }
    }
  });
  node.on("value removed", (_node, args) => logEvent("node", "value removed", { nodeId: node.id, ...args }));
  node.on("value notification", (_node, args) => logEvent("node", "value notification", { nodeId: node.id, ...args }));
  node.on("metadata updated", (_node, args) => logEvent("node", "metadata updated", { nodeId: node.id, ...args }));
  node.on("notification", (endpoint, ccId, args) => logEvent("node", "notification", { nodeId: node.id, endpoint: endpoint.index, ccId, ...args }));
  node.on("wake up", () => logEvent("node", "wake up", { nodeId: node.id }));
  node.on("sleep", () => logEvent("node", "sleep", { nodeId: node.id }));
  node.on("dead", () => logEvent("node", "dead", { nodeId: node.id }));
  node.on("alive", () => logEvent("node", "alive", { nodeId: node.id }));
  node.on("interview completed", () => logEvent("node", "interview completed", { nodeId: node.id }));
  node.on("interview failed", (_node, args) => logEvent("node", "interview failed", { nodeId: node.id, ...args }));
  node.on("interview started", () => logEvent("node", "interview started", { nodeId: node.id }));
  node.on("interview stage completed", (_node, stage) => logEvent("node", "interview stage completed", { nodeId: node.id, stage }));
  node.on("ready", () => logEvent("node", "ready", { nodeId: node.id }));
  node.on("firmware update progress", (_node, progress) => logEvent("node", "firmware update progress", { nodeId: node.id, ...progress }));
  node.on("firmware update finished", (_node, result) => logEvent("node", "firmware update finished", { nodeId: node.id, ...result }));
  node.on("statistics updated", (_node, stats) => logEvent("node", "statistics", { nodeId: node.id, ...stats }));
};

export const wireDriverEvents = (driver, manager) => {
  driver.on("driver ready", () => {
    logEvent("driver", "ready");

    const ctrl = driver.controller;

    ctrl.on("inclusion started", (strategy) => logEvent("controller", "inclusion started", { strategy }));
    ctrl.on("inclusion stopped", () => logEvent("controller", "inclusion stopped"));
    ctrl.on("inclusion failed", () => logEvent("controller", "inclusion failed"));
    ctrl.on("exclusion started", () => logEvent("controller", "exclusion started"));
    ctrl.on("exclusion stopped", () => logEvent("controller", "exclusion stopped"));
    ctrl.on("exclusion failed", () => logEvent("controller", "exclusion failed"));
    ctrl.on("inclusion state changed", (state) => logEvent("controller", "inclusion state changed", { state }));
    ctrl.on("node found", (node) => logEvent("controller", "node found", { nodeId: node.id }));
    ctrl.on("node added", (node, result) => logEvent("controller", "node added", { nodeId: node.id, result }));
    ctrl.on("node removed", (node, reason) => logEvent("controller", "node removed", { nodeId: node.id, reason }));
    ctrl.on("rebuild routes progress", (progress) => {
      const map = {};
      for (const [id, status] of progress) map[id] = status;
      logEvent("controller", "rebuild routes progress", map);
    });
    ctrl.on("rebuild routes done", (result) => {
      const map = {};
      for (const [id, status] of result) map[id] = status;
      logEvent("controller", "rebuild routes done", map);
    });
    ctrl.on("status changed", (status) => logEvent("controller", "status changed", { status }));
    ctrl.on("statistics updated", (stats) => logEvent("controller", "statistics", stats));

    for (const [, node] of ctrl.nodes) {
      wireNodeEvents(node);
    }

    loadPlugins(manager).catch((err) => {
      console.error(`[plugins] failed to load: ${err.message}`);
    });
  });

  driver.on("all nodes ready", () => logEvent("driver", "all nodes ready"));
  driver.on("node added", (node) => wireNodeEvents(node));
};
