ALTER TABLE `tasks` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repeatType` enum('none','daily','weekly','monthly') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repeatDays` json;