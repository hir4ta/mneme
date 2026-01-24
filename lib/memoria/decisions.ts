import { readFile, readdir, writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { getDecisionsDir, getSafeFilePath, validateId } from "./paths";
import type { Decision } from "./types";

export async function getDecisions(): Promise<Decision[]> {
  const decisionsDir = getDecisionsDir();

  try {
    const files = await readdir(decisionsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const decisions: Decision[] = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(decisionsDir, file);
        const content = await readFile(filePath, "utf-8");
        const decision = JSON.parse(content) as Decision;
        decisions.push(decision);
      } catch {
        // Skip invalid files
      }
    }

    // Sort by createdAt (most recent first)
    decisions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return decisions;
  } catch {
    return [];
  }
}

export async function getDecision(id: string): Promise<Decision | null> {
  // Validate ID to prevent path traversal
  const filePath = getSafeFilePath(getDecisionsDir(), id, ".json");
  if (!filePath) {
    return null;
  }

  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as Decision;
  } catch {
    return null;
  }
}

export async function createDecision(
  data: Omit<Decision, "id" | "createdAt">
): Promise<Decision | null> {
  const decisionsDir = getDecisionsDir();
  await mkdir(decisionsDir, { recursive: true });

  // Generate safe slug from title
  const slug = data.title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50);

  // Find next available number
  const files = await readdir(decisionsDir).catch(() => []);
  const existingIds = files.map((f) => f.replace(".json", ""));

  let counter = 1;
  let id = `${slug}-${String(counter).padStart(3, "0")}`;
  while (existingIds.includes(id)) {
    counter++;
    id = `${slug}-${String(counter).padStart(3, "0")}`;
  }

  // Validate generated ID
  if (!validateId(id)) {
    return null;
  }

  const filePath = getSafeFilePath(decisionsDir, id, ".json");
  if (!filePath) {
    return null;
  }

  const decision: Decision = {
    ...data,
    id,
    createdAt: new Date().toISOString(),
  };

  await writeFile(filePath, JSON.stringify(decision, null, 2));
  return decision;
}

export async function updateDecision(
  id: string,
  data: Partial<Decision>
): Promise<Decision | null> {
  // Validate ID to prevent path traversal
  const filePath = getSafeFilePath(getDecisionsDir(), id, ".json");
  if (!filePath) {
    return null;
  }

  const existing = await getDecision(id);
  if (!existing) return null;

  const updated = { ...existing, ...data };
  await writeFile(filePath, JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteDecision(id: string): Promise<boolean> {
  // Validate ID to prevent path traversal
  const filePath = getSafeFilePath(getDecisionsDir(), id, ".json");
  if (!filePath) {
    return false;
  }

  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
