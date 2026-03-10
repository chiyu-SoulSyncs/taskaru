import { Router, Request, Response } from "express";
import {
  deleteTask,
  getLatestReplyContext,
  getPendingTasksForReminder,
  getTaskById,
  insertMessage,
  insertTasks,
  markMessageProcessed,
  saveReplyContext,
  updateTask,
  upsertLineUser,
  createNote,
  createTask,
  getAllProjects,
  createProject,
  moveTaskToProject,
  verifyAndConsumeLinkingCode,
  linkLineUserToAppUser,
  getAppUserIdByLineUserId,
} from "./db";
import { invokeLLM } from "./_core/llm";
import {
  buildListMessage,
  buildTaskAddedReply,
  buildTextMessage,
  pushMessage,
  replyMessage,
  verifyLineSignature,
} from "./line";
import { extractTasksFromText } from "./taskExtractor";

export const lineWebhookRouter = Router();

// ─── Webhook Endpoint ─────────────────────────────────────────────────────────

lineWebhookRouter.post("/webhook", async (req: Request, res: Response) => {
  // 1. Signature verification
  const signature = req.headers["x-line-signature"] as string;
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

  if (!verifyLineSignature(rawBody, signature)) {
    console.warn("[LINE Webhook] Invalid signature");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // Always respond 200 immediately to LINE
  res.status(200).json({ status: "ok" });

  // 2. Process events asynchronously
  const events: LineWebhookEvent[] = req.body?.events ?? [];
  for (const event of events) {
    try {
      await handleEvent(event);
    } catch (e) {
      console.error("[LINE Webhook] Event handling error:", e instanceof Error ? e.message : "unknown");
    }
  }
});

// ─── Helper: resolve appUserId for a LINE user ──────────────────────────────

async function resolveAppUserId(lineUserId: string): Promise<number | null> {
  return getAppUserIdByLineUserId(lineUserId);
}

// ─── Event Handler ────────────────────────────────────────────────────────────

async function handleEvent(event: LineWebhookEvent) {
  if (event.type !== "message" || event.message?.type !== "text") return;

  const lineUserId = event.source?.userId;
  const messageId = event.message?.id;
  const text = event.message?.text?.trim() ?? "";
  const replyToken = event.replyToken;

  if (!lineUserId || !messageId || !text) return;

  // Upsert LINE user
  await upsertLineUser(lineUserId);

  // ─── Command: linking code (8-char alphanumeric) ─────────────────────────
  if (/^[A-Z0-9]{8}$/i.test(text)) {
    await handleLinkingCode(lineUserId, text.toUpperCase(), replyToken);
    return;
  }

  // ─── Command: done N ──────────────────────────────────────────────────────
  const doneMatch = text.match(/^done\s+(\d+)$/i);
  if (doneMatch) {
    await handleDoneCommand(lineUserId, parseInt(doneMatch[1]), replyToken);
    return;
  }

  // ─── Command: undo N ──────────────────────────────────────────────────────
  const undoMatch = text.match(/^undo\s+(\d+)$/i);
  if (undoMatch) {
    await handleUndoCommand(lineUserId, parseInt(undoMatch[1]), replyToken);
    return;
  }

  // ─── Command: list ────────────────────────────────────────────────────────
  if (/^list$/i.test(text)) {
    await handleListCommand(lineUserId, replyToken);
    return;
  }

  // ─── Command: delete N ───────────────────────────────────────────────────
  const deleteMatch = text.match(/^delete\s+(\d+)$/i);
  if (deleteMatch) {
    await handleDeleteCommand(lineUserId, parseInt(deleteMatch[1]), replyToken);
    return;
  }

  // ─── Command: リマインド (instant reminder) ───────────────────────────────
  if (/^(リマインド|remind|reminder)$/i.test(text)) {
    await handleReminderCommand(lineUserId, replyToken);
    return;
  }

  // ─── Command: #メモ (save as AI-formatted note) ───────────────────────────
  if (/^#メモ/i.test(text) || /^#memo/i.test(text)) {
    await handleMemoCommand(lineUserId, text, replyToken);
    return;
  }

  // ─── Command: #プロジェクト名 タスク内容 ──────────────────────────────────
  const projectTaskMatch = text.match(/^#([^\s#][^\n]{0,50})\s+([\s\S]+)$/);
  if (projectTaskMatch) {
    await handleProjectTaskCommand(lineUserId, projectTaskMatch[1].trim(), projectTaskMatch[2].trim(), replyToken);
    return;
  }

  // ─── Task Extraction ──────────────────────────────────────────────────────
  await handleTaskExtraction(lineUserId, messageId, text, replyToken);
}

// ─── Linking Code Handler ────────────────────────────────────────────────────

async function handleLinkingCode(lineUserId: string, code: string, replyToken: string) {
  const appUserId = await verifyAndConsumeLinkingCode(code);

  if (!appUserId) {
    // Don't reveal whether code existed or expired (security)
    // Silently ignore - could be a normal 8-char message
    // Fall through to task extraction instead
    return;
  }

  // Link the LINE user to the web user
  await linkLineUserToAppUser(lineUserId, appUserId);

  await replyMessage(replyToken, [
    buildTextMessage(
      "🔗 アカウント連携が完了しました！\n\n" +
      "これ以降、LINEから送ったタスクやメモはWebアプリに自動で表示されます。\n\n" +
      "過去に送ったタスクも同期されました。"
    ),
  ]);
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function handleDoneCommand(lineUserId: string, num: number, replyToken: string) {
  if (num < 1 || num > 200) {
    await replyMessage(replyToken, [buildTextMessage(`❌ 番号 ${num} は無効です`)]);
    return;
  }
  const ctx = await getLatestReplyContext(lineUserId);
  const taskIds = (ctx?.taskIds as number[]) ?? [];
  const taskId = taskIds[num - 1];

  if (!taskId) {
    await replyMessage(replyToken, [buildTextMessage(`❌ 番号 ${num} のタスクが見つかりません`)]);
    return;
  }

  const task = await getTaskById(taskId);
  if (!task) {
    await replyMessage(replyToken, [buildTextMessage(`❌ タスクが存在しません`)]);
    return;
  }

  // Verify task ownership
  if (task.lineUserId !== lineUserId && task.lineUserId !== "web") {
    await replyMessage(replyToken, [buildTextMessage(`❌ このタスクを操作する権限がありません`)]);
    return;
  }

  await updateTask(taskId, { status: "done" });
  await replyMessage(replyToken, [
    buildTextMessage(`✅ 完了！\n「${task.title}」を完了にしました`),
  ]);
}

async function handleUndoCommand(lineUserId: string, num: number, replyToken: string) {
  if (num < 1 || num > 200) {
    await replyMessage(replyToken, [buildTextMessage(`❌ 番号 ${num} は無効です`)]);
    return;
  }
  const ctx = await getLatestReplyContext(lineUserId);
  const taskIds = (ctx?.taskIds as number[]) ?? [];
  const taskId = taskIds[num - 1];

  if (!taskId) {
    await replyMessage(replyToken, [buildTextMessage(`❌ 番号 ${num} のタスクが見つかりません`)]);
    return;
  }

  const task = await getTaskById(taskId);
  if (!task) {
    await replyMessage(replyToken, [buildTextMessage(`❌ タスクが存在しません`)]);
    return;
  }

  // Verify task ownership
  if (task.lineUserId !== lineUserId && task.lineUserId !== "web") {
    await replyMessage(replyToken, [buildTextMessage(`❌ このタスクを操作する権限がありません`)]);
    return;
  }

  await updateTask(taskId, { status: "todo" });
  await replyMessage(replyToken, [
    buildTextMessage(`↩️ 取り消し！\n「${task.title}」をtodoに戻しました`),
  ]);
}

async function handleListCommand(lineUserId: string, replyToken: string) {
  const pendingTasks = await getPendingTasksForReminder(lineUserId);
  const taskIds = pendingTasks.map((t) => t.id);
  await saveReplyContext(lineUserId, taskIds);

  const msg = buildListMessage(
    pendingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate ? String(t.dueDate) : null,
      priority: t.priority,
    }))
  );
  await replyMessage(replyToken, [buildTextMessage(msg)]);
}

