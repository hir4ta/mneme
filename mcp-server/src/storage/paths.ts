import path from "node:path";
import { mkdir } from "node:fs/promises";

export const MEMORIA_DIR = ".memoria";

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function assertSafeId(id: string, label: string): void {
  if (!SAFE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${label}: "${id}" (must match ${SAFE_ID_PATTERN})`);
  }
}

export function getProjectRoot(): string {
  return process.cwd();
}

export function getMemoriaDir(): string {
  return path.join(getProjectRoot(), MEMORIA_DIR);
}

export function getSessionsDir(): string {
  return path.join(getMemoriaDir(), "sessions");
}

export function getDecisionsDir(): string {
  return path.join(getMemoriaDir(), "decisions");
}

export function getPatternsDir(): string {
  return path.join(getMemoriaDir(), "patterns");
}

export function getRulesDir(): string {
  return path.join(getMemoriaDir(), "rules");
}

export function getSessionPath(id: string): string {
  assertSafeId(id, "session id");
  return path.join(getSessionsDir(), `${id}.json`);
}

export function getDecisionPath(id: string): string {
  assertSafeId(id, "decision id");
  return path.join(getDecisionsDir(), `${id}.json`);
}

export function getPatternPath(user: string): string {
  // Sanitize username for file path
  const safeName = user.replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(getPatternsDir(), `${safeName}.json`);
}

export function getRulesPath(): string {
  return path.join(getRulesDir(), "coding-standards.json");
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function ensureMemoriaStructure(): Promise<void> {
  await Promise.all([
    ensureDir(getSessionsDir()),
    ensureDir(getDecisionsDir()),
    ensureDir(getPatternsDir()),
    ensureDir(getRulesDir()),
  ]);
}
