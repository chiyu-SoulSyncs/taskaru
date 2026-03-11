import { z } from "zod";
import { notifyOwner } from "./notification";
import { getLinkedLineUsers } from "../db";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const linkedUsers = await getLinkedLineUsers(ctx.user.id);
      const adminLineUserId = linkedUsers[0]?.lineUserId;
      const delivered = await notifyOwner(input, adminLineUserId);
      return {
        success: delivered,
      } as const;
    }),
});
