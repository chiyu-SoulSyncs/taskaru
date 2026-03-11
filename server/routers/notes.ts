import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import {
  getAllNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  createTask,
} from "../db";
import { z } from "zod";

// ─── AI: Format note and extract task candidates ──────────────────────────────
async function formatNoteWithAI(rawText: string): Promise<{
  title: string;
  formattedText: string;
  tags: string[];
  taskCandidates: { title: string; priority: "P1" | "P2" | "P3"; category: string }[];
}> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `あなたは優秀な秘書AIです。ユーザーが書いた雑然としたメモを整理します。
以下のJSON形式で返してください：
{
  "title": "メモの内容を表す短いタイトル（20文字以内）",
  "formattedText": "Markdownで整形したメモ本文。見出し・箇条書き・太字を使って見やすく構造化する。元の情報を削除せず、読みやすく整理する。",
  "tags": ["関連するキーワードや人名・プロジェクト名（最大5個）"],
  "taskCandidates": [
    {
      "title": "具体的なアクション（〜する形式、20文字以内）",
      "priority": "P1|P2|P3",
      "category": "カテゴリ名"
    }
  ]
}
priorityの基準: P1=緊急・今週中, P2=通常・来週以内, P3=低・いつか
taskCandidatesは「〜する必要がある」「〜に連絡する」「〜を調べる」など明確なアクションのみ抽出（最大10件）。`,
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
  return JSON.parse(content);
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const notesRouter = router({
  // List all notes (user-scoped)
  list: protectedProcedure.query(async ({ ctx }) => {
    return getAllNotes(ctx.user.id);
  }),

  // Get note by ID
  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const note = await getNoteById(input.id);
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      if (note.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return note;
    }),

  // Preview: AI-format without saving
  preview: protectedProcedure
    .input(z.object({ rawText: z.string().min(1).max(20000) }))
    .mutation(async ({ input }) => {
      const result = await formatNoteWithAI(input.rawText);
      return result;
    }),

  // Create note (with AI formatting) + optionally create tasks
  create: protectedProcedure
    .input(
      z.object({
        rawText: z.string().min(1).max(20000),
        selectedTaskIndices: z.array(z.number()).max(30).optional(),
        sourceLineUserId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // AI format
      const formatted = await formatNoteWithAI(input.rawText);

      // Create tasks from selected candidates
      const createdTaskIds: number[] = [];
      if (input.selectedTaskIndices && input.selectedTaskIndices.length > 0) {
        for (const idx of input.selectedTaskIndices) {
          const candidate = formatted.taskCandidates[idx];
          if (!candidate) continue;
          const task = await createTask({
            title: candidate.title,
            priority: candidate.priority as "P1" | "P2" | "P3",
            category: candidate.category,
            lineUserId: input.sourceLineUserId ?? "web",
            appUserId: ctx.user.id,
          });
          if (task) createdTaskIds.push(task.id);
        }
      }

      // Save note (store remaining candidates so detail page can add them later)
      const remainingCandidates = formatted.taskCandidates.filter(
        (_, idx) => !input.selectedTaskIndices?.includes(idx)
      );
      const note = await createNote({
        title: formatted.title,
        rawText: input.rawText,
        formattedText: formatted.formattedText,
        tags: formatted.tags,
        extractedTaskIds: createdTaskIds,
        taskCandidates: remainingCandidates,
        sourceLineUserId: input.sourceLineUserId ?? null,
        appUserId: ctx.user.id,
      });

      return { note, createdTaskIds, taskCandidates: formatted.taskCandidates };
    }),

  // Update note
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().max(200).optional(),
        formattedText: z.string().max(50000).optional(),
        tags: z.array(z.string().max(50)).max(20).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const note = await getNoteById(id);
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      if (note.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await updateNote(id, data);
      return getNoteById(id);
    }),

  // Delete note
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const note = await getNoteById(input.id);
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      if (note.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await deleteNote(input.id);
      return { success: true };
    }),

  // Add a single task candidate as a real task
  addTaskFromCandidate: protectedProcedure
    .input(
      z.object({
        noteId: z.number(),
        candidateIndex: z.number(),
        title: z.string().min(1),
        priority: z.enum(["P1", "P2", "P3"]),
        category: z.string(),
        folderId: z.number().nullable().optional(),
        projectId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify note belongs to user
      const noteCheck = await getNoteById(input.noteId);
      if (!noteCheck) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      if (noteCheck.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      // Create the task
      const task = await createTask({
        title: input.title,
        priority: input.priority,
        category: input.category,
        lineUserId: "web",
        appUserId: ctx.user.id,
      });
      if (!task) throw new Error("Task creation failed");

      // Optionally link to folder/project
      if (input.folderId != null || input.projectId != null) {
        const { updateTask } = await import("../db");
        await updateTask(task.id, {
          folderId: input.folderId ?? null,
          projectId: input.projectId ?? null,
        });
      }

      // Remove this candidate from the note's taskCandidates list and record in extractedTaskIds
      const note = await getNoteById(input.noteId);
      if (note) {
        const candidates = (note.taskCandidates as { title: string; priority: string; category: string }[] | null) ?? [];
        const newCandidates = candidates.filter((_, i) => i !== input.candidateIndex);
        const existingIds = (note.extractedTaskIds as number[] | null) ?? [];
        await updateNote(input.noteId, {
          taskCandidates: newCandidates,
          extractedTaskIds: [...existingIds, task.id],
        });
      }

      return { success: true, taskId: task.id };
    }),
});
