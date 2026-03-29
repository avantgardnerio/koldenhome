import crypto from "crypto";
import { Driver } from "zwave-js";
import { Bytes } from "@zwave-js/shared/safe";
import { wireDriverEvents } from "./events.js";
import { getConfig, setConfig, getConfigByPrefix } from "./db.js";

const KEY_NAMES = [
  "S2_Unauthenticated",
  "S2_Authenticated",
  "S2_AccessControl",
  "S0_Legacy",
];

const LR_KEY_NAMES = [
  "S2_Authenticated",
  "S2_AccessControl",
];

const KEY_PREFIX = "security_key.";
const LR_KEY_PREFIX = "security_key_lr.";

const hexToBytes = (hex) => Bytes.from(hex, "hex");

export function createDriverManager({ serialPort, logConfig }) {
  let driver = null;
  let self = null;
  const securityKeys = {};
  const securityKeysLR = {};

  const buildDriverOptions = () => {
    const opts = { logConfig };
    const keyMap = {};
    for (const name of KEY_NAMES) {
      if (securityKeys[name]) {
        keyMap[name] = hexToBytes(securityKeys[name]);
      }
    }
    if (Object.keys(keyMap).length > 0) {
      opts.securityKeys = keyMap;
    }
    const lrKeyMap = {};
    for (const name of LR_KEY_NAMES) {
      if (securityKeysLR[name]) {
        lrKeyMap[name] = hexToBytes(securityKeysLR[name]);
      }
    }
    if (Object.keys(lrKeyMap).length > 0) {
      opts.securityKeysLongRange = lrKeyMap;
    }
    return opts;
  };

  const loadSecurityKeys = async () => {
    const rows = await getConfigByPrefix(KEY_PREFIX);
    for (const name of KEY_NAMES) {
      const val = rows[KEY_PREFIX + name];
      if (val) securityKeys[name] = val;
    }
    const lrRows = await getConfigByPrefix(LR_KEY_PREFIX);
    for (const name of LR_KEY_NAMES) {
      const val = lrRows[LR_KEY_PREFIX + name];
      if (val) securityKeysLR[name] = val;
    }
  };

  const persistSecurityKeys = async () => {
    for (const name of KEY_NAMES) {
      if (securityKeys[name]) {
        await setConfig(KEY_PREFIX + name, securityKeys[name]);
      }
    }
    for (const name of LR_KEY_NAMES) {
      if (securityKeysLR[name]) {
        await setConfig(LR_KEY_PREFIX + name, securityKeysLR[name]);
      }
    }
  };

  const getDriver = () => {
    if (!driver) throw new Error("Driver not initialized");
    return driver;
  };

  const start = async () => {
    await loadSecurityKeys();
    driver = new Driver(serialPort, buildDriverOptions());
    driver.on("error", (err) => {
      console.error(`[driver error] ${err.message}`);
    });
    wireDriverEvents(driver, self);
    await driver.start();
  };

  const restart = async () => {
    if (driver) {
      await driver.destroy();
      driver = null;
    }
    await start();
  };

  const shutdown = async () => {
    if (driver) {
      await driver.destroy();
      driver = null;
    }
  };

  const getSecurityKeys = () => ({
    standard: { ...securityKeys },
    longRange: { ...securityKeysLR },
  });

  const setSecurityKeys = async (keys) => {
    const { longRange = {}, ...standard } = keys;
    for (const name of KEY_NAMES) {
      if (standard[name] !== undefined) {
        securityKeys[name] = standard[name];
      } else if (!securityKeys[name]) {
        securityKeys[name] = crypto.randomBytes(16).toString("hex");
      }
    }
    for (const name of LR_KEY_NAMES) {
      if (longRange[name] !== undefined) {
        securityKeysLR[name] = longRange[name];
      } else if (!securityKeysLR[name]) {
        securityKeysLR[name] = crypto.randomBytes(16).toString("hex");
      }
    }
    await persistSecurityKeys();
    return getSecurityKeys();
  };

  self = { getDriver, start, restart, shutdown, getSecurityKeys, setSecurityKeys };
  return self;
}
