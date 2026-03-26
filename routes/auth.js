import { Router } from "express";
import { asyncHandler } from "../lib/helpers.js";
import { isLocalRequest, requireLocal, getAuthConfig, getOAuth2Client } from "../lib/auth.js";
import {
  findUserByGoogleId,
  createUser,
  updateUserLogin,
  getAllUsers,
  setUserRole,
} from "../lib/db.js";

const router = Router();

export default () => {
  /**
   * @openapi
   * /auth/me:
   *   get:
   *     tags: [Auth]
   *     summary: Get current auth state
   *     responses:
   *       200:
   *         description: Auth state
   */
  router.get("/me", (req, res) => {
    const local = isLocalRequest(req);
    if (local) {
      return res.json({ authenticated: true, local: true, user: null });
    }
    if (req.session?.userId) {
      const { role } = req.session;
      if (role === "pending") {
        return res.json({ authenticated: false, local: false, pending: true, user: { email: req.session.email } });
      }
      return res.json({
        authenticated: true,
        local: false,
        user: {
          id: req.session.userId,
          email: req.session.email,
          name: req.session.name,
          picture: req.session.picture,
        },
      });
    }
    const config = getAuthConfig();
    res.json({
      authenticated: false,
      local: false,
      googleConfigured: !!(config?.google.clientId),
    });
  });

  /**
   * @openapi
   * /auth/google:
   *   get:
   *     tags: [Auth]
   *     summary: Redirect to Google consent screen
   *     responses:
   *       302:
   *         description: Redirect to Google
   */
  router.get("/google", (req, res) => {
    const config = getAuthConfig();
    const client = getOAuth2Client();
    if (!client) {
      return res.status(503).json({ error: "Google OAuth not configured. Set google.client_id and google.client_secret in config table." });
    }

    const protocol = req.get("x-forwarded-proto") || req.protocol;
    const host = req.get("host");
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      redirect_uri: redirectUri,
    });
    res.redirect(url);
  });

  /**
   * @openapi
   * /auth/google/callback:
   *   get:
   *     tags: [Auth]
   *     summary: Google OAuth callback
   *     responses:
   *       302:
   *         description: Redirect to app
   */
  router.get("/google/callback", asyncHandler(async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: "Missing code parameter" });

    const client = getOAuth2Client();
    if (!client) return res.status(503).json({ error: "Google OAuth not configured" });

    const protocol = req.get("x-forwarded-proto") || req.protocol;
    const host = req.get("host");
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

    const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: getAuthConfig().google.clientId,
    });
    const payload = ticket.getPayload();

    let user = await findUserByGoogleId(payload.sub);
    if (user) {
      user = await updateUserLogin(user.id, {
        name: payload.name,
        picture: payload.picture,
      });
    } else {
      user = await createUser({
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      });
    }

    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.name = user.name;
    req.session.picture = user.picture;
    req.session.role = user.role;

    res.redirect("/");
  }));

  /**
   * @openapi
   * /auth/logout:
   *   post:
   *     tags: [Auth]
   *     summary: Destroy session
   *     responses:
   *       200:
   *         description: Logged out
   */
  router.post("/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: "Failed to logout" });
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  /**
   * @openapi
   * /auth/users:
   *   get:
   *     tags: [Auth - Admin]
   *     summary: List all users (localhost only)
   *     responses:
   *       200:
   *         description: Array of users
   */
  router.get("/users", requireLocal, asyncHandler(async (_req, res) => {
    const users = await getAllUsers();
    res.json(users);
  }));

  /**
   * @openapi
   * /auth/users/{id}/role:
   *   put:
   *     tags: [Auth - Admin]
   *     summary: Set user role (localhost only)
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
   *             required: [role]
   *             properties:
   *               role:
   *                 type: string
   *                 enum: [pending, user]
   *     responses:
   *       200:
   *         description: Updated user
   */
  router.put("/users/:id/role", requireLocal, asyncHandler(async (req, res) => {
    const { role } = req.body;
    if (!role || !["pending", "user"].includes(role)) {
      return res.status(400).json({ error: "Role must be 'pending' or 'user'" });
    }
    const user = await setUserRole(Number(req.params.id), role);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  }));

  return router;
};
