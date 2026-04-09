import express from "express";
import morgan from "morgan";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { execSync } from "child_process";
import { createDriverManager } from "./lib/driver-manager.js";
import { runMigrations, pool } from "./lib/db.js";
import { loadAuthConfig, requireAuth, requireLocal } from "./lib/auth.js";
import { createRateLimiter } from "./lib/rate-limit.js";
import { initPush } from "./lib/notify.js";

import authRoutes from "./routes/auth.js";
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
import pushRoutes from "./routes/push.js";
import batteryRoutes from "./routes/battery.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const GIT_SHA = (() => { try { return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { return "unknown"; } })();
const SERIAL_PORT = process.env.SERIAL_PORT || "/dev/ttyUSB0";

// ─── Driver Manager ─────────────────────────────────────────────────────────

const manager = createDriverManager({
  serialPort: SERIAL_PORT,
  logConfig: { enabled: true, level: "warn" },
});

// ─── Start ───────────────────────────────────────────────────────────────────

const startServer = async () => {
  await runMigrations();
  console.log("Database migrations complete");

  await initPush();
  console.log("Web Push configured");

  const authConfig = await loadAuthConfig();
  console.log("Auth config loaded", authConfig.google.clientId ? "(Google OAuth configured)" : "(Google OAuth not configured)");

  // ─── Express Setup ─────────────────────────────────────────────────────

  const app = express();
  app.set("trust proxy", "loopback");
  const __dirname = dirname(fileURLToPath(import.meta.url));

  app.use(morgan(":date[iso] :remote-addr :method :url :status :response-time ms :user-agent"));
  app.use(createRateLimiter());
  app.use(express.json());

  // ─── Session Middleware ────────────────────────────────────────────────

  const PgStore = connectPgSimple(session);
  app.use(session({
    store: new PgStore({ pool, tableName: "sessions" }),
    secret: authConfig.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      sameSite: "lax",
      secure: "auto",
    },
  }));

  // ─── Swagger ───────────────────────────────────────────────────────────

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

  // ─── Static Files ─────────────────────────────────────────────────────

  app.use(express.static(join(__dirname, "public")));
  app.use("/node_modules", express.static(join(__dirname, "node_modules")));

  // ─── Auth Routes (exempt from auth gate) ──────────────────────────────

  app.use("/api/auth", authRoutes());

  // ─── Tier 1: requireAuth on all /api/* ────────────────────────────────

  app.use("/api", (_req, res, next) => { res.set("X-Server-Time", new Date().toISOString()); res.set("X-App-Version", GIT_SHA); next(); });
  app.use("/api", requireAuth);

  // ─── Localhost-only Route Groups (Tier 2) ─────────────────────────────

  app.use("/api/controller/provisioning", requireLocal, smartstartRoutes(manager));
  app.use("/api/controller/nodes", requireLocal, associationRoutes(manager));
  app.use("/api/controller/routes", requireLocal, routingRoutes(manager));
  app.use("/api/controller/rf", requireLocal, rfRoutes(manager));
  app.use("/api/controller/nvm", requireLocal, nvmRoutes(manager));
  app.use("/api/controller/firmware-updates", requireLocal, firmwareRoutes(manager));

  // ─── Safe Route Groups (behind requireAuth from above) ────────────────

  app.use("/api/driver", driverRoutes(manager));
  app.use("/api/controller", controllerRoutes(manager));
  app.use("/api/nodes", nodeRoutes(manager));
  app.use("/api/events", eventRoutes());
  app.use("/api/dashboard", dashboardRoutes(manager));
  app.use("/api/push", pushRoutes());
  app.use("/api/battery", batteryRoutes(manager));

  // ─── SPA Catch-All ────────────────────────────────────────────────────

  app.get("/{*path}", (_req, res) => {
    res.sendFile(join(__dirname, "public", "index.html"));
  });

  // ─── Error Handler ────────────────────────────────────────────────────

  app.use((err, _req, res, _next) => {
    console.error("[api error]", err);
    res.status(500).json({ error: err.message });
  });

  // ─── Start Driver + Listen ────────────────────────────────────────────

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
