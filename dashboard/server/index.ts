import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  isIndexStale,
  readRecentDecisionIndexes,
  readRecentSessionIndexes,
  rebuildAllDecisionIndexes,
  rebuildAllSessionIndexes,
} from "../../lib/index/manager.js";
import { getMnemeDir, getProjectRoot } from "./lib/helpers.js";
import analytics from "./routes/analytics.js";
import decisions from "./routes/decisions.js";
import devRules from "./routes/dev-rules.js";
import exportRoutes from "./routes/export.js";
import misc from "./routes/misc.js";
import patterns from "./routes/patterns.js";
import rules from "./routes/rules.js";
import sessions from "./routes/sessions.js";
import team from "./routes/team.js";

// =============================================================================
// Note: Dashboard supports read and selected maintenance operations
// (session/decision/pattern/rule deletions and rule updates).
// Primary data creation remains via /mneme:* commands.
// =============================================================================

const app = new Hono();

// CORS for development (allow any localhost port)
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return undefined;
      if (origin.startsWith("http://localhost:")) return origin;
      return null;
    },
  }),
);

// Mount route modules
app.route("/api/sessions", sessions);
app.route("/api/decisions", decisions);
app.route("/api/rules", rules);
app.route("/api/patterns", patterns);
app.route("/api/dev-rules", devRules);
app.route("/api/export", exportRoutes);
app.route("/api/team", team);
app.route("/api", analytics);
app.route("/api", misc);

// Serve static files in production
const distPath = path.join(import.meta.dirname, "public");
if (fs.existsSync(distPath)) {
  app.use("/*", serveStatic({ root: distPath }));
  // SPA fallback - serve index.html for all non-API routes
  app.get("*", async (c) => {
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, "utf-8");
      return c.html(content);
    }
    return c.notFound();
  });
}

const requestedPort = parseInt(process.env.PORT || "7777", 10);
const maxPortAttempts = 10;

// Initialize indexes on startup
const mnemeDir = getMnemeDir();
if (fs.existsSync(mnemeDir)) {
  try {
    const sessionsIndex = readRecentSessionIndexes(mnemeDir, 1);
    const decisionsIndex = readRecentDecisionIndexes(mnemeDir, 1);

    if (isIndexStale(sessionsIndex) || isIndexStale(decisionsIndex)) {
      console.log("Building indexes...");
      const sessionIndexes = rebuildAllSessionIndexes(mnemeDir);
      const decisionIndexes = rebuildAllDecisionIndexes(mnemeDir);

      let sessionCount = 0;
      for (const index of sessionIndexes.values()) {
        sessionCount += index.items.length;
      }
      let decisionCount = 0;
      for (const index of decisionIndexes.values()) {
        decisionCount += index.items.length;
      }
      console.log(
        `Indexed ${sessionCount} sessions, ${decisionCount} decisions`,
      );
    }
  } catch (error) {
    console.warn("Failed to initialize indexes:", error);
  }
}

// Try to start server with port fallback
async function startServer(port: number, attempt = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = serve({
      fetch: app.fetch,
      port,
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && attempt < maxPortAttempts) {
        console.log(`Port ${port} is in use, trying ${port + 1}...`);
        server.close();
        startServer(port + 1, attempt + 1)
          .then(resolve)
          .catch(reject);
      } else if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Could not find an available port after ${maxPortAttempts} attempts`,
          ),
        );
      } else {
        reject(err);
      }
    });

    server.on("listening", () => {
      console.log(`\nmneme dashboard`);
      console.log(`Project: ${getProjectRoot()}`);
      console.log(`URL: http://localhost:${port}\n`);
      resolve();
    });
  });
}

startServer(requestedPort).catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});
