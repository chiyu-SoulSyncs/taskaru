import { TRPCError } from "@trpc/server";
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
  getProjectById,
} from "../db";
import { sendMorningReminders } from "../scheduler";
import { z } from "zod";

export const tasksRouter = router({
  // ─── Task List ─────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["todo", "doing", "done"]).optional(),
        priority: z.enum(["P1", "P2", "P3"]).optional(),
        category: z.string().max(64).optional(),
        search: z.string().max(200).optional(),
        dueDateFilter: z.string().max(20).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getAllTasks({ ...input, userId: ctx.user.id });
    }),

  // ─── Task by ID ────────────────────────────────────────────────────────────
  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const task = await getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      if (task.appUserId !== null && task.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return task;
    }),

  // ─── Sub-tasks by parent ───────────────────────────────────────────────────
  subTasks: protectedProcedure
    .input(z.object({ parentTaskId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Verify parent task belongs to user
      const parent = await getTaskById(input.parentTaskId);
      if (parent && parent.appUserId !== null && parent.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return getSubTasksByParent(input.parentTaskId);
    }),

  // ─── All tasks in a project (parent + children) ───────────────────────────
  allByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Verify project belongs to user
      const project = await getProjectById(input.projectId);
      if (project && project.appUserId !== null && project.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return getAllTasksByProject(input.projectId);
    }),

  // ─── Update Task ───────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(200).optional(),
        note: z.string().max(5000).nullable().optional(),
        status: z.enum(["todo", "doing", "done"]).optional(),
        priority: z.enum(["P1", "P2", "P3"]).optional(),
        category: z.string().max(64).optional(),
        dueDate: z.string().max(20).nullable().optional(),
        parentTaskId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, dueDate, ...rest } = input;
      const existing = await getTaskById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      if (existing.appUserId !== null && existing.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
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
    .mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      if (task.appUserId !== null && task.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      const newStatus = task.status === "done" ? "todo" : "done";
      await updateTask(input.id, { status: newStatus });
      return getTaskById(input.id);
    }),

  // ─── Delete Task ───────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      if (task.appUserId !== null && task.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      const subTasks = await getSubTasksByParent(input.id);
      if (subTasks.length > 0) {
        await deleteTasks(subTasks.map((t) => t.id));
      }
      await deleteTask(input.id);
      return { success: true };
    }),

  // ─── Delete Multiple Tasks ─────────────────────────────────────────────────
  deleteMany: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // Verify all tasks belong to user before deleting
      for (const id of input.ids) {
        const task = await getTaskById(id);
        if (task && task.appUserId !== null && task.appUserId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      }
      await deleteTasks(input.ids);
      return { success: true, count: input.ids.length };
    }),

  // ─── Update Sort Orders ────────────────────────────────────────────────────
  reorder: protectedProcedure
    .input(z.object({ items: z.array(z.object({ id: z.number(), sortOrder: z.number() })).max(500) }))
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
        repeatDays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      if (task.appUserId !== null && task.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await updateTask(input.id, {
        repeatType: input.repeatType,
        repeatDays: input.repeatDays ?? null,
      });
      return getTaskById(input.id);
    }),

  // ─── LINE Users ────────────────────────────────────────────────────────────
  lineUsers: adminProcedure.query(async () => {
    return getAllLineUsers();
  }),

  lineUserByLineId: adminProcedure
    .input(z.object({ lineUserId: z.string().max(128) }))
    .query(async ({ input }) => {
      return getLineUser(input.lineUserId);
    }),

  // ─── Get latest reply context ──────────────────────────────────────────────
  replyContext: adminProcedure
    .input(z.object({ lineUserId: z.string().max(128) }))
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
        title: z.string().min(1).max(200),
        note: z.string().max(5000).nullable().optional(),
        priority: z.enum(["P1", "P2", "P3"]).optional(),
        category: z.string().max(64).optional(),
        dueDate: z.string().max(20).nullable().optional(),
        repeatType: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
        repeatDays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
        folderId: z.number().nullable().optional(),
        projectId: z.number().nullable().optional(),
        parentTaskId: z.number().nullable().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
        appUserId: ctx.user.id,
        projectId: input.projectId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        sortOrder: input.sortOrder ?? 0,
      });
      if (task && input.folderId != null) {
        await updateTask(task.id, { folderId: input.folderId });
        return getTaskById(task.id);
      }
      return task;
    }),

  // ─── Bulk Move to Folder ─────────────────────────────────────────────────
  bulkMoveToFolder: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.number()).min(1).max(100),
        folderId: z.number().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const count = await bulkMoveTasksToFolder(input.ids, input.folderId);
      return { success: true, count };
    }),

  // ─── Stats ─────────────────────────────────────────────────────────────────
  stats: protectedProcedure.query(async ({ ctx }) => {
    const all = await getAllTasks({ userId: ctx.user.id });
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
