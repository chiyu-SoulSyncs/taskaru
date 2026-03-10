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

// ─── Simple rate limiter ──────────────────────────────────────────────────────
function createRateLimiter(windowMs: number, maxRequests: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const record = hits.get(key);

    if (!record || now > record.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    next();
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ─── Security headers ───────────────────────────────────────────────────
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (ENV.isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

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
