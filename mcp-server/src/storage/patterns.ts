import { getPatternsDir, getPatternPath } from "./paths.js";
import { readJson, writeJson, listJsonFiles } from "./json-file.js";
import { generatePatternId } from "./id.js";
import {
  PatternSchema,
  AddPatternInputSchema,
  type Pattern,
  type PatternItem,
  type AddPatternInput,
  type User,
} from "../schemas/index.js";

export async function getPatternsByUser(user: User): Promise<Pattern | null> {
  const filePath = getPatternPath(user.name);
  const data = await readJson<Pattern>(filePath);

  if (!data) {
    return null;
  }

  return PatternSchema.parse(data);
}

export async function addPattern(
  user: User,
  patternInput: AddPatternInput
): Promise<Pattern> {
  const validated = AddPatternInputSchema.parse(patternInput);

  const now = new Date().toISOString();

  // Get existing or create new
  const existing = await getPatternsByUser(user);

  // Generate unique ID based on existing pattern items
  const existingItemIds = existing?.patterns
    .map((p) => p.id)
    .filter((id): id is string => id !== undefined) || [];
  const patternId = await generatePatternId(user.name, existingItemIds);

  const newPatternItem: PatternItem = {
    ...validated,
    id: patternId,
    detectedAt: now,
  };
  const filePath = getPatternPath(user.name);

  if (existing) {
    const updated: Pattern = {
      ...existing,
      patterns: [...existing.patterns, newPatternItem],
      updatedAt: now,
    };

    PatternSchema.parse(updated);
    await writeJson(filePath, updated);
    return updated;
  } else {
    const safeName = user.name.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase();
    const newPattern: Pattern = {
      id: `pattern-${safeName}`,
      user,
      patterns: [newPatternItem],
      updatedAt: now,
    };

    PatternSchema.parse(newPattern);
    await writeJson(filePath, newPattern);
    return newPattern;
  }
}

export async function removePattern(
  user: User,
  patternId: string
): Promise<Pattern | null> {
  const existing = await getPatternsByUser(user);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: Pattern = {
    ...existing,
    patterns: existing.patterns.filter((p) => p.id !== patternId),
    updatedAt: now,
  };

  const filePath = getPatternPath(user.name);
  await writeJson(filePath, updated);
  return updated;
}

export async function listAllPatterns(): Promise<Pattern[]> {
  const files = await listJsonFiles(getPatternsDir());
  const patterns: Pattern[] = [];

  for (const file of files) {
    const data = await readJson<Pattern>(file);
    if (!data) continue;

    try {
      const pattern = PatternSchema.parse(data);
      patterns.push(pattern);
    } catch {
      console.error(`Skipping invalid pattern file: ${file}`);
    }
  }

  return patterns;
}
