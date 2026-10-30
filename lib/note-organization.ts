export type Folder = { id: string; name: string };
export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(tag => typeof tag !== "string")) throw new Error("Tags must be a list of names.");
  const tags = [...new Set((value as string[]).map(tag => tag.trim().toLowerCase()).filter(Boolean))];
  if (tags.length > 10 || tags.some(tag => tag.length > 24 || /[,\r\n]/.test(tag))) throw new Error("Use up to 10 tags, each 24 characters or fewer, without commas or line breaks.");
  return tags;
}
