import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import {
  countInteractions,
  deleteBackups,
  deleteInteractions,
  openLocalDatabase,
} from "../../../lib/db.js";
import { rebuildSessionIndexForMonth } from "../../../lib/index/manager.js";
import {
  findJsonFileById,
  getMnemeDir,
  getProjectRoot,
  listDatedJsonFiles,
  safeParseJsonFile,
  sanitizeId,
  toShortId,
  writeAuditLog,
} from "../lib/helpers.js";

const sessionsDelete = new Hono();

// Delete a single session
sessionsDelete.delete("/:id", async (c) => {
  const id = toShortId(sanitizeId(c.req.param("id")));
  const dryRun = c.req.query("dry-run") === "true";
  const mnemeDir = getMnemeDir();
  const sessionsDir = path.join(mnemeDir, "sessions");

  try {
    const filePath = findJsonFileById(sessionsDir, id);
    if (!filePath) {
      return c.json({ error: "Session not found" }, 404);
    }

    const sessionData = safeParseJsonFile<{
      context?: { projectDir?: string };
      createdAt?: string;
    }>(filePath);

    const db = openLocalDatabase(getProjectRoot());
    let interactionCount = 0;
    if (db) {
      interactionCount = countInteractions(db, { sessionId: id });
      if (!dryRun) {
        deleteInteractions(db, id);
        deleteBackups(db, id);
      }
      db.close();
    }

    if (!dryRun) {
      fs.unlinkSync(filePath);

      const mdPath = filePath.replace(/\.json$/, ".md");
      if (fs.existsSync(mdPath)) {
        fs.unlinkSync(mdPath);
      }

      const sessionLinksDir = path.join(mnemeDir, "session-links");
      const linkPath = path.join(sessionLinksDir, `${id}.json`);
      if (fs.existsSync(linkPath)) {
        fs.unlinkSync(linkPath);
      }

      if (sessionData?.createdAt) {
        const date = new Date(sessionData.createdAt);
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        rebuildSessionIndexForMonth(mnemeDir, year, month);
      }
      writeAuditLog({
        entity: "session",
        action: "delete",
        targetId: id,
      });
    }

    return c.json({
      deleted: dryRun ? 0 : 1,
      interactionsDeleted: dryRun ? 0 : interactionCount,
      dryRun,
      sessionId: id,
    });
  } catch (error) {
    console.error("Failed to delete session:", error);
    return c.json({ error: "Failed to delete session" }, 500);
  }
});

// Bulk delete sessions
sessionsDelete.delete("/", async (c) => {
  const dryRun = c.req.query("dry-run") === "true";
  const projectFilter = c.req.query("project");
  const repositoryFilter = c.req.query("repository");
  const beforeFilter = c.req.query("before");

  const mnemeDir = getMnemeDir();
  const sessionsDir = path.join(mnemeDir, "sessions");

  try {
    const files = listDatedJsonFiles(sessionsDir);
    const sessionsToDelete: { id: string; path: string }[] = [];

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const session = JSON.parse(content);

        let shouldDelete = true;

        if (projectFilter) {
          const sessionProject = session.context?.projectDir;
          if (sessionProject !== projectFilter) {
            shouldDelete = false;
          }
        }

        if (repositoryFilter && shouldDelete) {
          const sessionRepo = session.context?.repository;
          if (sessionRepo !== repositoryFilter) {
            shouldDelete = false;
          }
        }

        if (beforeFilter && shouldDelete) {
          const sessionDate = session.createdAt?.split("T")[0];
          if (!sessionDate || sessionDate >= beforeFilter) {
            shouldDelete = false;
          }
        }

        if (shouldDelete) {
          sessionsToDelete.push({ id: session.id, path: filePath });
        }
      } catch {
        // Skip invalid files
      }
    }

    let totalInteractions = 0;
    const db = openLocalDatabase(getProjectRoot());
    if (db) {
      for (const session of sessionsToDelete) {
        totalInteractions += countInteractions(db, { sessionId: session.id });
      }

      if (!dryRun) {
        for (const session of sessionsToDelete) {
          deleteInteractions(db, session.id);
          deleteBackups(db, session.id);
        }
      }
      db.close();
    }

    if (!dryRun) {
      for (const session of sessionsToDelete) {
        fs.unlinkSync(session.path);

        const mdPath = session.path.replace(/\.json$/, ".md");
        if (fs.existsSync(mdPath)) {
          fs.unlinkSync(mdPath);
        }

        const sessionLinksDir = path.join(mnemeDir, "session-links");
        const linkPath = path.join(sessionLinksDir, `${session.id}.json`);
        if (fs.existsSync(linkPath)) {
          fs.unlinkSync(linkPath);
        }
        writeAuditLog({
          entity: "session",
          action: "delete",
          targetId: session.id,
        });
      }
    }

    return c.json({
      deleted: dryRun ? 0 : sessionsToDelete.length,
      interactionsDeleted: dryRun ? 0 : totalInteractions,
      wouldDelete: sessionsToDelete.length,
      dryRun,
      filters: {
        project: projectFilter || null,
        repository: repositoryFilter || null,
        before: beforeFilter || null,
      },
    });
  } catch (error) {
    console.error("Failed to delete sessions:", error);
    return c.json({ error: "Failed to delete sessions" }, 500);
  }
});

export default sessionsDelete;
