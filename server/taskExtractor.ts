import { invokeLLM } from "./_core/llm";

export interface ExtractedTask {
  title: string;
  note: string;
  due_date: string | null; // YYYY-MM-DD or null
  priority: "P1" | "P2" | "P3";
  category: string;
}

const SYSTEM_PROMPT = `あなたはタスク抽出AIです。ユーザーのメッセージから複数のタスクを抽出し、厳格なJSONのみを返してください。

タイトル整形ルール:
- 1タスク = 1行の動詞文（〜する）
- 名詞止まり禁止（×「請求書」→○「請求書を送付する」）
- 「AしてBしてC」→3分割
- 修飾語（できれば/ついでに/なるはや）は note に移動
- 連絡系：「○○さんに連絡する」

期限（due_date）:
- JST基準で相対日時を解釈
- 明確（今日/明日/◯日まで/締切）→ YYYY-MM-DD
- 曖昧（来週/そのうち/なるはや）→ null（noteに根拠を残す）

優先度:
- P1: 期限確定かつ近い、または緊急語（至急/本日中/締切）
- P2: 通常
- P3: いつでも/アイデア/検討

カテゴリ（最低限）: 仕事 / 私用 / 健康 / 買い物 / 連絡 / その他

スキーマ違反時は空配列で返す。`;

export async function extractTasksFromText(
  rawText: string,
  nowJST: string
): Promise<ExtractedTask[]> {
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `現在日時（JST）: ${nowJST}\n\nメッセージ:\n${rawText}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "task_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "短い動詞文のタスクタイトル" },
                    note: { type: "string", description: "補足情報・修飾語・曖昧期限の根拠" },
                    due_date: {
                      type: ["string", "null"],
                      description: "YYYY-MM-DD形式の期限、または null",
                    },
                    priority: {
                      type: "string",
                      enum: ["P1", "P2", "P3"],
                      description: "優先度",
                    },
                    category: {
                      type: "string",
                      description: "仕事/私用/健康/買い物/連絡/その他",
                    },
                  },
                  required: ["title", "note", "due_date", "priority", "category"],
                  additionalProperties: false,
                },
              },
            },
            required: ["tasks"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    const extracted: ExtractedTask[] = parsed?.tasks ?? [];

    // Validate and sanitize
    return extracted
      .filter((t) => t.title && typeof t.title === "string" && t.title.trim().length > 0)
      .map((t) => ({
        title: t.title.trim(),
        note: t.note?.trim() ?? "",
        due_date: t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null,
        priority: ["P1", "P2", "P3"].includes(t.priority) ? t.priority : "P2",
        category: t.category?.trim() || "その他",
      }));
  } catch (e) {
    console.error("[TaskExtractor] LLM error:", e);
    return [];
  }
}
