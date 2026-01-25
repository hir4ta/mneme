import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import fs from "fs";
import path from "path";

const app = new Hono();

// Get project root from environment variable
const getProjectRoot = () => {
  return process.env.MEMORIA_PROJECT_ROOT || process.cwd();
};

const getMemoriaDir = () => {
  return path.join(getProjectRoot(), ".memoria");
};

// CORS for development
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:7777"],
  })
);

// API Routes

// Sessions
app.get("/api/sessions", async (c) => {
  const sessionsDir = path.join(getMemoriaDir(), "sessions");
  try {
    if (!fs.existsSync(sessionsDir)) {
      return c.json([]);
    }
    const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
    const sessions = files.map((file) => {
      const content = fs.readFileSync(path.join(sessionsDir, file), "utf-8");
      return JSON.parse(content);
    });
    // Sort by createdAt descending
    sessions.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return c.json(sessions);
  } catch {
    return c.json({ error: "Failed to read sessions" }, 500);
  }
});

app.get("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const sessionsDir = path.join(getMemoriaDir(), "sessions");
  try {
    const filePath = path.join(sessionsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Session not found" }, 404);
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return c.json(JSON.parse(content));
  } catch {
    return c.json({ error: "Failed to read session" }, 500);
  }
});

app.put("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const sessionsDir = path.join(getMemoriaDir(), "sessions");
  try {
    const filePath = path.join(sessionsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Session not found" }, 404);
    }
    const body = await c.req.json();
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2));
    return c.json(body);
  } catch {
    return c.json({ error: "Failed to update session" }, 500);
  }
});

app.delete("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const sessionsDir = path.join(getMemoriaDir(), "sessions");
  try {
    const filePath = path.join(sessionsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Session not found" }, 404);
    }
    fs.unlinkSync(filePath);
    return c.json({ success: true });
  } catch {
    return c.json({ error: "Failed to delete session" }, 500);
  }
});

app.post("/api/sessions/:id/comments", async (c) => {
  const id = c.req.param("id");
  const sessionsDir = path.join(getMemoriaDir(), "sessions");
  try {
    const filePath = path.join(sessionsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Session not found" }, 404);
    }
    const session = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const body = await c.req.json();
    const comment = {
      id: `comment-${Date.now()}`,
      content: body.content,
      user: body.user,
      createdAt: new Date().toISOString(),
    };
    session.comments = session.comments || [];
    session.comments.push(comment);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
    return c.json(comment, 201);
  } catch {
    return c.json({ error: "Failed to add comment" }, 500);
  }
});

// Decisions
app.get("/api/decisions", async (c) => {
  const decisionsDir = path.join(getMemoriaDir(), "decisions");
  try {
    if (!fs.existsSync(decisionsDir)) {
      return c.json([]);
    }
    const files = fs
      .readdirSync(decisionsDir)
      .filter((f) => f.endsWith(".json"));
    const decisions = files.map((file) => {
      const content = fs.readFileSync(path.join(decisionsDir, file), "utf-8");
      return JSON.parse(content);
    });
    decisions.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return c.json(decisions);
  } catch {
    return c.json({ error: "Failed to read decisions" }, 500);
  }
});

app.get("/api/decisions/:id", async (c) => {
  const id = c.req.param("id");
  const decisionsDir = path.join(getMemoriaDir(), "decisions");
  try {
    const filePath = path.join(decisionsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Decision not found" }, 404);
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return c.json(JSON.parse(content));
  } catch {
    return c.json({ error: "Failed to read decision" }, 500);
  }
});

app.post("/api/decisions", async (c) => {
  const decisionsDir = path.join(getMemoriaDir(), "decisions");
  try {
    if (!fs.existsSync(decisionsDir)) {
      fs.mkdirSync(decisionsDir, { recursive: true });
    }
    const body = await c.req.json();
    const id = body.id || `decision-${Date.now()}`;
    body.id = id;
    body.createdAt = body.createdAt || new Date().toISOString();
    const filePath = path.join(decisionsDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2));
    return c.json(body, 201);
  } catch {
    return c.json({ error: "Failed to create decision" }, 500);
  }
});

app.put("/api/decisions/:id", async (c) => {
  const id = c.req.param("id");
  const decisionsDir = path.join(getMemoriaDir(), "decisions");
  try {
    const filePath = path.join(decisionsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Decision not found" }, 404);
    }
    const body = await c.req.json();
    body.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2));
    return c.json(body);
  } catch {
    return c.json({ error: "Failed to update decision" }, 500);
  }
});

app.delete("/api/decisions/:id", async (c) => {
  const id = c.req.param("id");
  const decisionsDir = path.join(getMemoriaDir(), "decisions");
  try {
    const filePath = path.join(decisionsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Decision not found" }, 404);
    }
    fs.unlinkSync(filePath);
    return c.json({ success: true });
  } catch {
    return c.json({ error: "Failed to delete decision" }, 500);
  }
});

// Project info
app.get("/api/info", async (c) => {
  const projectRoot = getProjectRoot();
  const memoriaDir = getMemoriaDir();
  return c.json({
    projectRoot,
    memoriaDir,
    exists: fs.existsSync(memoriaDir),
  });
});

// Serve static files in production
// When bundled, server.js is at dist/server.js and static files at dist/public/
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

const port = parseInt(process.env.PORT || "7777", 10);

console.log(`\nmemoria dashboard`);
console.log(`Project: ${getProjectRoot()}`);
console.log(`URL: http://localhost:${port}\n`);

serve({
  fetch: app.fetch,
  port,
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});
