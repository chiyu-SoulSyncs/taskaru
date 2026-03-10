-- Add appUserId column to folders, notes, and projects for multi-tenant data isolation
ALTER TABLE `folders` ADD COLUMN `appUserId` int DEFAULT NULL;
ALTER TABLE `notes` ADD COLUMN `appUserId` int DEFAULT NULL;
ALTER TABLE `projects` ADD COLUMN `appUserId` int DEFAULT NULL;

-- Add indexes for efficient user-scoped queries
CREATE INDEX `idx_folders_appUserId` ON `folders` (`appUserId`);
CREATE INDEX `idx_notes_appUserId` ON `notes` (`appUserId`);
CREATE INDEX `idx_projects_appUserId` ON `projects` (`appUserId`);
CREATE INDEX `idx_tasks_appUserId` ON `tasks` (`appUserId`);
