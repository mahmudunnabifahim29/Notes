CREATE TABLE `file_chunks` (
	`objectKey` text NOT NULL,
	`ordinal` integer NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`objectKey`, `ordinal`),
	FOREIGN KEY (`objectKey`) REFERENCES `file_objects`(`key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `file_objects` (
	`key` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`mime` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `file_storage_usage` (
	`id` integer PRIMARY KEY NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL
);

--> statement-breakpoint
INSERT INTO file_storage_usage (id,bytes) VALUES (1,0);
--> statement-breakpoint
CREATE TRIGGER file_storage_quota BEFORE INSERT ON file_objects
WHEN (SELECT bytes FROM file_storage_usage WHERE id=1)+NEW.size>104857600
BEGIN SELECT RAISE(ABORT,'NoteAtlas file storage is full'); END;
--> statement-breakpoint
CREATE TRIGGER file_storage_added AFTER INSERT ON file_objects
BEGIN UPDATE file_storage_usage SET bytes=bytes+NEW.size WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER file_storage_removed AFTER DELETE ON file_objects
BEGIN UPDATE file_storage_usage SET bytes=bytes-OLD.size WHERE id=1; END;
