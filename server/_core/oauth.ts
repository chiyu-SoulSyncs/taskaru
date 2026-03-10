import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

function getCallbackUrl() {
  return `${ENV.appUrl}/api/oauth/callback`;
}

export function registerOAuthRoutes(app: Express) {
  // Redirect to Google OAuth
  app.get("/api/oauth/google", (_req: Request, res: Response) => {
    if (!ENV.googleClientId) {
      res.status(500).json({ error: "Google OAuth is not configured" });
      return;
    }

    const params = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: getCallbackUrl(),
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });

    res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
  });

  // OAuth callback
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;

    if (!code) {
      res.status(400).json({ error: "Authorization code is required" });
      return;
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: getCallbackUrl(),
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const detail = await tokenResponse.text().catch(() => "");
        console.error("[OAuth] Token exchange failed:", detail);
        res.status(500).json({ error: "Token exchange failed" });
        return;
      }

      const tokens = (await tokenResponse.json()) as {
        access_token: string;
        id_token?: string;
      };

      // Get user info from Google
      const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        res.status(500).json({ error: "Failed to get user info" });
        return;
      }

      const googleUser = (await userInfoResponse.json()) as {
        id: string;
        email?: string;
        name?: string;
        picture?: string;
      };

      const openId = `google:${googleUser.id}`;

      // Upsert user
      await db.upsertUser({
        openId,
        name: googleUser.name || null,
        email: googleUser.email ?? null,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      const user = await db.getUserByOpenId(openId);
      if (!user) {
        res.status(500).json({ error: "User creation failed" });
        return;
      }

      // Create session token
      const sessionToken = await sdk.createSessionToken(
        {
          userId: user.id,
          openId: user.openId,
          name: user.name || "",
        },
        { expiresInMs: ONE_YEAR_MS }
      );

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
