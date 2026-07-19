#!/usr/bin/env node
// QuikRun MCP server entrypoint. Boots the high-level McpServer, registers the
// snippet tools, and speaks MCP over stdio. Run via `npx @quikrun/mcp`.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const server = new McpServer({ name: "quikrun", version: "0.1.0" });
  registerTools(server);
  await server.connect(new StdioServerTransport());
  // stdout is reserved for the MCP protocol — log to stderr only.
  console.error("QuikRun MCP server running on stdio.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
