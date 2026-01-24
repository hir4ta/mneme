import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TranscriptMessage } from "./types.js";

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export interface ParseTranscriptResult {
  messages: TranscriptMessage[];
  error?: string;
  invalidLines: number;
}

export async function parseTranscript(
  transcriptPath: string
): Promise<ParseTranscriptResult> {
  try {
    const content = await readFile(transcriptPath, "utf-8");
    const lines = content.trim().split("\n");
    const messages: TranscriptMessage[] = [];
    let invalidLines = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        messages.push(parsed);
      } catch {
        invalidLines++;
      }
    }

    // Don't log here - let callers decide what to log with context
    return { messages, invalidLines };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    // Return error to caller - don't log here to avoid duplicate logs
    return { messages: [], error: errorMessage, invalidLines: 0 };
  }
}

export function getMemoriaDir(cwd: string): string {
  // Use path.resolve to ensure absolute path
  const resolvedCwd = path.resolve(cwd);
  return path.join(resolvedCwd, ".memoria");
}

export function outputJson(data: unknown): void {
  console.log(JSON.stringify(data));
}

export function logInfo(message: string): void {
  console.error(`[memoria-hook] ${message}`);
}

export function logError(message: string): void {
  console.error(`[memoria-hook] ERROR: ${message}`);
}

/**
 * Sanitize user-provided text to prevent prompt injection
 * - Handles non-string input safely (returns empty string)
 * - Removes newlines and control characters
 * - Caps length
 * - Collapses whitespace
 */
export function sanitizeUserText(text: unknown, maxLength: number = 100): string {
  if (typeof text !== "string") {
    return "";
  }
  return text
    .replace(/[\r\n\t\x00-\x1f]+/g, " ")  // Replace newlines and control chars with space
    .replace(/\s+/g, " ")                   // Collapse multiple spaces
    .trim()
    .substring(0, maxLength);
}

/**
 * Safely check if value is a string array (may be empty)
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