async function handleReminderCommand(lineUserId: string, replyToken: string) {
  const pendingTasks = await getPendingTasksForReminder(lineUserId);

  if (pendingTasks.length === 0) {
    await replyMessage(replyToken, [
      buildTextMessage("✅ 未完了のタスクはありません！すべて完了です🎉"),
    ]);
    return;
  }

  const taskIds = pendingTasks.map((t) => t.id);
  await saveReplyContext(lineUserId, taskIds);

  const msg = buildListMessage(
    pendingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate ? String(t.dueDate) : null,
      priority: t.priority,
    }))
  );
  await replyMessage(replyToken, [buildTextMessage(msg)]);
}

async function handleMemoCommand(lineUserId: string, text: string, replyToken: string) {
  // Strip the #メモ prefix
  const rawText = text.replace(/^#(メモ|memo)\s*/i, "").trim().slice(0, 5000);
  if (!rawText) {
    await replyMessage(replyToken, [
      buildTextMessage("📝 メモの内容を #メモ の後に書いてください。\n例: #メモ 斎藤さんの件について..."),
    ]);
    return;
  }

  try {
    const appUserId = await resolveAppUserId(lineUserId);

    // AI format the note
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `あなたは優秀な秘書AIです。ユーザーのメモを整理し、以下のJSON形式で返してください：
{
  "title": "メモの内容を表す短いタイトル（20文字以内）",
  "formattedText": "Markdownで整形したメモ本文",
  "tags": ["関連するキーワード（最大5個）"],
  "taskCandidates": [
    { "title": "具体的なアクション（20文字以内）", "priority": "P1|P2|P3", "category": "カテゴリ" }
  ]
}`,
        },
        { role: "user", content: rawText },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "note_format",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              formattedText: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              taskCandidates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    priority: { type: "string", enum: ["P1", "P2", "P3"] },
                    category: { type: "string" },
                  },
                  required: ["title", "priority", "category"],
                  additionalProperties: false,
                },
              },
            },
            required: ["title", "formattedText", "tags", "taskCandidates"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const content = typeof raw === "string" ? raw : "{}";
    const formatted = JSON.parse(content) as {
      title: string;
      formattedText: string;
      tags: string[];
      taskCandidates: { title: string; priority: string; category: string }[];
    };

    // Save note with appUserId for user isolation
    await createNote({
      title: formatted.title,
      rawText,
      formattedText: formatted.formattedText,
      tags: formatted.tags,
      extractedTaskIds: [],
      taskCandidates: formatted.taskCandidates,
      sourceLineUserId: lineUserId,
      appUserId,
    });

    // Reply summary
    const candidateCount = formatted.taskCandidates.length;
    const tagStr = formatted.tags.length > 0 ? `\n🏷️ ${formatted.tags.join(" ")}` : "";
    const candidateStr =
      candidateCount > 0
        ? `\n\n💡 タスク候補 ${candidateCount}件あり → アプリで確認・追加できます`
        : "";

    await replyMessage(replyToken, [
      buildTextMessage(
        `📝 メモを保存しました！👨🏻‍🦳\n\n「${formatted.title}」${tagStr}${candidateStr}`
      ),
    ]);
  } catch (e) {
    console.error("[LINE Webhook] Memo handling error:", e instanceof Error ? e.message : "unknown");
    await replyMessage(replyToken, [
      buildTextMessage("❌ メモの保存に失敗しました。もう一度お試しください。"),
    ]);
  }
}

