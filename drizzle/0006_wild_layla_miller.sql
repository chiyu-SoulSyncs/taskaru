CREATE TABLE `kpis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`title` varchar(128) NOT NULL,
	`unit` varchar(32) NOT NULL DEFAULT '',
	`targetValue` double NOT NULL,
	`currentValue` double NOT NULL DEFAULT 0,
	`dueDate` date,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpis_id` PRIMARY KEY(`id`)
);
