# @quikrun/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for [QuikRun](https://quik.run). It lets an AI agent (Claude Desktop, Cursor, and other MCP clients) manage your QuikRun snippets — list, read, create, edit, run, deploy, duplicate, and delete — by wrapping the QuikRun REST API.

## Requirements

- Node.js 20 or newer
- A QuikRun account and API token

## Getting a token

1. Sign in at [quik.run](https://quik.run).
2. Go to **Dashboard → Tokens**.
3. Mint a new token. It looks like `quik_<keyId>_<secret>`.
4. Copy it — you will paste it into your MCP client config as `QUIKRUN_TOKEN`.

## Claude Desktop setup

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "quikrun": {
      "command": "npx",
      "args": ["-y", "@quikrun/mcp"],
      "env": {
        "QUIKRUN_TOKEN": "quik_yourKeyId_yourSecret"
      }
    }
  }
}
```

Restart Claude Desktop. The QuikRun tools appear in the tools menu.

### Optional: self-hosted API

Point the server at a different QuikRun API host with `QUIKRUN_API_URL` (defaults to `https://api.quik.run`):

```json
"env": {
  "QUIKRUN_TOKEN": "quik_yourKeyId_yourSecret",
  "QUIKRUN_API_URL": "https://api.quik.run"
}
```

## Tools

| Tool | What it does |
| --- | --- |
| `list_snippets` | List all your snippets with a compact summary. |
| `get_snippet` | Get one snippet's metadata and full source code. |
| `create_snippet` | Create a snippet (optional name, language, prompt). |
| `update_snippet_code` | Save source code to a snippet's draft. |
| `run_snippet` | Run a snippet and return output, response, and logs. |
| `deploy_snippet` | Publish the current draft as the live version. |
| `update_snippet` | Update name, visibility, language, or runtime. |
| `duplicate_snippet` | Duplicate a snippet. |
| `delete_snippet` | Permanently delete a snippet (destructive). |

## Development

```bash
npm install
npm run typecheck   # type-check without emitting
npm run build       # compile to dist/
npm run dev         # run from source with tsx
```

## License

MIT
