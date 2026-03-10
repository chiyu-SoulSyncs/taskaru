import { and, desc, eq, isNull, like, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertTask,
  InsertUser,
  InsertFolder,
  InsertNote,
  InsertKpi,
  lineUsers,
  messages,
  replyContexts,
  tasks,
  folders,
  notes,
  projects,
  users,
  kpis,
  appSettings,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── LINE Users ───────────────────────────────────────────────────────────────

export async function upsertLineUser(lineUserId: string, displayName?: string, appUserId?: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(lineUsers)
    .values({ lineUserId, displayName: displayName ?? null, appUserId: appUserId ?? null })
    .onDuplicateKeyUpdate({
      set: {
        displayName: displayName ?? null,
        ...(appUserId !== undefined ? { appUserId } : {}),
      },
    });
}

export async function getLineUser(lineUserId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(lineUsers).where(eq(lineUsers.lineUserId, lineUserId)).limit(1);
  return result[0];
}

export async function getAllLineUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(lineUsers);
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function insertMessage(data: {
  lineUserId: string;
  sourceMessageId: string;
  rawText: string;
}) {
  const db = await getDb();
  if (!db) return null;
  try {
    await db.insert(messages).values(data);
    return true;
  } catch (e: unknown) {
    // Duplicate entry → already processed
    if (e instanceof Error && e.message.includes("Duplicate")) return false;
    throw e;
  }
}

export async function markMessageProcessed(sourceMessageId: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(messages).set({ processed: 1 }).where(eq(messages.sourceMessageId, sourceMessageId));
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function insertTasks(data: InsertTask[]) {
  const db = await getDb();
  if (!db) return [];
  await db.insert(tasks).values(data);
  // Return inserted tasks by sourceMessageId
  const sourceId = data[0]?.sourceMessageId;
  if (!sourceId) return [];
  return db.select().from(tasks).where(eq(tasks.sourceMessageId, sourceId)).orderBy(tasks.createdAt);
}

export async function createTask(data: {
  title: string;
  note?: string | null;
  priority?: "P1" | "P2" | "P3";
  category?: string;
  dueDate?: Date | null;
  repeatType?: "none" | "daily" | "weekly" | "monthly";
  repeatDays?: number[] | null;
  lineUserId?: string;
  appUserId?: number | null;
  sortOrder?: number;
  projectId?: number | null;
  parentTaskId?: number | null;
}) {
  const db = await getDb();
  if (!db) return null;
  const insertData: InsertTask = {
    title: data.title,
    note: data.note ?? null,
    priority: data.priority ?? "P2",
    category: data.category ?? "その他",
    dueDate: data.dueDate ?? null,
    repeatType: data.repeatType ?? "none",
    repeatDays: data.repeatDays ?? null,
    lineUserId: data.lineUserId ?? "web",
    appUserId: data.appUserId ?? null,
    sortOrder: data.sortOrder ?? 0,
    status: "todo",
    projectId: data.projectId ?? null,
    parentTaskId: data.parentTaskId ?? null,
  };
  const result = await db.insert(tasks).values(insertData);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertId = (result as any)[0]?.insertId;
  if (!insertId) return null;
  return getTaskById(insertId);
}

export async function getRepeatableCompletedTasks() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.status, "done"),
        sql`${tasks.repeatType} != 'none'`
      )
    );
}

export async function getTaskById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return result[0];
}

export async function getTasksByLineUser(
  lineUserId: string,
  opts?: {
    status?: string;
    priority?: string;
    category?: string;
    search?: string;
    dueDateFilter?: string;
    sortBy?: string;
    limit?: number;
  }
) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(tasks.lineUserId, lineUserId)];

  if (opts?.status && opts.status !== "all") {
    conditions.push(eq(tasks.status, opts.status as "todo" | "doing" | "done"));
  }
  if (opts?.priority && opts.priority !== "all") {
    conditions.push(eq(tasks.priority, opts.priority as "P1" | "P2" | "P3"));
  }
  if (opts?.category && opts.category !== "all") {
    conditions.push(eq(tasks.category, opts.category));
  }
  if (opts?.search) {
    conditions.push(
      or(
        like(tasks.title, `%${opts.search}%`),
        like(tasks.note, `%${opts.search}%`)
      )!
    );
  }
  if (opts?.dueDateFilter === "overdue") {
    conditions.push(sql`${tasks.dueDate} < CURDATE()`);
  } else if (opts?.dueDateFilter === "today") {
    conditions.push(sql`${tasks.dueDate} = CURDATE()`);
  } else if (opts?.dueDateFilter === "week") {
    conditions.push(sql`${tasks.dueDate} BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`);
  } else if (opts?.dueDateFilter === "none") {
    conditions.push(isNull(tasks.dueDate));
  }

  const query = db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(
      sql`CASE WHEN ${tasks.dueDate} IS NULL THEN 1 ELSE 0 END`,
      tasks.dueDate,
      sql`CASE ${tasks.priority} WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 END`,
      desc(tasks.createdAt)
    )
    .limit(opts?.limit ?? 200);

  return query;
}

