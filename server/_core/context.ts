import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME, SESSION_MAX_AGE_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/** Refresh session cookie if more than half of its lifetime has passed */
const SESSION_REFRESH_THRESHOLD_MS = SESSION_MAX_AGE_MS / 2;

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const authResult = await sdk.authenticateRequest(opts.req);
    user = authResult.user;

    // Sliding session: refresh token if it's past the halfway point
    if (authResult.issuedAt && user) {
      const tokenAge = Date.now() - authResult.issuedAt;
      if (tokenAge > SESSION_REFRESH_THRESHOLD_MS) {
        const newToken = await sdk.createSessionToken({
          userId: user.id,
          openId: user.openId,
          name: user.name || "",
        });
        const cookieOptions = getSessionCookieOptions(opts.req);
        opts.res.cookie(COOKIE_NAME, newToken, {
          ...cookieOptions,
          maxAge: SESSION_MAX_AGE_MS,
        });
      }
    }
  } catch {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
