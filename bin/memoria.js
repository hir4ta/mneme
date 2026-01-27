#!/usr/bin/env node

import { fork } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const packageDir = path.dirname(__dirname);
const projectRoot = process.cwd();

function showHelp() {
  console.log(`
memoria - Claude Code Long-term Memory Plugin

Usage:
  memoria --dashboard    Start the web dashboard
  memoria -d             Same as above (short form)
  memoria --port <port>  Specify port (default: 7777)
  memoria --help         Show this help

Examples:
  cd /path/to/your/project
  npx @hir4ta/memoria --dashboard
  npx @hir4ta/memoria -d --port 8080
`);
}

function checkMemoriaDir() {
  const memoriaDir = path.join(projectRoot, ".memoria");
  if (!fs.existsSync(memoriaDir)) {
    console.log(`\nWARNING: .memoria directory not found: ${projectRoot}`);
    console.log(
      "         Run a Claude Code session with the memoria plugin installed",
    );
    console.log("         in this project to create the data directory.");
  }
}

function getPort() {
  const portIndex = args.indexOf("--port");
  if (portIndex !== -1 && args[portIndex + 1]) {
    return parseInt(args[portIndex + 1], 10) || 7777;
  }
  return 7777;
}

function showSecurityWarning() {
  console.log("\n⚠️  SECURITY WARNING:");
  console.log("   The dashboard has NO authentication.");
  console.log("   It is intended for LOCAL development use only.");
  console.log("   Do NOT expose to the internet or untrusted networks.\n");
}

function startDashboard() {
  checkMemoriaDir();
  showSecurityWarning();

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
      MEMORIA_PROJECT_ROOT: projectRoot,
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

if (args.includes("--dashboard") || args.includes("-d")) {
  startDashboard();
} else {
  console.error(`ERROR: Unknown option: ${args.join(" ")}`);
  showHelp();
  process.exit(1);
}
