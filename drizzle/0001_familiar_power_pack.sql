CREATE TABLE `line_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`appUserId` int,
	`displayName` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `line_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `line_users_lineUserId_unique` UNIQUE(`lineUserId`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`sourceMessageId` varchar(128) NOT NULL,
	`rawText` text NOT NULL,
	`processed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `messages_sourceMessageId_unique` UNIQUE(`sourceMessageId`)
);
--> statement-breakpoint
CREATE TABLE `reply_contexts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`taskIds` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reply_contexts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`appUserId` int,
	`title` text NOT NULL,
	`note` text,
	`status` enum('todo','doing','done') NOT NULL DEFAULT 'todo',
	`priority` enum('P1','P2','P3') NOT NULL DEFAULT 'P2',
	`category` varchar(64) NOT NULL DEFAULT 'その他',
	`dueDate` date,
	`sourceMessageId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
