import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllFolders,
  getFolderById,
  createFolder,
  updateFolder,
  deleteFolder,
} from "../db";
import { z } from "zod";

export const foldersRouter = router({
  // List all folders (user-scoped)
  list: protectedProcedure.query(async ({ ctx }) => {
    return getAllFolders(ctx.user.id);
  }),

  // Create folder
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(64),
        color: z.string().max(32).optional(),
        icon: z.string().max(32).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return createFolder({
        name: input.name,
        color: input.color ?? "violet",
        icon: input.icon ?? "folder",
        sortOrder: 0,
        appUserId: ctx.user.id,
      });
    }),

  // Update folder
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(64).optional(),
        color: z.string().max(32).optional(),
        icon: z.string().max(32).optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const folder = await getFolderById(id);
      if (!folder) throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
      if (folder.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await updateFolder(id, data);
      const all = await getAllFolders(ctx.user.id);
      return all.find((f) => f.id === id) ?? null;
    }),

  // Delete folder (unlinks tasks)
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const folder = await getFolderById(input.id);
      if (!folder) throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
      if (folder.appUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await deleteFolder(input.id);
      return { success: true };
    }),

});
