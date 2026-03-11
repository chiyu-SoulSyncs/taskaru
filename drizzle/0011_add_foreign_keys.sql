-- ============================================================================
-- Migration: Add foreign key constraints
-- ============================================================================
-- This migration:
-- 1. Cleans up orphaned records that would violate FK constraints
-- 2. Adds foreign key constraints with appropriate ON DELETE behavior
--
-- ON DELETE SET NULL: parent removed → child keeps existing, reference cleared
-- ON DELETE CASCADE:  parent removed → child is also deleted
-- ============================================================================

-- ─── Step 1: Clean up orphaned records ─────────────────────────────────────

-- Tasks referencing non-existent folders → clear folderId
UPDATE `tasks` SET `folderId` = NULL
WHERE `folderId` IS NOT NULL
  AND `folderId` NOT IN (SELECT `id` FROM `folders`);

-- Tasks referencing non-existent projects → clear projectId
UPDATE `tasks` SET `projectId` = NULL
WHERE `projectId` IS NOT NULL
  AND `projectId` NOT IN (SELECT `id` FROM `projects`);

-- Tasks referencing non-existent parent tasks → clear parentTaskId
UPDATE `tasks` SET `parentTaskId` = NULL
WHERE `parentTaskId` IS NOT NULL
  AND `parentTaskId` NOT IN (SELECT `id` FROM `tasks`);

-- Notes referencing non-existent projects → clear projectId
UPDATE `notes` SET `projectId` = NULL
WHERE `projectId` IS NOT NULL
  AND `projectId` NOT IN (SELECT `id` FROM `projects`);

-- KPIs referencing non-existent projects → delete orphans
DELETE FROM `kpis`
WHERE `projectId` NOT IN (SELECT `id` FROM `projects`);

-- line_users referencing non-existent app users → clear appUserId
UPDATE `line_users` SET `appUserId` = NULL
WHERE `appUserId` IS NOT NULL
  AND `appUserId` NOT IN (SELECT `id` FROM `users`);

-- line_linking_codes referencing non-existent app users → delete orphans
DELETE FROM `line_linking_codes`
WHERE `appUserId` NOT IN (SELECT `id` FROM `users`);

-- ─── Step 2: Add indexes for FK columns (improves JOIN/DELETE performance) ──

CREATE INDEX `idx_tasks_folderId` ON `tasks` (`folderId`);
CREATE INDEX `idx_tasks_projectId` ON `tasks` (`projectId`);
CREATE INDEX `idx_tasks_parentTaskId` ON `tasks` (`parentTaskId`);
CREATE INDEX `idx_notes_projectId` ON `notes` (`projectId`);
CREATE INDEX `idx_kpis_projectId` ON `kpis` (`projectId`);
CREATE INDEX `idx_line_users_appUserId` ON `line_users` (`appUserId`);

-- ─── Step 3: Add foreign key constraints ────────────────────────────────────

-- tasks.folderId → folders.id (folder deleted → task becomes uncategorized)
ALTER TABLE `tasks`
  ADD CONSTRAINT `fk_tasks_folder`
  FOREIGN KEY (`folderId`) REFERENCES `folders` (`id`)
  ON DELETE SET NULL;

-- tasks.projectId → projects.id (project deleted → task unlinked)
ALTER TABLE `tasks`
  ADD CONSTRAINT `fk_tasks_project`
  FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`)
  ON DELETE SET NULL;

-- tasks.parentTaskId → tasks.id (parent deleted → sub-tasks also deleted)
ALTER TABLE `tasks`
  ADD CONSTRAINT `fk_tasks_parent`
  FOREIGN KEY (`parentTaskId`) REFERENCES `tasks` (`id`)
  ON DELETE CASCADE;

-- notes.projectId → projects.id (project deleted → note unlinked)
ALTER TABLE `notes`
  ADD CONSTRAINT `fk_notes_project`
  FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`)
  ON DELETE SET NULL;

-- kpis.projectId → projects.id (project deleted → KPIs also deleted)
ALTER TABLE `kpis`
  ADD CONSTRAINT `fk_kpis_project`
  FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`)
  ON DELETE CASCADE;

-- line_users.appUserId → users.id (user deleted → LINE unlinked)
ALTER TABLE `line_users`
  ADD CONSTRAINT `fk_line_users_app_user`
  FOREIGN KEY (`appUserId`) REFERENCES `users` (`id`)
  ON DELETE SET NULL;

-- line_linking_codes.appUserId → users.id (user deleted → codes removed)
ALTER TABLE `line_linking_codes`
  ADD CONSTRAINT `fk_linking_codes_app_user`
  FOREIGN KEY (`appUserId`) REFERENCES `users` (`id`)
  ON DELETE CASCADE;
