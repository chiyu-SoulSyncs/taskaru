import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
const mockCreateTask = vi.fn();
const mockGetNoteById = vi.fn();
const mockUpdateNote = vi.fn();
const mockUpdateTask = vi.fn();

vi.mock("./db", () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  getNoteById: (...args: unknown[]) => mockGetNoteById(...args),
  updateNote: (...args: unknown[]) => mockUpdateNote(...args),
  updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  getAllNotes: vi.fn().mockResolvedValue([]),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAuthenticatedCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "google:test-user",
      name: "Test User",
      email: "test@example.com",
      loginMethod: "google",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("notes.addTaskFromCandidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a task and removes the candidate from the note", async () => {
    const fakeTask = { id: 42, title: "テスト候補タスク", priority: "P2", category: "仕事" };
    const fakeNote = {
      id: 1,
      appUserId: 1,
      taskCandidates: [
        { title: "テスト候補タスク", priority: "P2", category: "仕事" },
        { title: "別の候補", priority: "P3", category: "個人" },
      ],
      extractedTaskIds: [10],
    };

    mockCreateTask.mockResolvedValue(fakeTask);
    mockGetNoteById.mockResolvedValue(fakeNote);
    mockUpdateNote.mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createAuthenticatedCtx());
    const result = await caller.notes.addTaskFromCandidate({
      noteId: 1,
      candidateIndex: 0,
      title: "テスト候補タスク",
      priority: "P2",
      category: "仕事",
    });

    expect(result.success).toBe(true);
    expect(result.taskId).toBe(42);

    // createTask was called with correct args
    expect(mockCreateTask).toHaveBeenCalledWith({
      title: "テスト候補タスク",
      priority: "P2",
      category: "仕事",
      lineUserId: "web",
      appUserId: 1,
    });

    // updateNote removes index 0 and appends taskId
    expect(mockUpdateNote).toHaveBeenCalledWith(1, {
      taskCandidates: [{ title: "別の候補", priority: "P3", category: "個人" }],
      extractedTaskIds: [10, 42],
    });
  });

  it("throws when createTask returns null", async () => {
    mockCreateTask.mockResolvedValue(null);

    const caller = appRouter.createCaller(createAuthenticatedCtx());
    await expect(
      caller.notes.addTaskFromCandidate({
        noteId: 1,
        candidateIndex: 0,
        title: "失敗タスク",
        priority: "P1",
        category: "緊急",
      })
    ).rejects.toThrow();
  });
});
