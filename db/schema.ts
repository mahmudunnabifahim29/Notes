import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const settings = sqliteTable("settings", { key: text("key").primaryKey(), value: text("value").notNull() });
export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(), ownerId: text("ownerId").notNull(), name: text("name").notNull(),
  createdAt: text("createdAt").notNull(),
}, t => [uniqueIndex("folders_owner_name").on(t.ownerId, t.name)]);
export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(), ownerId: text("ownerId").notNull(), title: text("title").notNull(),
  content: text("content").notNull().default(""), category: text("category").notNull().default("Personal"),
  color: text("color").notNull().default("cream"), starred: integer("starred").notNull().default(0),
  folderId: text("folderId").references(() => folders.id, { onDelete: "set null" }),
  tags: text("tags").notNull().default("[]"),
  deletedAt: text("deletedAt"), purgePending: integer("purgePending").notNull().default(0),
  shareToken: text("shareToken").unique(), createdAt: text("createdAt").notNull(), updatedAt: text("updatedAt").notNull(),
}, t => [index("notes_owner").on(t.ownerId)]);
export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(), noteId: text("noteId").notNull().references(() => notes.id, { onDelete: "cascade" }),
  ownerId: text("ownerId").notNull(), filename: text("filename").notNull(), storageKey: text("storageKey").notNull(),
  mime: text("mime").notNull(), size: integer("size").notNull(), createdAt: text("createdAt").notNull(),
}, t => [index("attachments_note").on(t.noteId)]);
export const participants = sqliteTable("participants", {
  id: text("id").primaryKey(), consentVersion: text("consentVersion").notNull(),
  ageBand: text("ageBand").notNull().default("Unknown"), gender: text("gender").notNull().default("Unknown"),
  country: text("country").notNull().default("Unknown"), geoCountry: text("geoCountry").notNull().default("Unknown"),
  education: text("education").notNull().default("Unknown"), purpose: text("purpose").notNull().default("Unknown"),
  device: text("device").notNull(), language: text("language").notNull(), surveyed: integer("surveyed").notNull().default(0),
  createdAt: text("createdAt").notNull(), lastSeen: text("lastSeen").notNull(),
});
export const events = sqliteTable("events", {
  id: text("id").primaryKey(), participantId: text("participantId").notNull().references(() => participants.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), seconds: integer("seconds").notNull().default(0), createdAt: text("createdAt").notNull(),
}, t => [index("events_participant").on(t.participantId), index("events_date").on(t.createdAt)]);

// Account details are never joined to optional research participant records.
export const profiles = sqliteTable("profiles", {
 ownerId: text("ownerId").primaryKey(), phone: text("phone").notNull().default(""),
 addressLine1: text("addressLine1").notNull().default(""), addressLine2: text("addressLine2").notNull().default(""),
 city: text("city").notNull().default(""), region: text("region").notNull().default(""),
 postalCode: text("postalCode").notNull().default(""), country: text("country").notNull().default(""),
 organization: text("organization").notNull().default(""), jobTitle: text("jobTitle").notNull().default(""),
 website: text("website").notNull().default(""), bio: text("bio").notNull().default(""),
 photoKey: text("photoKey"), photoMime: text("photoMime"), photoVersion: text("photoVersion"),
 updatedAt: text("updatedAt").notNull(),
});
