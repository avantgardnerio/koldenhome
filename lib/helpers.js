export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const getNode = (driver, req, res) => {
  const id = Number(req.params.id);
  const node = driver.controller.nodes.get(id);
  if (!node) {
    res.status(404).json({ error: `Node ${id} not found` });
    return null;
  }
  return node;
};

export const serializeNode = (node) => ({
  id: node.id,
  name: node.name,
  location: node.location,
  status: node.status,
  ready: node.ready,
  interviewStage: node.interviewStage,
  deviceClass: node.deviceClass ? {
    basic: node.deviceClass.basic,
    generic: node.deviceClass.generic,
    specific: node.deviceClass.specific,
  } : null,
  isListening: node.isListening,
  isFrequentListening: node.isFrequentListening,
  isRouting: node.isRouting,
  supportedDataRates: node.supportedDataRates,
  protocolVersion: node.protocolVersion,
  nodeType: node.nodeType,
  endpointCount: node.getEndpointCount?.() ?? 0,
  lastSeen: node.lastSeen,
  hasSUCReturnRoute: node.hasSUCReturnRoute,
  firmwareVersion: node.firmwareVersion,
  manufacturerId: node.manufacturerId,
  productType: node.productType,
  productId: node.productId,
});

export const serializeNodeDetail = (node) => ({
  ...serializeNode(node),
  values: node.getDefinedValueIDs?.().map((vid) => ({
    ...vid,
    value: node.getValue(vid),
    metadata: node.getValueMetadata(vid),
    timestamp: node.getValueTimestamp(vid),
  })) ?? [],
});

const MAX_LOG_ENTRIES = 10000;
const eventLog = [];

export const logEvent = (source, event, data = {}) => {
  const entry = { ts: new Date().toISOString(), source, event, ...data };
  eventLog.push(entry);
  if (eventLog.length > MAX_LOG_ENTRIES) {
    eventLog.splice(0, eventLog.length - MAX_LOG_ENTRIES);
  }
  console.log(JSON.stringify(entry));
};

export const getEventLog = ({ since, source, event, limit = 200 } = {}) => {
  let results = eventLog;
  if (since) {
    results = results.filter((e) => e.ts > since);
  }
  if (source) {
    results = results.filter((e) => e.source === source);
  }
  if (event) {
    results = results.filter((e) => e.event === event);
  }
  return results.slice(-limit);
};
