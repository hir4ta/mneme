#!/usr/bin/env node

import { fork } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Suppress Node.js SQLite experimental warning (must be before dynamic import)
const originalEmit = process.emit;
process.emit = (name, data, ...args) => {
  if (
    name === "warning" &&
    data?.name === "ExperimentalWarning" &&
    data?.message?.includes("SQLite")
  ) {
    return false;
  }
  return originalEmit.call(process, name, data, ...args);
};

// Dynamic import to ensure warning suppression is active
const { DatabaseSync } = await import("node:sqlite");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const packageDir = path.dirname(__dirname);
const projectRoot = process.cwd();

function showHelp() {
  console.log(`
mneme - Claude Code Long-term Memory Plugin

Usage:
  mneme --init         Initialize .mneme directory in current project
  mneme --dashboard    Start the web dashboard
  mneme -d             Same as above (short form)
  mneme --port <port>  Specify port (default: 7777)
  mneme --help         Show this help

Examples:
  cd /path/to/your/project
  npx @hir4ta/mneme --init
  npx @hir4ta/mneme --dashboard
  npx @hir4ta/mneme -d --port 8080
`);
}

function checkMnemeDir() {
  const mnemeDir = path.join(projectRoot, ".mneme");
  if (!fs.existsSync(mnemeDir)) {
    console.log(`\nWARNING: .mneme directory not found: ${projectRoot}`);
    console.log("         Run: npx @hir4ta/mneme --init");
  }
}

function initMneme() {
  const mnemeDir = path.join(projectRoot, ".mneme");
  const sessionsDir = path.join(mnemeDir, "sessions");
  const rulesDir = path.join(mnemeDir, "rules");
  const patternsDir = path.join(mnemeDir, "patterns");
  const tagsPath = path.join(mnemeDir, "tags.json");
  const localDbPath = path.join(mnemeDir, "local.db");
  const gitignorePath = path.join(mnemeDir, ".gitignore");

  // Check if already initialized
  if (fs.existsSync(mnemeDir)) {
    console.log(`mneme is already initialized: ${mnemeDir}`);
    return;
  }

  // Create directories
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.mkdirSync(patternsDir, { recursive: true });

  // Copy default tags.json
  const defaultTagsPath = path.join(packageDir, "hooks", "default-tags.json");
  if (fs.existsSync(defaultTagsPath)) {
    fs.copyFileSync(defaultTagsPath, tagsPath);
  }

  // Initialize rules files
  const now = new Date().toISOString();
  const rulesTemplate = JSON.stringify(
    {
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      items: [],
    },
    null,
    2,
  );

  fs.writeFileSync(
    path.join(rulesDir, "review-guidelines.json"),
    rulesTemplate,
  );
  fs.writeFileSync(path.join(rulesDir, "dev-rules.json"), rulesTemplate);

  // Create .gitignore for local.db and temporary files
  const gitignoreContent = `# Local SQLite database (private interactions)
local.db
local.db-wal
local.db-shm

# Temporary files
.pending-compact.json
`;
  fs.writeFileSync(gitignorePath, gitignoreContent);

  // Initialize local SQLite database
  const schemaPath = path.join(packageDir, "lib", "schema.sql");
  try {
    const db = new DatabaseSync(localDbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA synchronous = NORMAL");
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, "utf-8");
      db.exec(schema);
    }
    db.close();
  } catch (error) {
    console.error(
      `Warning: Failed to initialize SQLite database: ${error.message}`,
    );
  }

  console.log(`mneme initialized: ${mnemeDir}`);
  console.log(`
Created:
  ${sessionsDir}/
  ${rulesDir}/
  ${patternsDir}/
  ${tagsPath}
  ${rulesDir}/review-guidelines.json
  ${rulesDir}/dev-rules.json
  ${gitignorePath}
  ${localDbPath}

You can now use mneme with Claude Code in this project.
`);
}

function getPort() {
  const portIndex = args.indexOf("--port");
  if (portIndex !== -1 && args[portIndex + 1]) {
    return parseInt(args[portIndex + 1], 10) || 7777;
  }
  return 7777;
}

function startDashboard() {
  checkMnemeDir();

  const port = getPort();
  const serverPath = path.join(packageDir, "dist", "server.js");

  if (!fs.existsSync(serverPath)) {
    console.error("ERROR: Server build not found.");
    console.error("       The package may not be installed correctly.");
    process.exit(1);
  }

  const child = fork(serverPath, [], {
    cwd: packageDir,
    env: {
      ...process.env,
      MNEME_PROJECT_ROOT: projectRoot,
      PORT: port.toString(),
    },
    stdio: "inherit",
  });

  child.on("error", (err) => {
    console.error("ERROR: Failed to start dashboard:", err.message);
    process.exit(1);
  });

  child.on("close", (code) => {
    process.exit(code || 0);
  });

  process.on("SIGINT", () => {
    child.kill("SIGINT");
  });
}

// Parse arguments
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  showHelp();
  process.exit(0);
}

if (args.includes("--init")) {
  initMneme();
} else if (args.includes("--dashboard") || args.includes("-d")) {
  startDashboard();
} else {
  console.error(`ERROR: Unknown option: ${args.join(" ")}`);
  showHelp();
  process.exit(1);
}
