import { TRPCError } from "@trpc/server";
import { pushMessage, buildTextMessage } from "../line";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Sends a notification to the admin via LINE push message.
 * Falls back to console logging if LINE is not configured.
 */
export async function notifyOwner(
  payload: NotificationPayload,
  adminLineUserId?: string
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!adminLineUserId) {
    console.log(`[Notification] ${title}: ${content}`);
    return true;
  }

  try {
    await pushMessage(adminLineUserId, [
      buildTextMessage(`📢 ${title}\n\n${content}`),
    ]);
    return true;
  } catch (error) {
    console.warn("[Notification] Failed to send LINE notification:", error);
    return false;
  }
}
