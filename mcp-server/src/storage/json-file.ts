import { readFile, writeFile, unlink, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./paths.js";

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    if (error instanceof SyntaxError) {
      // Corrupt JSON file - treat as missing
      console.error(`Corrupt JSON file, treating as missing: ${filePath}`);
      return null;
    }
    throw error;
  }
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function existsJson(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function deleteJson(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    // File doesn't exist, that's fine
  }
}

export async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files
      .filter((file) => file.endsWith(".json"))
      .map((file) => path.join(dir, file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
