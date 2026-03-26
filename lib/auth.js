import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { getConfig, setConfig, getConfigByPrefix } from "./db.js";

let oauth2Client = null;
let authConfig = null;

export function isLocalRequest(req) {
  return !req.headers["x-forwarded-for"];
}

export function requireAuth(req, res, next) {
  if (isLocalRequest(req)) return next();
  if (req.session?.userId && (req.session.role === "user" || req.session.role === "admin")) {
    return next();
  }
  res.status(401).json({ error: "Authentication required" });
}

export function requireLocal(req, res, next) {
  if (isLocalRequest(req)) return next();
  res.status(403).json({ error: "Localhost access only" });
}

export async function loadAuthConfig() {
  const googleConfig = await getConfigByPrefix("google.");
  const sessionConfig = await getConfigByPrefix("session.");

  let sessionSecret = sessionConfig["session.secret"];
  if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(32).toString("hex");
    await setConfig("session.secret", sessionSecret);
  }

  authConfig = {
    google: {
      clientId: googleConfig["google.client_id"] || null,
      clientSecret: googleConfig["google.client_secret"] || null,
    },
    session: { secret: sessionSecret },
  };

  if (authConfig.google.clientId && authConfig.google.clientSecret) {
    oauth2Client = new OAuth2Client(
      authConfig.google.clientId,
      authConfig.google.clientSecret,
      "postmessage", // placeholder, overridden per-request
    );
  }

  return authConfig;
}

export function getAuthConfig() {
  return authConfig;
}

export function getOAuth2Client() {
  return oauth2Client;
}