export async function getAllTasks(opts?: {
  status?: string;
  priority?: string;
  category?: string;
  search?: string;
  dueDateFilter?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: ReturnType<typeof eq>[] = [];

  if (opts?.status && opts.status !== "all") {
    conditions.push(eq(tasks.status, opts.status as "todo" | "doing" | "done"));
  }
  if (opts?.priority && opts.priority !== "all") {
    conditions.push(eq(tasks.priority, opts.priority as "P1" | "P2" | "P3"));
  }
  if (opts?.category && opts.category !== "all") {
    conditions.push(eq(tasks.category, opts.category));
  }

  const searchConditions = [];
  if (opts?.search) {
    searchConditions.push(
      or(like(tasks.title, `%${opts.search}%`), like(tasks.note, `%${opts.search}%`))!
    );
  }
  if (opts?.dueDateFilter === "overdue") {
    searchConditions.push(sql`${tasks.dueDate} < CURDATE()`);
  } else if (opts?.dueDateFilter === "today") {
    searchConditions.push(sql`${tasks.dueDate} = CURDATE()`);
  } else if (opts?.dueDateFilter === "week") {
    searchConditions.push(
      sql`${tasks.dueDate} BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`
    );
  } else if (opts?.dueDateFilter === "none") {
    searchConditions.push(isNull(tasks.dueDate));
  }

  const allConditions = [...conditions, ...searchConditions];

  return db
    .select()
    .from(tasks)
    .where(allConditions.length > 0 ? and(...allConditions) : undefined)
    .orderBy(
      sql`CASE WHEN ${tasks.dueDate} IS NULL THEN 1 ELSE 0 END`,
      tasks.dueDate,
      sql`CASE ${tasks.priority} WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 END`,
      desc(tasks.createdAt)
    );
}

export async function updateTask(
  id: number,
  data: Partial<{
    title: string;
    note: string | null;
    status: "todo" | "doing" | "done";
    priority: "P1" | "P2" | "P3";
    category: string;
    dueDate: Date | null;
    sortOrder: number;
    repeatType: "none" | "daily" | "weekly" | "monthly";
    repeatDays: number[] | null;
    folderId: number | null;
    projectId: number | null;
    parentTaskId: number | null;
  }>
) {
  const db = await getDb();
  if (!db) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.update(tasks).set(data as any).where(eq(tasks.id, id));
}

export async function deleteTask(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(tasks).where(eq(tasks.id, id));
}

export async function deleteTasks(ids: number[]) {
  const db = await getDb();
  if (!db) return;
  if (ids.length === 0) return;
  await db.delete(tasks).where(sql`${tasks.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
}

export async function updateTaskSortOrders(items: { id: number; sortOrder: number }[]) {
  const db = await getDb();
  if (!db) return;
  await Promise.all(
    items.map(({ id, sortOrder }) =>
      db.update(tasks).set({ sortOrder }).where(eq(tasks.id, id))
    )
  );
}

export async function bulkMoveTasksToFolder(ids: number[], folderId: number | null) {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;
  await db
    .update(tasks)
    .set({ folderId })
    .where(sql`${tasks.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  return ids.length;
}

export async function getPendingTasksForReminder(lineUserId: string) {
  const db = await getDb();
  if (!db) return [];
  // lineUserId一致のタスク + Webから登録したタスク(lineUserId='web')を両方含める
  return db
    .select()
    .from(tasks)
    .where(
      and(
        or(eq(tasks.lineUserId, lineUserId), eq(tasks.lineUserId, "web")),
        ne(tasks.status, "done")
      )
    )
    .orderBy(
      sql`CASE WHEN ${tasks.dueDate} IS NULL THEN 1 ELSE 0 END`,
      tasks.dueDate,
      sql`CASE ${tasks.priority} WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 END`,
      desc(tasks.createdAt)
    )
    .limit(15);
}

// ─── Reply Contexts ───────────────────────────────────────────────────────────

export async function saveReplyContext(lineUserId: string, taskIds: number[]) {
  const db = await getDb();
  if (!db) return;
  await db.insert(replyContexts).values({ lineUserId, taskIds });
}

export async function getLatestReplyContext(lineUserId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(replyContexts)
    .where(eq(replyContexts.lineUserId, lineUserId))
    .orderBy(desc(replyContexts.createdAt))
    .limit(1);
  return result[0];
}

// ─── Folders ──────────────────────────────────────────────────────────────────

export async function getAllFolders() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(folders).orderBy(folders.sortOrder, folders.createdAt);
}

export async function createFolder(data: InsertFolder) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(folders).values(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertId = (result as any)[0]?.insertId;
  if (!insertId) return null;
  const rows = await db.select().from(folders).where(eq(folders.id, insertId)).limit(1);
  return rows[0] ?? null;
}

export async function updateFolder(
  id: number,
  data: Partial<{ name: string; color: string; icon: string; sortOrder: number }>
) {
  const db = await getDb();
  if (!db) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.update(folders).set(data as any).where(eq(folders.id, id));
}

export async function deleteFolder(id: number) {
  const db = await getDb();
  if (!db) return;
  // Unlink tasks from this folder
  await db.update(tasks).set({ folderId: null }).where(eq(tasks.folderId, id));
  await db.delete(folders).where(eq(folders.id, id));
}

export async function moveTaskToFolder(taskId: number, folderId: number | null) {
  const db = await getDb();
  if (!db) return;
  await db.update(tasks).set({ folderId }).where(eq(tasks.id, taskId));
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function getAllNotes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notes).orderBy(desc(notes.createdAt));
}

export async function getNoteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  return result[0];
}