async function handleDeleteCommand(lineUserId: string, num: number, replyToken: string) {
  if (num < 1 || num > 200) {
    await replyMessage(replyToken, [buildTextMessage(`❌ 番号 ${num} は無効です`)]);
    return;
  }
  const ctx = await getLatestReplyContext(lineUserId);
  const taskIds = (ctx?.taskIds as number[]) ?? [];
  const taskId = taskIds[num - 1];

  if (!taskId) {
    await replyMessage(replyToken, [buildTextMessage(`❌ 番号 ${num} のタスクが見つかりません`)]);
    return;
  }

  const task = await getTaskById(taskId);
  if (!task) {
    await replyMessage(replyToken, [buildTextMessage(`❌ タスクが存在しません`)]);
    return;
  }

  // Verify task ownership
  if (task.lineUserId !== lineUserId && task.lineUserId !== "web") {
    await replyMessage(replyToken, [buildTextMessage(`❌ このタスクを削除する権限がありません`)]);
    return;
  }

  await deleteTask(taskId);
  await replyMessage(replyToken, [
    buildTextMessage(`🗑️ 削除しました\n「${task.title}」`),
  ]);
}

async function handleProjectTaskCommand(
  lineUserId: string,
  projectName: string,
  taskText: string,
  replyToken: string
) {
  try {
    const appUserId = await resolveAppUserId(lineUserId);

    // Find matching project by name (scoped to user if linked)
    const allProjects = await getAllProjects(appUserId ?? undefined);
    let project = allProjects.find(
      (p) => p.title.toLowerCase().includes(projectName.toLowerCase()) ||
             projectName.toLowerCase().includes(p.title.toLowerCase())
    );

    // Auto-create project if not found
    if (!project) {
      project = await createProject({
        title: projectName,
        status: "active",
        appUserId,
      }) ?? undefined;
    }

    if (!project) {
      await replyMessage(replyToken, [buildTextMessage("\u274c プロジェクトの作成に失敗しました")]);
      return;
    }

    // Create task and link to project
    const task = await createTask({
      title: taskText.slice(0, 200),
      lineUserId,
      appUserId,
      priority: "P2",
      category: project.title,
    });

    if (task) {
      await moveTaskToProject(task.id, project.id);
    }

    await replyMessage(replyToken, [
      buildTextMessage(
        `タスクを登録しました！👨🏻‍🦳\n\n📁 プロジェクト: ${project.title}\n📌 ${taskText.slice(0, 50)}${taskText.length > 50 ? "..." : ""}`
      ),
    ]);
  } catch (e) {
    console.error("[LINE Webhook] Project task command error:", e instanceof Error ? e.message : "unknown");
    await replyMessage(replyToken, [buildTextMessage("\u274c タスクの登録に失敗しました")]);
  }
}

