CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`noteId` text NOT NULL,
	`ownerId` text NOT NULL,
	`filename` text NOT NULL,
	`storageKey` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`noteId`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_note` ON `attachments` (`noteId`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`participantId` text NOT NULL,
	`kind` text NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_participant` ON `events` (`participantId`);--> statement-breakpoint
CREATE INDEX `events_date` ON `events` (`createdAt`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'Personal' NOT NULL,
	`color` text DEFAULT 'cream' NOT NULL,
	`starred` integer DEFAULT 0 NOT NULL,
	`shareToken` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_shareToken_unique` ON `notes` (`shareToken`);--> statement-breakpoint
CREATE INDEX `notes_owner` ON `notes` (`ownerId`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`consentVersion` text NOT NULL,
	`ageBand` text DEFAULT 'Unknown' NOT NULL,
	`gender` text DEFAULT 'Unknown' NOT NULL,
	`country` text DEFAULT 'Unknown' NOT NULL,
	`geoCountry` text DEFAULT 'Unknown' NOT NULL,
	`education` text DEFAULT 'Unknown' NOT NULL,
	`purpose` text DEFAULT 'Unknown' NOT NULL,
	`device` text NOT NULL,
	`language` text NOT NULL,
	`surveyed` integer DEFAULT 0 NOT NULL,
	`createdAt` text NOT NULL,
	`lastSeen` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