export async function createNote(data: InsertNote) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(notes).values(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertId = (result as any)[0]?.insertId;
  if (!insertId) return null;
  return getNoteById(insertId);
}

export async function updateNote(
  id: number,
  data: Partial<{ title: string; formattedText: string; tags: string[]; extractedTaskIds: number[]; taskCandidates: { title: string; priority: string; category: string }[] }>
) {
  const db = await getDb();
  if (!db) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.update(notes).set(data as any).where(eq(notes.id, id));
}

export async function deleteNote(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(notes).where(eq(notes.id, id));
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function getAllProjects() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).orderBy(projects.sortOrder, projects.createdAt);
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result[0];
}

export async function createProject(data: {
  title: string;
  description?: string | null;
  status?: "active" | "completed" | "on_hold";
  color?: string;
  dueDate?: Date | null;
  sortOrder?: number;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(projects).values({
    title: data.title,
    description: data.description ?? null,
    status: data.status ?? "active",
    color: data.color ?? "violet",
    dueDate: data.dueDate ?? null,
    sortOrder: data.sortOrder ?? 0,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertId = (result as any)[0]?.insertId;
  if (!insertId) return null;
  return getProjectById(insertId);
}

export async function updateProject(
  id: number,
  data: Partial<{
    title: string;
    description: string | null;
    status: "active" | "completed" | "on_hold";
    color: string;
    dueDate: Date | null;
    sortOrder: number;
  }>
) {
  const db = await getDb();
  if (!db) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.update(projects).set(data as any).where(eq(projects.id, id));
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) return;
  // Unlink tasks and notes from this project
  await db.update(tasks).set({ projectId: null }).where(eq(tasks.projectId, id));
  await db.update(notes).set({ projectId: null }).where(eq(notes.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
}

export async function getProjectProgress(projectId: number) {
  const db = await getDb();
  if (!db) return { total: 0, done: 0, percent: 0 };
  const all = await db.select().from(tasks).where(eq(tasks.projectId, projectId));
  const total = all.length;
  const done = all.filter((t) => t.status === "done").length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, percent };
}

export async function getTasksByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  // 親タスクのみ取得（parentTaskId IS NULL）、sortOrder順
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentTaskId)))
    .orderBy(tasks.sortOrder, desc(tasks.createdAt));
}

export async function getSubTasksByParent(parentTaskId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.parentTaskId, parentTaskId))
    .orderBy(tasks.sortOrder, desc(tasks.createdAt));
}

export async function getAllTasksByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(tasks.sortOrder, desc(tasks.createdAt));
}

export async function getNotesByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notes).where(eq(notes.projectId, projectId)).orderBy(desc(notes.createdAt));
}

export async function moveTaskToProject(taskId: number, projectId: number | null) {
  const db = await getDb();
  if (!db) return;
  await db.update(tasks).set({ projectId }).where(eq(tasks.id, taskId));
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export async function getKpisByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(kpis).where(eq(kpis.projectId, projectId)).orderBy(kpis.createdAt);
}

export async function createKpi(data: InsertKpi) {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(kpis).values(data);
  const id = (result as { insertId: number }).insertId;
  const [row] = await db.select().from(kpis).where(eq(kpis.id, id));
  return row ?? null;
}

export async function updateKpi(id: number, data: Partial<Omit<InsertKpi, "id" | "projectId" | "createdAt">>) {
  const db = await getDb();
  if (!db) return;
  await db.update(kpis).set(data).where(eq(kpis.id, id));
}

export async function deleteKpi(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(kpis).where(eq(kpis.id, id));
}

// ─── App Settings (KV store) ──────────────────────────────────────────────────
export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return row?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(appSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}
