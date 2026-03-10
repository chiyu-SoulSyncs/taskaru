import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectProgress,
  getTasksByProject,
  getNotesByProject,
  moveTaskToProject,
  createTask,
  createKpi,
  getTaskById,
} from "../db";
import { invokeLLM } from "../_core/llm";

export const projectsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const allProjects = await getAllProjects(ctx.user.id);
    // Attach progress to each project
    const withProgress = await Promise.all(
      allProjects.map(async (project) => {
        const progress = await getProjectProgress(project.id);
        return { ...project, ...progress };
      })
    );
    return withProgress;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectById(input.id);
      if (!project) return null;
      if (project.appUserId !== null && project.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      const progress = await getProjectProgress(project.id);
      const projectTasks = await getTasksByProject(project.id);
      const projectNotes = await getNotesByProject(project.id);
      return { ...project, ...progress, tasks: projectTasks, notes: projectNotes };
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(128),
        description: z.string().max(2000).optional(),
        status: z.enum(["active", "completed", "on_hold"]).optional(),
        color: z.string().max(32).optional(),
        dueDate: z.date().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return createProject({
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? "active",
        color: input.color ?? "violet",
        dueDate: input.dueDate ?? null,
        appUserId: ctx.user.id,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(128).optional(),
        description: z.string().max(2000).nullable().optional(),
        status: z.enum(["active", "completed", "on_hold"]).optional(),
        color: z.string().max(32).optional(),
        dueDate: z.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const project = await getProjectById(id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.appUserId !== null && project.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await updateProject(id, data);
      return getProjectById(id);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectById(input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.appUserId !== null && project.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await deleteProject(input.id);
      return { success: true };
    }),

  moveTask: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        projectId: z.number().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify task belongs to user
      const task = await getTaskById(input.taskId);
      if (task && task.appUserId !== null && task.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      // Verify project belongs to user
      if (input.projectId !== null) {
        const project = await getProjectById(input.projectId);
        if (project && project.appUserId !== null && project.appUserId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      }
      await moveTaskToProject(input.taskId, input.projectId);
      return { success: true };
    }),

  // AI一括抽出: テキストからプロジェクト・タスク・KPIを抽出する
  extractFromDocument: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1).max(20000),
      })
    )
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `あなたは事業計画書・プロジェクト計画書を解析するAIアシスタントです。
与えられたテキストから以下の情報を抽出してJSON形式で返してください。

返すJSONの構造:
{
  "projects": [
    {
      "title": "プロジェクト名（簡潔に）",
      "description": "プロジェクトの概要・目的（100文字以内）",
      "status": "active",
      "color": "violet" // violet/blue/green/orange/red/pinkのいずれか
    }
  ],
  "tasks": [
    {
      "title": "タスク名（具体的なアクション）",
      "priority": "P1" // P1=高/P2=中/P3=低
      "category": "カテゴリ名",
      "dueDate": "2026-04-30" // 期限がわかる場合のみ、YYYY-MM-DD形式
      "projectIndex": 0 // 上記projectsの何番目のプロジェクトに属するか（0始まり）
    }
  ],
  "kpis": [
    {
      "title": "KPI名",
      "unit": "単位（%、件、万円など）",
      "targetValue": 100,
      "currentValue": 0,
      "dueDate": "2026-12-31" // YYYY-MM-DD形式
      "note": "補足説明（任意）",
      "projectIndex": 0 // 上記projectsの何番目のプロジェクトに属するか（0始まり）
    }
  ]
}

注意:
- プロジェクトは最大5件まで
- タスクは最大30件まで（具体的なアクションのみ）
- KPIは数値で測定できるもののみ（最大20件）
- 日付が不明な場合はdueDateを省略
- 必ずJSONのみを返し、説明文は不要`,
          },
          {
            role: "user",
            content: input.text,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "document_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                projects: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      status: { type: "string" },
                      color: { type: "string" },
                    },
                    required: ["title", "description", "status", "color"],
                    additionalProperties: false,
                  },
                },
                tasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      priority: { type: "string" },
                      category: { type: "string" },
                      dueDate: { type: "string" },
                      projectIndex: { type: "number" },
                    },
                    required: ["title", "priority", "category", "dueDate", "projectIndex"],
                    additionalProperties: false,
                  },
                },
                kpis: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      unit: { type: "string" },
                      targetValue: { type: "number" },
                      currentValue: { type: "number" },
                      dueDate: { type: "string" },
                      note: { type: "string" },
                      projectIndex: { type: "number" },
                    },
                    required: ["title", "unit", "targetValue", "currentValue", "dueDate", "note", "projectIndex"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["projects", "tasks", "kpis"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("AI response is empty");
      const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content)) as {
        projects: { title: string; description: string; status: string; color: string }[];
        tasks: { title: string; priority: string; category: string; dueDate: string; projectIndex: number }[];
        kpis: { title: string; unit: string; targetValue: number; currentValue: number; dueDate: string; note: string; projectIndex: number }[];
      };
      return parsed;
    }),

  // 一括登録: 抽出結果を実際にDBに保存する
  bulkImport: protectedProcedure
    .input(
      z.object({
        projects: z.array(
          z.object({
            title: z.string().min(1).max(128),
            description: z.string().max(2000).optional(),
            status: z.enum(["active", "completed", "on_hold"]).optional(),
            color: z.string().max(32).optional(),
          })
        ).max(10),
        tasks: z.array(
          z.object({
            title: z.string().min(1).max(200),
            priority: z.enum(["P1", "P2", "P3"]).optional(),
            category: z.string().max(64).optional(),
            dueDate: z.string().max(20).optional(),
            projectIndex: z.number(),
          })
        ).max(50),
        kpis: z.array(
          z.object({
            title: z.string().min(1).max(128),
            unit: z.string().max(32).optional(),
            targetValue: z.number(),
            currentValue: z.number().optional(),
            dueDate: z.string().max(20).optional(),
            note: z.string().max(500).optional(),
            projectIndex: z.number(),
          })
        ).max(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. プロジェクトを作成してIDを記録
      const projectIds: number[] = [];
      for (const p of input.projects) {
        const project = await createProject({
          title: p.title,
          description: p.description ?? null,
          status: (p.status as "active" | "completed" | "on_hold") ?? "active",
          color: p.color ?? "violet",
          dueDate: null,
          appUserId: ctx.user.id,
        });
        projectIds.push(project?.id ?? 0);
      }

      // 2. タスクを作成してプロジェクトに紐付け
      let taskCount = 0;
      for (const t of input.tasks) {
        const projectId = projectIds[t.projectIndex] ?? null;
        const dueDate = t.dueDate ? new Date(t.dueDate) : null;
        const task = await createTask({
          title: t.title,
          priority: (t.priority as "P1" | "P2" | "P3") ?? "P2",
          category: t.category ?? "その他",
          dueDate,
          lineUserId: "web",
          appUserId: ctx.user.id,
        });
        if (task && projectId) {
          const { updateTask } = await import("../db");
          await updateTask(task.id, { projectId });
        }
        taskCount++;
      }

      // 3. KPIを作成してプロジェクトに紐付け
      let kpiCount = 0;
      for (const k of input.kpis) {
        const projectId = projectIds[k.projectIndex];
        if (!projectId) continue;
        await createKpi({
          projectId,
          title: k.title,
          unit: k.unit ?? "",
          targetValue: k.targetValue,
          currentValue: k.currentValue ?? 0,
          dueDate: k.dueDate ? new Date(k.dueDate) : null,
          note: k.note ?? null,
        });
        kpiCount++;
      }

      return {
        projectCount: projectIds.length,
        taskCount,
        kpiCount,
      };
    }),
});
