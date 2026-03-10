CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(128) NOT NULL,
	`description` text,
	`status` enum('active','completed','on_hold') NOT NULL DEFAULT 'active',
	`color` varchar(32) NOT NULL DEFAULT 'violet',
	`dueDate` date,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notes` ADD `projectId` int;--> statement-breakpoint
ALTER TABLE `tasks` ADD `projectId` int;