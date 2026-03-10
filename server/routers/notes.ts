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
  // List all notes
  list: protectedProcedure.query(async () => {
    return getAllNotes();
  }),

  // Get note by ID
  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getNoteById(input.id);
    }),

  // Preview: AI-format without saving
  preview: protectedProcedure
    .input(z.object({ rawText: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const result = await formatNoteWithAI(input.rawText);
      return result;
    }),

  // Create note (with AI formatting) + optionally create tasks
  create: protectedProcedure
    .input(
      z.object({
        rawText: z.string().min(1),
        selectedTaskIndices: z.array(z.number()).optional(), // indices from taskCandidates to create as tasks
        sourceLineUserId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
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
      });

      return { note, createdTaskIds, taskCandidates: formatted.taskCandidates };
    }),

  // Update note
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        formattedText: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateNote(id, data);
      return getNoteById(id);
    }),

  // Delete note
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
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
    .mutation(async ({ input }) => {
      // Create the task
      const task = await createTask({
        title: input.title,
        priority: input.priority,
        category: input.category,
        lineUserId: "web",
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
