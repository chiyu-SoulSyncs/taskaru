import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  date,
  double,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * LINE user mapping table: associates LINE userId with app userId
 */
export const lineUsers = mysqlTable("line_users", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull().unique(),
  appUserId: int("appUserId"),
  displayName: text("displayName"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LineUser = typeof lineUsers.$inferSelect;

/**
 * Raw LINE messages received via webhook (for idempotency)
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  sourceMessageId: varchar("sourceMessageId", { length: 128 }).notNull().unique(),
  rawText: text("rawText").notNull(),
  processed: int("processed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;

/**
 * Tasks extracted from LINE messages by LLM
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  appUserId: int("appUserId"),
  title: text("title").notNull(),
  note: text("note"),
  status: mysqlEnum("status", ["todo", "doing", "done"]).default("todo").notNull(),
  priority: mysqlEnum("priority", ["P1", "P2", "P3"]).default("P2").notNull(),
  category: varchar("category", { length: 64 }).default("その他").notNull(),
  dueDate: date("dueDate"),
  sourceMessageId: varchar("sourceMessageId", { length: 128 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  repeatType: mysqlEnum("repeatType", ["none", "daily", "weekly", "monthly"]).default("none").notNull(),
  repeatDays: json("repeatDays"), // array of weekday numbers 0-6 for weekly repeat
  folderId: int("folderId"), // nullable foreign key to folders (legacy)
  projectId: int("projectId"), // nullable foreign key to projects
  parentTaskId: int("parentTaskId"), // nullable foreign key to parent task (for sub-tasks)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * Folders for organizing tasks (kept for backward compatibility)
 */
export const folders = mysqlTable("folders", {
  id: int("id").autoincrement().primaryKey(),
  appUserId: int("appUserId"),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 32 }).default("violet").notNull(),
  icon: varchar("icon", { length: 32 }).default("folder").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = typeof folders.$inferInsert;

/**
 * Projects: big-theme containers that group tasks and notes
 */
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  appUserId: int("appUserId"),
  title: varchar("title", { length: 128 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "completed", "on_hold"]).default("active").notNull(),
  color: varchar("color", { length: 32 }).default("violet").notNull(),
  dueDate: date("dueDate"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * AI-formatted notes (raw input → structured Markdown)
 */
export const notes = mysqlTable("notes", {
  id: int("id").autoincrement().primaryKey(),
  appUserId: int("appUserId"),
  title: varchar("title", { length: 256 }).notNull(),
  rawText: text("rawText").notNull(),
  formattedText: text("formattedText").notNull(),
  tags: json("tags"), // string[]
  extractedTaskIds: json("extractedTaskIds"), // number[] - task IDs created from this note
  taskCandidates: json("taskCandidates"), // {title,priority,category}[] - AI-extracted candidates (not yet added as tasks)
  sourceLineUserId: varchar("sourceLineUserId", { length: 128 }),
  projectId: int("projectId"), // nullable foreign key to projects
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Note = typeof notes.$inferSelect;
export type InsertNote = typeof notes.$inferInsert;

/**
 * Reply contexts: maps reply numbers to task IDs for done/undo commands
 */
export const replyContexts = mysqlTable("reply_contexts", {
  id: int("id").autoincrement().primaryKey(),
  lineUserId: varchar("lineUserId", { length: 128 }).notNull(),
  taskIds: json("taskIds").notNull(), // ordered array of task IDs
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReplyContext = typeof replyContexts.$inferSelect;

/**
 * KPIs: measurable goals attached to a project
 */
export const kpis = mysqlTable("kpis", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  title: varchar("title", { length: 128 }).notNull(),
  unit: varchar("unit", { length: 32 }).default("").notNull(), // e.g. "%", "件", "万円"
  targetValue: double("targetValue").notNull(),
  currentValue: double("currentValue").default(0).notNull(),
  dueDate: date("dueDate"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Kpi = typeof kpis.$inferSelect;
export type InsertKpi = typeof kpis.$inferInsert;

/**
 * App settings: key-value store for application-level configuration
 */
export const appSettings = mysqlTable("app_settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AppSetting = typeof appSettings.$inferSelect;