async function handleTaskExtraction(
  lineUserId: string,
  messageId: string,
  text: string,
  replyToken: string
) {
  // Idempotency check
  const inserted = await insertMessage({ lineUserId, sourceMessageId: messageId, rawText: text });
  if (inserted === false) {
    console.log(`[LINE Webhook] Duplicate message ${messageId}, skipping`);
    return;
  }

  const appUserId = await resolveAppUserId(lineUserId);

  // Get current JST time
  const nowJST = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Extract tasks via LLM
  const extracted = await extractTasksFromText(text, nowJST);

  if (extracted.length === 0) {
    await replyMessage(replyToken, [
      buildTextMessage("🤔 タスクを抽出できませんでした。もう少し具体的に教えてください。"),
    ]);
    await markMessageProcessed(messageId);
    return;
  }

  // Insert tasks to DB with appUserId for user isolation
  const insertData = extracted.map((t) => ({
    lineUserId,
    appUserId,
    title: t.title,
    note: t.note || null,
    status: "todo" as const,
    priority: t.priority,
    category: t.category,
    dueDate: t.due_date ? new Date(t.due_date) : null,
    sourceMessageId: messageId,
  }));

  const savedTasks = await insertTasks(insertData);
  await markMessageProcessed(messageId);

  // Save reply context for done/undo commands
  const taskIds = savedTasks.map((t) => t.id);
  await saveReplyContext(lineUserId, taskIds);

  // Reply to LINE
  const replyText = buildTaskAddedReply(
    savedTasks.map((t) => ({
      title: t.title,
      dueDate: t.dueDate ? String(t.dueDate) : null,
      priority: t.priority,
      category: t.category,
    }))
  );
  await replyMessage(replyToken, [buildTextMessage(replyText)]);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineWebhookEvent {
  type: string;
  replyToken: string;
  source?: { userId?: string; type?: string };
  message?: { id: string; type: string; text?: string };
}
