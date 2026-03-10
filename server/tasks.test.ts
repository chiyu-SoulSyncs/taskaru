import { describe, expect, it } from "vitest";
import { buildTaskAddedReply, buildReminderMessage, buildListMessage } from "./line";

describe("LINE message builders", () => {
  it("buildTaskAddedReply formats task list correctly", () => {
    const tasks = [
      { title: "請求書を送付する", dueDate: "2026-03-01", priority: "P1", category: "仕事" },
      { title: "薬を買う", dueDate: null, priority: "P2", category: "健康" },
    ];
    const msg = buildTaskAddedReply(tasks);
    // 現在の実装: 「タスクを登録しました！👨🏻‍🦳」ヘッダー
    expect(msg).toContain("タスクを登録しました！");
    // 番号付きリスト（スペースなし形式: "1.タスク名"）
    expect(msg).toContain("1.");
    expect(msg).toContain("請求書を送付する");
    expect(msg).toContain("2.");
    expect(msg).toContain("薬を買う");
  });

  it("buildReminderMessage contains morning greeting", () => {
    const tasks = [
      { id: 1, title: "古いタスク", dueDate: "2020-01-01", priority: "P1" },
      { id: 2, title: "新しいタスク", dueDate: null, priority: "P2" },
    ];
    const msg = buildReminderMessage(tasks);
    // 現在の実装: 「おはようございます！👨🏻‍🦳☀️」ヘッダー
    expect(msg).toContain("おはようございます");
    // タスクが含まれる
    expect(msg).toContain("古いタスク");
    expect(msg).toContain("新しいタスク");
  });

  it("buildListMessage returns empty message when no tasks", () => {
    const msg = buildListMessage([]);
    expect(msg).toContain("✨ 未完了タスクはありません");
  });

  it("buildListMessage lists tasks with numbers", () => {
    const tasks = [
      { id: 1, title: "タスクA", dueDate: null, priority: "P2" },
      { id: 2, title: "タスクB", dueDate: "2099-12-31", priority: "P3" },
    ];
    const msg = buildListMessage(tasks);
    // 番号付きリスト（スペースなし形式: "1.タスク名"）
    expect(msg).toContain("1.");
    expect(msg).toContain("タスクA");
    expect(msg).toContain("2.");
    expect(msg).toContain("タスクB");
  });
});

describe("LINE command parsing", () => {
  it("parses done command", () => {
    const text = "done 3";
    const match = text.match(/^done\s+(\d+)$/i);
    expect(match).not.toBeNull();
    expect(parseInt(match![1])).toBe(3);
  });

  it("parses undo command", () => {
    const text = "undo 2";
    const match = text.match(/^undo\s+(\d+)$/i);
    expect(match).not.toBeNull();
    expect(parseInt(match![1])).toBe(2);
  });

  it("parses list command case-insensitively", () => {
    expect(/^list$/i.test("list")).toBe(true);
    expect(/^list$/i.test("LIST")).toBe(true);
    expect(/^list$/i.test("list extra")).toBe(false);
  });

  it("parses delete command", () => {
    const text = "delete 5";
    const match = text.match(/^delete\s+(\d+)$/i);
    expect(match).not.toBeNull();
    expect(parseInt(match![1])).toBe(5);
  });
});
