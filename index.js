import { Driver } from "zwave-js";
import express from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { wireDriverEvents } from "./lib/events.js";

import driverRoutes from "./routes/driver.js";
import controllerRoutes from "./routes/controller.js";
import smartstartRoutes from "./routes/smartstart.js";
import associationRoutes from "./routes/associations.js";
import routingRoutes from "./routes/routing.js";
import rfRoutes from "./routes/rf.js";
import nvmRoutes from "./routes/nvm.js";
import firmwareRoutes from "./routes/firmware.js";
import nodeRoutes from "./routes/nodes.js";
import eventRoutes from "./routes/events.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const SERIAL_PORT = process.env.SERIAL_PORT || "/dev/ttyUSB0";

// ─── Driver Setup ────────────────────────────────────────────────────────────

const driver = new Driver(SERIAL_PORT, {
  logConfig: { enabled: true, level: "warn" },
});

driver.on("error", (err) => {
  console.error(`[driver error] ${err.message}`);
});

// ─── Express + Swagger Setup ─────────────────────────────────────────────────

const app = express();
app.use(express.json());

const __dirname = dirname(fileURLToPath(import.meta.url));

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "KoldenHome Z-Wave API",
      version: "0.1.0",
      description: "1:1 REST proxy to the zwave-js driver",
    },
  },
  apis: [join(__dirname, "routes", "*.js")],
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/openapi.json", (_req, res) => res.json(swaggerSpec));

// ─── Mount Routes ────────────────────────────────────────────────────────────

app.use("/driver", driverRoutes(driver));
app.use("/controller", controllerRoutes(driver));
app.use("/controller/provisioning", smartstartRoutes(driver));
app.use("/controller/nodes", associationRoutes(driver));
app.use("/controller/routes", routingRoutes(driver));
app.use("/controller/rf", rfRoutes(driver));
app.use("/controller/nvm", nvmRoutes(driver));
app.use("/controller/firmware-updates", firmwareRoutes(driver));
app.use("/nodes", nodeRoutes(driver));
app.use("/events", eventRoutes());

// ─── Error Handler ───────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error("[api error]", err);
  res.status(500).json({ error: err.message });
});

// ─── Start ───────────────────────────────────────────────────────────────────

const startServer = async () => {
  wireDriverEvents(driver);

  await driver.start();

  app.listen(PORT, () => {
    console.log(`KoldenHome Z-Wave API listening on http://localhost:${PORT}`);
    console.log(`Swagger UI at http://localhost:${PORT}/docs`);
    console.log(`OpenAPI spec at http://localhost:${PORT}/openapi.json`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

const shutdown = async () => {
  console.log("Shutting down...");
  await driver.destroy();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
