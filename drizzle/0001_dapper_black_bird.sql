CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`name` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folders_owner_name` ON `folders` (`ownerId`,`name`);--> statement-breakpoint
ALTER TABLE `notes` ADD `folderId` text REFERENCES folders(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `tags` text DEFAULT '[]' NOT NULL;