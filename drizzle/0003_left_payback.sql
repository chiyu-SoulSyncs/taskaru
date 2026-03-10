CREATE TABLE `folders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`color` varchar(32) NOT NULL DEFAULT 'violet',
	`icon` varchar(32) NOT NULL DEFAULT 'folder',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`rawText` text NOT NULL,
	`formattedText` text NOT NULL,
	`tags` json,
	`extractedTaskIds` json,
	`sourceLineUserId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `folderId` int;