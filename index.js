import express from "express";
import morgan from "morgan";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { createDriverManager } from "./lib/driver-manager.js";
import { runMigrations } from "./lib/db.js";

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
import dashboardRoutes from "./routes/dashboard.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const SERIAL_PORT = process.env.SERIAL_PORT || "/dev/ttyUSB0";

// ─── Driver Manager ─────────────────────────────────────────────────────────

const manager = createDriverManager({
  serialPort: SERIAL_PORT,
  logConfig: { enabled: true, level: "warn" },
});

// ─── Express + Swagger Setup ─────────────────────────────────────────────────

const app = express();
app.use(morgan("dev"));
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
    servers: [{ url: "/api" }],
  },
  apis: [join(__dirname, "routes", "*.js")],
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/openapi.json", (_req, res) => res.json(swaggerSpec));

// ─── Static Files ───────────────────────────────────────────────────────────

app.use(express.static(join(__dirname, "public")));
app.use("/node_modules", express.static(join(__dirname, "node_modules")));

// ─── Mount Routes ────────────────────────────────────────────────────────────

app.use("/api/driver", driverRoutes(manager));
app.use("/api/controller", controllerRoutes(manager));
app.use("/api/controller/provisioning", smartstartRoutes(manager));
app.use("/api/controller/nodes", associationRoutes(manager));
app.use("/api/controller/routes", routingRoutes(manager));
app.use("/api/controller/rf", rfRoutes(manager));
app.use("/api/controller/nvm", nvmRoutes(manager));
app.use("/api/controller/firmware-updates", firmwareRoutes(manager));
app.use("/api/nodes", nodeRoutes(manager));
app.use("/api/events", eventRoutes());
app.use("/api/dashboard", dashboardRoutes(manager));

// ─── SPA Catch-All ──────────────────────────────────────────────────────────

app.get("/{*path}", (_req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

// ─── Error Handler ───────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error("[api error]", err);
  res.status(500).json({ error: err.message });
});

// ─── Start ───────────────────────────────────────────────────────────────────

const startServer = async () => {
  await runMigrations();
  console.log("Database migrations complete");

  await manager.start();

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
  await manager.shutdown();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
