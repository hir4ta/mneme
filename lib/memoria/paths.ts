import path from "node:path";

const MEMORIA_DIR = ".memoria";

// Security: Pattern for safe IDs (alphanumeric, underscore, hyphen only)
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate that an ID is safe for use in file paths
 */
export function validateId(id: string): boolean {
  return SAFE_ID_PATTERN.test(id) && id.length > 0 && id.length <= 100;
}

/**
 * Get a safe file path within a base directory, preventing path traversal
 * Returns null if the ID is invalid or the path would escape the base directory
 */
export function getSafeFilePath(
  baseDir: string,
  id: string,
  extension: ".json"
): string | null {
  if (!validateId(id)) {
    return null;
  }

  const resolvedBase = path.resolve(baseDir);
  const filePath = path.resolve(resolvedBase, `${id}${extension}`);

  // Use path.relative to check if filePath is within baseDir
  // If relative path starts with "..", it's outside the base directory
  const relative = path.relative(resolvedBase, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return filePath;
}

export function getProjectRoot(): string {
  // In development, use the current working directory
  // In production, this could be configured via environment variable
  return process.env.MEMORIA_PROJECT_ROOT || process.cwd();
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
  return path.join(getSessionsDir(), `${id}.json`);
}

export function getDecisionPath(id: string): string {
  return path.join(getDecisionsDir(), `${id}.json`);
}

export function getPatternPath(userName: string): string {
  const safeName = userName.replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(getPatternsDir(), `${safeName}.json`);
}

export function getRulesPath(): string {
  return path.join(getRulesDir(), "coding-standards.json");
}
