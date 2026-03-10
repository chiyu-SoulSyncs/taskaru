import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { tasksRouter } from "./routers/tasks";
import { notesRouter } from "./routers/notes";
import { foldersRouter } from "./routers/folders";
import { projectsRouter } from "./routers/projects";
import { kpisRouter } from "./routers/kpis";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  tasks: tasksRouter,
  notes: notesRouter,
  folders: foldersRouter,
  projects: projectsRouter,
  kpis: kpisRouter,
});

export type AppRouter = typeof appRouter;
