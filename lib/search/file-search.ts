import * as fs from "node:fs";
import * as path from "node:path";
import type { QueryableDb } from "./core.js";
import { walkJsonFiles } from "./helpers.js";

interface FileSearchResult {
  sessionId: string;
  title: string;
  matchedFiles: string[];
  fileCount: number;
}

function getSessionTitle(mnemeDir: string, sessionId: string): string {
  const sessionsDir = path.join(mnemeDir, "sessions");
  let title = sessionId;
  walkJsonFiles(sessionsDir, (filePath) => {
    if (!path.basename(filePath, ".json").startsWith(sessionId)) return;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (data.title) title = data.title;
    } catch {
      // Skip invalid files
    }
  });
  return title;
}

export function searchByFiles(
  database: QueryableDb,
  projectPath: string,
  filePaths: string[],
  mnemeDir: string,
  limit = 3,
): FileSearchResult[] {
  if (filePaths.length === 0) return [];

  try {
    const placeholders = filePaths.map(() => "?").join(",");
    const rows = database
      .prepare(
        `SELECT session_id, file_path, COUNT(*) as cnt
       FROM file_index
       WHERE project_path = ? AND file_path IN (${placeholders})
       GROUP BY session_id, file_path`,
      )
      .all(projectPath, ...filePaths) as Array<{
      session_id: string;
      file_path: string;
      cnt: number;
    }>;

    const sessionMap = new Map<string, { files: Set<string>; count: number }>();
    for (const row of rows) {
      const entry = sessionMap.get(row.session_id) || {
        files: new Set<string>(),
        count: 0,
      };
      entry.files.add(row.file_path);
      entry.count += row.cnt;
      sessionMap.set(row.session_id, entry);
    }

    return [...sessionMap.entries()]
      .sort(
        (a, b) => b[1].files.size - a[1].files.size || b[1].count - a[1].count,
      )
      .slice(0, limit)
      .map(([sessionId, data]) => ({
        sessionId,
        title: getSessionTitle(mnemeDir, sessionId),
        matchedFiles: [...data.files],
        fileCount: data.count,
      }));
  } catch {
    return [];
  }
}
