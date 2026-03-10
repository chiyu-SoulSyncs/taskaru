import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  createTask,
  deleteTask,
  deleteTasks,
  getAllLineUsers,
  getAllTasks,
  getLatestReplyContext,
  getLineUser,
  getTaskById,
  upsertLineUser,
  updateTask,
  updateTaskSortOrders,
  bulkMoveTasksToFolder,
  getSubTasksByParent,
  getAllTasksByProject,
} from "../db";
import { sendMorningReminders } from "../scheduler";
import { z } from "zod";

export const tasksRouter = router({
  // ─── Task List ─────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        priority: z.string().optional(),
        category: z.string().optional(),
        search: z.string().optional(),
        dueDateFilter: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return getAllTasks(input);
    }),

  // ─── Task by ID ────────────────────────────────────────────────────────────
  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getTaskById(input.id);
    }),

  // ─── Sub-tasks by parent ───────────────────────────────────────────────────
  subTasks: protectedProcedure
    .input(z.object({ parentTaskId: z.number() }))
    .query(async ({ input }) => {
      return getSubTasksByParent(input.parentTaskId);
    }),

  // ─── All tasks in a project (parent + children) ───────────────────────────
  allByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return getAllTasksByProject(input.projectId);
    }),

  // ─── Update Task ───────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        note: z.string().nullable().optional(),
        status: z.enum(["todo", "doing", "done"]).optional(),
        priority: z.enum(["P1", "P2", "P3"]).optional(),
        category: z.string().optional(),
        dueDate: z.string().nullable().optional(), // YYYY-MM-DD or null
        parentTaskId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, dueDate, ...rest } = input;
      const updateData: Parameters<typeof updateTask>[1] = { ...rest };
      if (dueDate !== undefined) {
        updateData.dueDate = dueDate ? new Date(dueDate) : null;
      }
      await updateTask(id, updateData);
      return getTaskById(id);
    }),

  // ─── Toggle Complete ───────────────────────────────────────────────────────
  toggleComplete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const task = await getTaskById(input.id);
      if (!task) throw new Error("Task not found");
      const newStatus = task.status === "done" ? "todo" : "done";
      await updateTask(input.id, { status: newStatus });
      return getTaskById(input.id);
    }),

  // ─── Delete Task ───────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      // 子タスクも一緒に削除
      const subTasks = await getSubTasksByParent(input.id);
      if (subTasks.length > 0) {
        await deleteTasks(subTasks.map((t) => t.id));
      }
      await deleteTask(input.id);
      return { success: true };
    }),

  // ─── Delete Multiple Tasks ─────────────────────────────────────────────────
  deleteMany: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      await deleteTasks(input.ids);
      return { success: true, count: input.ids.length };
    }),

  // ─── Update Sort Orders ────────────────────────────────────────────────────
  reorder: protectedProcedure
    .input(z.object({ items: z.array(z.object({ id: z.number(), sortOrder: z.number() })) }))
    .mutation(async ({ input }) => {
      await updateTaskSortOrders(input.items);
      return { success: true };
    }),

  // ─── Update Repeat Settings ────────────────────────────────────────────────
  updateRepeat: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        repeatType: z.enum(["none", "daily", "weekly", "monthly"]),
        repeatDays: z.array(z.number()).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await updateTask(input.id, {
        repeatType: input.repeatType,
        repeatDays: input.repeatDays ?? null,
      });
      return getTaskById(input.id);
    }),

  // ─── LINE Users ────────────────────────────────────────────────────────────
  lineUsers: protectedProcedure.query(async () => {
    return getAllLineUsers();
  }),

  lineUserByLineId: protectedProcedure
    .input(z.object({ lineUserId: z.string() }))
    .query(async ({ input }) => {
      return getLineUser(input.lineUserId);
    }),

  // ─── Get latest reply context ──────────────────────────────────────────────
  replyContext: protectedProcedure
    .input(z.object({ lineUserId: z.string() }))
    .query(async ({ input }) => {
      return getLatestReplyContext(input.lineUserId);
    }),

  // ─── Trigger reminder manually (admin) ────────────────────────────────────
  triggerReminder: adminProcedure.mutation(async () => {
    await sendMorningReminders();
    return { success: true };
  }),

  // ─── Create Task ───────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        note: z.string().nullable().optional(),
        priority: z.enum(["P1", "P2", "P3"]).optional(),
        category: z.string().optional(),
        dueDate: z.string().nullable().optional(),
        repeatType: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
        repeatDays: z.array(z.number()).nullable().optional(),
        folderId: z.number().nullable().optional(),
        projectId: z.number().nullable().optional(),
        parentTaskId: z.number().nullable().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const dueDate = input.dueDate ? new Date(input.dueDate) : null;
      const task = await createTask({
        title: input.title,
        note: input.note ?? null,
        priority: input.priority,
        category: input.category,
        dueDate,
        repeatType: input.repeatType,
        repeatDays: input.repeatDays ?? null,
        lineUserId: "web",
        projectId: input.projectId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        sortOrder: input.sortOrder ?? 0,
      });
      // folderId は別途 update
      if (task && input.folderId != null) {
        await updateTask(task.id, { folderId: input.folderId });
        return getTaskById(task.id);
      }
      return task;
    }),

  // ─── Bulk Move to Folder ─────────────────────────────────────────────────────────
  bulkMoveToFolder: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.number()).min(1),
        folderId: z.number().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const count = await bulkMoveTasksToFolder(input.ids, input.folderId);
      return { success: true, count };
    }),

  // ─── Stats ───────────────────────────────────────────────────────────────────────────────
  stats: protectedProcedure.query(async () => {
    const all = await getAllTasks();
    const total = all.length;
    const done = all.filter((t) => t.status === "done").length;
    const todo = all.filter((t) => t.status === "todo").length;
    const doing = all.filter((t) => t.status === "doing").length;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = all.filter(
      (t) => t.status !== "done" && t.dueDate && String(t.dueDate) < today
    ).length;
    const dueToday = all.filter(
      (t) => t.status !== "done" && t.dueDate && String(t.dueDate) === today
    ).length;
    return { total, done, todo, doing, overdue, dueToday };
  }),
});
