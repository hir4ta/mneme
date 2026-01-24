import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getPatternsDir, getSafeFilePath, validateId } from "./paths";
import type { Pattern, PatternItem, User } from "./types";

/**
 * Sanitize username for safe file path usage
 */
function sanitizeUserName(userName: string): string | null {
  const safeName = userName.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase();
  if (!validateId(safeName)) {
    return null;
  }
  return safeName;
}

export async function getPatterns(): Promise<Pattern[]> {
  const patternsDir = getPatternsDir();

  try {
    const files = await readdir(patternsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const patterns: Pattern[] = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(patternsDir, file);
        const content = await readFile(filePath, "utf-8");
        const pattern = JSON.parse(content) as Pattern;
        patterns.push(pattern);
      } catch {
        // Skip invalid files
      }
    }

    // Sort by updatedAt (most recent first)
    patterns.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return patterns;
  } catch {
    return [];
  }
}

export async function getPatternsByUser(userName: string): Promise<Pattern | null> {
  // Validate username to prevent path traversal
  const safeName = sanitizeUserName(userName);
  if (!safeName) {
    return null;
  }

  const filePath = getSafeFilePath(getPatternsDir(), safeName, ".json");
  if (!filePath) {
    return null;
  }

  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as Pattern;
  } catch {
    return null;
  }
}

export async function addPattern(
  user: User,
  patternItem: Omit<PatternItem, "id" | "detectedAt">
): Promise<Pattern | null> {
  // Validate username to prevent path traversal
  const safeName = sanitizeUserName(user.name);
  if (!safeName) {
    return null;
  }

  const patternsDir = getPatternsDir();
  await mkdir(patternsDir, { recursive: true });

  const filePath = getSafeFilePath(patternsDir, safeName, ".json");
  if (!filePath) {
    return null;
  }

  const existing = await getPatternsByUser(user.name);
  const now = new Date().toISOString();

  // Generate unique ID
  const existingIds = existing?.patterns.map((p) => p.id).filter(Boolean) || [];
  let counter = 1;
  let id = `pattern-${safeName}-${String(counter).padStart(3, "0")}`;
  while (existingIds.includes(id)) {
    counter++;
    id = `pattern-${safeName}-${String(counter).padStart(3, "0")}`;
  }

  const newPatternItem: PatternItem = {
    ...patternItem,
    id,
    detectedAt: now,
  };

  if (existing) {
    const updated: Pattern = {
      ...existing,
      patterns: [...existing.patterns, newPatternItem],
      updatedAt: now,
    };
    await writeFile(filePath, JSON.stringify(updated, null, 2));
    return updated;
  } else {
    const newPattern: Pattern = {
      id: `pattern-${safeName}`,
      user,
      patterns: [newPatternItem],
      updatedAt: now,
    };
    await writeFile(filePath, JSON.stringify(newPattern, null, 2));
    return newPattern;
  }
}

export async function removePattern(
  userName: string,
  patternId: string
): Promise<Pattern | null> {
  // Validate username to prevent path traversal
  const safeName = sanitizeUserName(userName);
  if (!safeName) {
    return null;
  }

  const filePath = getSafeFilePath(getPatternsDir(), safeName, ".json");
  if (!filePath) {
    return null;
  }

  const existing = await getPatternsByUser(userName);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: Pattern = {
    ...existing,
    patterns: existing.patterns.filter((p) => p.id !== patternId),
    updatedAt: now,
  };

  await writeFile(filePath, JSON.stringify(updated, null, 2));
  return updated;
}
