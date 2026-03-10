import crypto from "crypto";
import axios from "axios";

const LINE_API_BASE = "https://api.line.me/v2/bot";

function getChannelSecret(): string {
  return process.env.LINE_CHANNEL_SECRET ?? "";
}

function getAccessToken(): string {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
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
  const secret = getChannelSecret();
  if (!secret) {
    console.warn("[LINE] LINE_CHANNEL_SECRET not set – skipping signature check");
    return true; // dev mode: skip
  }
  const hash = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  return hash === signature;
}

// ─── Reply Message ────────────────────────────────────────────────────────────

export async function replyMessage(replyToken: string, messages: LineMessage[]) {
  const token = getAccessToken();
  if (!token) {
    console.warn("[LINE] LINE_CHANNEL_ACCESS_TOKEN not set");
    return;
  }
  try {
    await axios.post(
      `${LINE_API_BASE}/message/reply`,
      { replyToken, messages },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (e: unknown) {
    console.error("[LINE] replyMessage error:", e instanceof Error ? e.message : e);
  }
}

// ─── Push Message ─────────────────────────────────────────────────────────────

export async function pushMessage(to: string, messages: LineMessage[]) {
  const token = getAccessToken();
  if (!token) {
    console.warn("[LINE] LINE_CHANNEL_ACCESS_TOKEN not set");
    return;
  }
  try {
    await axios.post(
      `${LINE_API_BASE}/message/push`,
      { to, messages },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (e: unknown) {
    console.error("[LINE] pushMessage error:", e instanceof Error ? e.message : e);
  }
}

// ─── Message Builders ─────────────────────────────────────────────────────────

export type LineMessage = { type: "text"; text: string };

export function buildTextMessage(text: string): LineMessage {
  return { type: "text", text };
}

export function buildTaskAddedReply(
  taskList: Array<{ title: string; dueDate: string | null; priority: string; category: string }>
): string {
  const lines = taskList.map((t, i) => {
    const due = t.dueDate ? `（${formatDate(t.dueDate)}まで）` : "";
    return `${i + 1}.${t.title}${due}`;
  });
  return `タスクを登録しました！👨🏻‍🦳\n\n─────────────\n\n${lines.join("\n")}\n\n─────────────`;
}

export function buildReminderMessage(
  taskList: Array<{ id: number; title: string; dueDate: string | null; priority: string }>
): string {
  const lines = taskList.map((t, i) => {
    const due = t.dueDate ? `（${formatDate(t.dueDate)}まで）` : "";
    return `${i + 1}.${t.title}${due}`;
  });
  return `おはようございます！👨🏻‍🦳☀️\n残っているタスクは以下です🗒️\n\n─────────────\n\n${lines.join("\n")}\n\n─────────────`;
}

export function buildListMessage(
  taskList: Array<{ id: number; title: string; dueDate: string | null; priority: string }>
): string {
  if (taskList.length === 0) return "✨ 未完了タスクはありません！";
  const lines = taskList.map((t, i) => {
    const due = t.dueDate ? `（${formatDate(t.dueDate)}まで）` : "";
    return `${i + 1}.${t.title}${due}`;
  });
  return `残っているタスクは以下です🗒️\n\n─────────────\n\n${lines.join("\n")}\n\n─────────────`;
}
