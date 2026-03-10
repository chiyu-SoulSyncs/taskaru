import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  moveTaskToFolder,
} from "../db";
import { z } from "zod";

export const foldersRouter = router({
  // List all folders
  list: protectedProcedure.query(async () => {
    return getAllFolders();
  }),

  // Create folder
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(64),
        color: z.string().optional(),
        icon: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return createFolder({
        name: input.name,
        color: input.color ?? "violet",
        icon: input.icon ?? "folder",
        sortOrder: 0,
      });
    }),

  // Update folder
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(64).optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateFolder(id, data);
      const all = await getAllFolders();
      return all.find((f) => f.id === id) ?? null;
    }),

  // Delete folder (unlinks tasks)
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteFolder(input.id);
      return { success: true };
    }),

  // Move task to folder (or remove from folder with null)
  moveTask: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        folderId: z.number().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      await moveTaskToFolder(input.taskId, input.folderId);
      return { success: true };
    }),
});
