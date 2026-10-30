CREATE TABLE `profiles` (
	`ownerId` text PRIMARY KEY NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`addressLine1` text DEFAULT '' NOT NULL,
	`addressLine2` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`postalCode` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`organization` text DEFAULT '' NOT NULL,
	`jobTitle` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`photoKey` text,
	`photoMime` text,
	`photoVersion` text,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `notes` ADD `deletedAt` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `purgePending` integer DEFAULT 0 NOT NULL;