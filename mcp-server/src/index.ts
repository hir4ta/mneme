#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import * as listSessionsTool from "./tools/memoria_list_sessions.js";
import * as getSessionTool from "./tools/memoria_get_session.js";
import * as saveDecisionTool from "./tools/memoria_save_decision.js";
import * as savePatternTool from "./tools/memoria_save_pattern.js";
import * as searchTool from "./tools/memoria_search.js";
import { ensureMemoriaStructure } from "./storage/index.js";

const server = new McpServer({
  name: "memoria",
  version: "0.1.0",
});

// Register tools
server.registerTool(
  listSessionsTool.TOOL_DEFINITION.name,
  {
    description: listSessionsTool.TOOL_DEFINITION.description,
    inputSchema: listSessionsTool.TOOL_DEFINITION.inputSchema,
  },
  async (input) => listSessionsTool.handler(input as listSessionsTool.ListSessionsInput)
);

server.registerTool(
  getSessionTool.TOOL_DEFINITION.name,
  {
    description: getSessionTool.TOOL_DEFINITION.description,
    inputSchema: getSessionTool.TOOL_DEFINITION.inputSchema,
  },
  async (input) => getSessionTool.handler(input as getSessionTool.GetSessionInput)
);

server.registerTool(
  saveDecisionTool.TOOL_DEFINITION.name,
  {
    description: saveDecisionTool.TOOL_DEFINITION.description,
    inputSchema: saveDecisionTool.TOOL_DEFINITION.inputSchema,
  },
  async (input) => saveDecisionTool.handler(input as saveDecisionTool.SaveDecisionInput)
);

server.registerTool(
  savePatternTool.TOOL_DEFINITION.name,
  {
    description: savePatternTool.TOOL_DEFINITION.description,
    inputSchema: savePatternTool.TOOL_DEFINITION.inputSchema,
  },
  async (input) => savePatternTool.handler(input as savePatternTool.SavePatternInput)
);

server.registerTool(
  searchTool.TOOL_DEFINITION.name,
  {
    description: searchTool.TOOL_DEFINITION.description,
    inputSchema: searchTool.TOOL_DEFINITION.inputSchema,
  },
  async (input) => searchTool.handler(input as searchTool.SearchInput)
);

async function main() {
  // Ensure .memoria directory structure exists
  await ensureMemoriaStructure();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Memoria MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.error("Received SIGINT, shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("Received SIGTERM, shutting down...");
  process.exit(0);
});
