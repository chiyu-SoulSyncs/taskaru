import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getKpisByProject, getProjectById, createKpi, updateKpi, deleteKpi } from "../db";
import { invokeLLM } from "../_core/llm";

/** Verify the project belongs to the requesting user */
async function verifyProjectOwnership(projectId: number, userId: number) {
  const project = await getProjectById(projectId);
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  if (project.appUserId !== null && project.appUserId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  }
  return project;
}

export const kpisRouter = router({
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyProjectOwnership(input.projectId, ctx.user.id);
      return getKpisByProject(input.projectId);
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        title: z.string().min(1).max(128),
        unit: z.string().max(32).default(""),
        targetValue: z.number(),
        currentValue: z.number().default(0),
        dueDate: z.string().nullable().optional(), // YYYY-MM-DD
        note: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwnership(input.projectId, ctx.user.id);
      return createKpi({
        projectId: input.projectId,
        title: input.title,
        unit: input.unit,
        targetValue: input.targetValue,
        currentValue: input.currentValue,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        note: input.note ?? null,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(128).optional(),
        unit: z.string().max(32).optional(),
        targetValue: z.number().optional(),
        currentValue: z.number().optional(),
        dueDate: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, dueDate, ...rest } = input;
      const data: Parameters<typeof updateKpi>[1] = { ...rest };
      if (dueDate !== undefined) {
        data.dueDate = dueDate ? new Date(dueDate) : null;
      }
      await updateKpi(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteKpi(input.id);
      return { success: true };
    }),

  // AI でテキストから KPI を抽出して候補として返す（まだ保存しない）
  extractFromText: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1).max(8000),
      })
    )
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: [
              "あなたはプロジェクト管理の専門家です。",
              "ユーザーが入力したプロジェクト設計・戦略・目標テキストを読み込み、",
              "KPI（重要業績評価指標）を抽出してください。",
              "各KPIは以下の形式で返してください：",
              "- title: KPIの名称（例: 月間売上、新規顧客数、解約率）",
              "- unit: 単位（例: 万円、件、%、人）",
              "- targetValue: 目標値（数値のみ。テキストに記載がなければ合理的な推定値を設定）",
              "- currentValue: 現在値（テキストに記載がなければ0）",
              "- dueDate: 期限（YYYY-MM-DD形式。記載がなければnull）",
              "- note: 補足説明（任意）",
              "KPIは最大10件まで抽出してください。",
            ].join(""),
          },
          {
            role: "user",
            content: input.text,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "kpi_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                kpis: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      unit: { type: "string" },
                      targetValue: { type: "number" },
                      currentValue: { type: "number" },
                      dueDate: { type: ["string", "null"] },
                      note: { type: ["string", "null"] },
                    },
                    required: ["title", "unit", "targetValue", "currentValue", "dueDate", "note"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["kpis"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error("AI response empty");
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
      const parsed = JSON.parse(content) as {
        kpis: {
          title: string;
          unit: string;
          targetValue: number;
          currentValue: number;
          dueDate: string | null;
          note: string | null;
        }[];
      };
      return { kpis: parsed.kpis };
    }),

  // 複数 KPI を一括登録
  bulkCreate: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        kpis: z.array(
          z.object({
            title: z.string().min(1).max(128),
            unit: z.string().max(32).default(""),
            targetValue: z.number(),
            currentValue: z.number().default(0),
            dueDate: z.string().nullable().optional(),
            note: z.string().nullable().optional(),
          })
        ).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyProjectOwnership(input.projectId, ctx.user.id);
      const created = await Promise.all(
        input.kpis.map((kpi) =>
          createKpi({
            projectId: input.projectId,
            title: kpi.title,
            unit: kpi.unit,
            targetValue: kpi.targetValue,
            currentValue: kpi.currentValue,
            dueDate: kpi.dueDate ? new Date(kpi.dueDate) : null,
            note: kpi.note ?? null,
          })
        )
      );
      return { count: created.length };
    }),
});
