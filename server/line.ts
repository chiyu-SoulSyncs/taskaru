import crypto from "crypto";
import axios from "axios";

const LINE_API_BASE = "https://api.line.me/v2/bot";

// ─── Rate Limiting for LINE API calls ────────────────────────────────────────

const pushMessageLog: number[] = [];
const PUSH_RATE_LIMIT = 50; // max 50 push messages per minute
const PUSH_RATE_WINDOW_MS = 60_000;

function checkPushRateLimit(): boolean {
  const now = Date.now();
  // Remove entries older than the window
  while (pushMessageLog.length > 0 && pushMessageLog[0] < now - PUSH_RATE_WINDOW_MS) {
    pushMessageLog.shift();
  }
  if (pushMessageLog.length >= PUSH_RATE_LIMIT) {
    console.error(`[LINE] Push message rate limit exceeded (${PUSH_RATE_LIMIT}/min)`);
    return false;
  }
  pushMessageLog.push(now);
  return true;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(dateVal: string | null): string {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${m}/${day}`;
}

// ─── Signature Verification ───────────────────────────────────────────────────

export function verifyLineSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    console.error("[LINE] LINE_CHANNEL_SECRET is not set — rejecting request");
    return false;
  }
  if (!signature) {
    console.warn("[LINE] Missing x-line-signature header");
    return false;
  }
  const hash = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ─── Reply Message ────────────────────────────────────────────────────────────

export async function replyMessage(replyToken: string, messages: LineMessage[]) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn("[LINE] LINE_CHANNEL_ACCESS_TOKEN not set");
    return;
  }
  try {
    await axios.post(
      `${LINE_API_BASE}/message/reply`,
      { replyToken, messages },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
      }
    );
  } catch (e: unknown) {
    console.error("[LINE] replyMessage error:", e instanceof Error ? e.message : e);
  }
}

// ─── Push Message (rate-limited) ─────────────────────────────────────────────

export async function pushMessage(to: string, messages: LineMessage[]) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn("[LINE] LINE_CHANNEL_ACCESS_TOKEN not set");
    return;
  }
  if (!checkPushRateLimit()) {
    return; // Rate limited — skip this message
  }
  try {
    await axios.post(
      `${LINE_API_BASE}/message/push`,
      { to, messages },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
      }
    );
  } catch (e: unknown) {
    console.error("[LINE] pushMessage error:", e instanceof Error ? e.message : e);
  }
}

// ─── Message Builders ─────────────────────────────────────────────────────────

export type LineMessage = { type: "text"; text: string };

export function buildTextMessage(text: string): LineMessage {
  return { type: "text", text: text.slice(0, 5000) }; // LINE max is 5000 chars
}

export function buildTaskAddedReply(
  taskList: Array<{ title: string; dueDate: string | null; priority: string; category: string }>
): string {
  const lines = taskList.slice(0, 50).map((t, i) => {
    const due = t.dueDate ? `（${formatDate(t.dueDate)}まで）` : "";
    return `${i + 1}.${t.title.slice(0, 100)}${due}`;
  });
  return `タスクを登録しました！👨🏻‍🦳\n\n─────────────\n\n${lines.join("\n")}\n\n─────────────`;
}

export function buildReminderMessage(
  taskList: Array<{ id: number; title: string; dueDate: string | null; priority: string }>
): string {
  const lines = taskList.slice(0, 50).map((t, i) => {
    const due = t.dueDate ? `（${formatDate(t.dueDate)}まで）` : "";
    return `${i + 1}.${t.title.slice(0, 100)}${due}`;
  });
  return `おはようございます！👨🏻‍🦳☀️\n残っているタスクは以下です🗒️\n\n─────────────\n\n${lines.join("\n")}\n\n─────────────`;
}

export function buildListMessage(
  taskList: Array<{ id: number; title: string; dueDate: string | null; priority: string }>
): string {
  if (taskList.length === 0) return "✨ 未完了タスクはありません！";
  const lines = taskList.slice(0, 50).map((t, i) => {
    const due = t.dueDate ? `（${formatDate(t.dueDate)}まで）` : "";
    return `${i + 1}.${t.title.slice(0, 100)}${due}`;
  });
  return `残っているタスクは以下です🗒️\n\n─────────────\n\n${lines.join("\n")}\n\n─────────────`;
}
