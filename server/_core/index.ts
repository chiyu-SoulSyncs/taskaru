import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { lineWebhookRouter } from "../lineWebhook";
import { startScheduler } from "../scheduler";
import helmet from "helmet";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// ─── Rate limiter with sliding window + periodic cleanup ─────────────────────
// Stores per-IP timestamps of requests for accurate sliding window counting.
// Memory is bounded: cleanup runs every 60s removing expired entries,
// and a global IP limit (10,000) prevents memory exhaustion from many unique IPs.
const RATE_LIMIT_MAX_IPS = 10_000;

function createRateLimiter(windowMs: number, maxRequests: number) {
  const hits = new Map<string, number[]>(); // IP -> array of request timestamps

  // Periodic cleanup: remove expired entries every 60 seconds
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const keys = Array.from(hits.keys());
    keys.forEach((key) => {
      const timestamps = hits.get(key);
      if (!timestamps) return;
      const valid = timestamps.filter((t: number) => t > now - windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, valid);
      }
    });
  }, 60_000);
  cleanupInterval.unref(); // Don't prevent process exit

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    // Get existing timestamps and filter to current window
    const existing = hits.get(key) ?? [];
    const valid = existing.filter((t: number) => t > now - windowMs);

    if (valid.length >= maxRequests) {
      const retryAfterMs = valid[0] + windowMs - now;
      res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    valid.push(now);
    hits.set(key, valid);

    // Prevent memory exhaustion from many unique IPs (e.g. DDoS)
    if (hits.size > RATE_LIMIT_MAX_IPS) {
      const toDelete = hits.size - RATE_LIMIT_MAX_IPS;
      let deleted = 0;
      const keys = Array.from(hits.keys());
      for (let i = 0; i < keys.length && deleted < toDelete; i++) {
        hits.delete(keys[i]);
        deleted++;
      }
    }

    next();
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ─── Security headers (helmet) ──────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false, // CSP is handled by Vite in dev
    hsts: ENV.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  }));

  // ─── Trust proxy (Cloud Run, etc.) ──────────────────────────────────────
  app.set("trust proxy", true);

  // ─── Body parser ────────────────────────────────────────────────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // ─── Rate limiting ──────────────────────────────────────────────────────
  app.use("/api/oauth", createRateLimiter(60_000, 10));  // 10 req/min
  app.use("/api/line", createRateLimiter(60_000, 30));    // 30 req/min
  app.use("/api/trpc", createRateLimiter(60_000, 100));   // 100 req/min

  // ─── OAuth routes ───────────────────────────────────────────────────────
  registerOAuthRoutes(app);

  // ─── LINE Webhook ───────────────────────────────────────────────────────
  app.use("/api/line", express.raw({ type: "application/json", limit: "1mb" }), (req: Request, _res: Response, next: NextFunction) => {
    if (Buffer.isBuffer(req.body)) {
      const raw = req.body.toString("utf8");
      (req as Request & { rawBody: string }).rawBody = raw;
      try {
        (req as Request & { body: unknown }).body = JSON.parse(raw || "{}");
      } catch {
        (req as Request & { body: unknown }).body = {};
      }
    }
    next();
  }, lineWebhookRouter);

  // ─── tRPC API ───────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ─── Static / Vite ─────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    startScheduler();
  });
}

startServer().catch(console.error);
