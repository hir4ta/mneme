import { randomBytes } from "node:crypto";
import { listJsonFiles } from "./json-file.js";
import { getDecisionsDir } from "./paths.js";

function generateRandomString(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function generateSessionId(): string {
  const dateStr = formatDate(new Date());
  const randomStr = generateRandomString(6);
  return `${dateStr}_${randomStr}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .slice(0, 50); // Limit length
}

export async function generateDecisionId(title: string): Promise<string> {
  const slug = slugify(title);
  const existingFiles = await listJsonFiles(getDecisionsDir());

  // Find existing decisions with similar slug
  const existingIds = existingFiles.map((f) => {
    const fileName = f.split("/").pop() || "";
    return fileName.replace(".json", "");
  });

  // Find next available number
  let counter = 1;
  let id = `${slug}-${String(counter).padStart(3, "0")}`;

  while (existingIds.includes(id)) {
    counter++;
    id = `${slug}-${String(counter).padStart(3, "0")}`;
  }

  return id;
}

export async function generatePatternId(
  userName: string,
  existingItemIds: string[] = []
): Promise<string> {
  const safeName = userName.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase();

  let counter = 1;
  let id = `pattern-${safeName}-${String(counter).padStart(3, "0")}`;

  while (existingItemIds.includes(id)) {
    counter++;
    id = `pattern-${safeName}-${String(counter).padStart(3, "0")}`;
  }

  return id;
}
