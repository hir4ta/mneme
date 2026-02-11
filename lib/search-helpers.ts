import * as fs from "node:fs";
import * as path from "node:path";
import { levenshtein } from "./fuzzy-search.js";

export interface TagDefinition {
  id: string;
  label: string;
  aliases?: string[];
}

export interface TagsFile {
  tags: TagDefinition[];
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(new RegExp(pattern.source, "gi"));
  return matches ? matches.length : 0;
}

export function fieldScore(
  text: string | undefined,
  pattern: RegExp,
  baseScore: number,
): number {
  if (!text) return 0;
  const count = countMatches(text, pattern);
  if (count === 0) return 0;
  return baseScore + (count > 1 ? Math.log2(count) * 0.5 : 0);
}

export function isFuzzyMatch(
  word: string,
  target: string,
  maxDistance = 2,
): boolean {
  if (word.length < 4) return false;
  const distance = levenshtein(word.toLowerCase(), target.toLowerCase());
  const threshold = Math.min(maxDistance, Math.floor(word.length / 3));
  return distance <= threshold;
}

export function loadTags(mnemeDir: string): TagsFile | null {
  const tagsPath = path.join(mnemeDir, "tags.json");
  if (!fs.existsSync(tagsPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(tagsPath, "utf-8")) as TagsFile;
  } catch {
    return null;
  }
}

export function expandKeywordsWithAliases(
  keywords: string[],
  tags: TagsFile | null,
): string[] {
  if (!tags) return keywords;

  const expanded = new Set(keywords.map((k) => k.toLowerCase()));
  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    for (const tag of tags.tags) {
      const matches =
        tag.id.toLowerCase() === lowerKeyword ||
        tag.label.toLowerCase() === lowerKeyword ||
        tag.aliases?.some((alias) => alias.toLowerCase() === lowerKeyword);
      if (!matches) continue;
      expanded.add(tag.id.toLowerCase());
      expanded.add(tag.label.toLowerCase());
      for (const alias of tag.aliases || []) {
        expanded.add(alias.toLowerCase());
      }
    }
  }

  return Array.from(expanded);
}

export function walkJsonFiles(
  dir: string,
  callback: (filePath: string) => void,
): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(fullPath, callback);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      callback(fullPath);
    }
  }
}
