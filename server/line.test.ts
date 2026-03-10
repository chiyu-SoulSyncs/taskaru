import { describe, expect, it } from "vitest";
import { verifyLineSignature } from "./line";
import crypto from "crypto";

describe("LINE signature verification", () => {
  it("accepts a valid HMAC-SHA256 signature", () => {
    const secret = "test-channel-secret";
    const body = JSON.stringify({ events: [] });
    const sig = crypto.createHmac("sha256", secret).update(body).digest("base64");

    // Temporarily set env for test
    const original = process.env.LINE_CHANNEL_SECRET;
    process.env.LINE_CHANNEL_SECRET = secret;
    expect(verifyLineSignature(body, sig)).toBe(true);
    process.env.LINE_CHANNEL_SECRET = original;
  });

  it("rejects an invalid signature", () => {
    const secret = "test-channel-secret";
    const body = JSON.stringify({ events: [] });

    const original = process.env.LINE_CHANNEL_SECRET;
    process.env.LINE_CHANNEL_SECRET = secret;
    expect(verifyLineSignature(body, "invalid-signature")).toBe(false);
    process.env.LINE_CHANNEL_SECRET = original;
  });

  it("skips verification when secret is not set", () => {
    const original = process.env.LINE_CHANNEL_SECRET;
    process.env.LINE_CHANNEL_SECRET = "";
    expect(verifyLineSignature("any-body", "any-sig")).toBe(true);
    process.env.LINE_CHANNEL_SECRET = original;
  });
});
