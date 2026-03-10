import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createLinkingCode,
  getLinkedLineUsers,
  unlinkLineUser,
} from "../db";

export const lineLinkingRouter = router({
  /**
   * Generate a one-time linking code for the authenticated user.
   * The user sends this code to the LINE bot to link their accounts.
   * Code expires in 5 minutes and can only be used once.
   */
  generateCode: protectedProcedure.mutation(async ({ ctx }) => {
    const code = await createLinkingCode(ctx.user.id);
    if (!code) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "コードの生成に失敗しました",
      });
    }
    return { code, expiresInSeconds: 300 };
  }),

  /**
   * Get the LINE accounts linked to the current user.
   */
  linkedAccounts: protectedProcedure.query(async ({ ctx }) => {
    return getLinkedLineUsers(ctx.user.id);
  }),

  /**
   * Unlink a LINE account from the current user.
   */
  unlink: protectedProcedure
    .input(z.object({ lineUserId: z.string().max(128) }))
    .mutation(async ({ ctx, input }) => {
      const success = await unlinkLineUser(input.lineUserId, ctx.user.id);
      if (!success) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "このLINEアカウントは連携されていません",
        });
      }
      return { success: true };
    }),
});
