// Tool definitions: each wraps a QuikRun REST call and returns a CallToolResult.
// Handlers stay thin — validate via zod shape, call `request`, format text out.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiError, request } from "./client.js";

// --- result helpers -------------------------------------------------------

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

/** Run a handler body, converting any thrown error into an isError result. */
async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : String(err);
    return fail(`QuikRun API error: ${msg}`);
  }
}

// --- API response shapes (only the fields we read) ------------------------

interface SnippetSummary {
  name: string;
  slug: string;
  lang: string;
  visibility: string;
  endpoint: string;
  // The list route formats runs with num() (e.g. "1,204"); lastRun is a relTime string ("—" when never run).
  runs: string;
  lastRun: string | null;
}

interface SnippetDetail {
  snippet: {
    name: string;
    visibility: string;
    url: string;
    status: string;
    diff: string;
    language: string;
    runtime: string;
  };
  // The route returns file as an object, not a string.
  file: { name: string; lang?: string; lines?: number };
  code: string[];
  versions: unknown;
}

interface RunResult {
  status: string;
  // The run route pre-formats these as strings: status "200", ms "12ms"/"<1ms", size "1.2 KB".
  response: { status: string; statusText: string; ms: string; size: string };
  json: string[];
  logLines: { level: string; text: string }[];
  // error is the execution error object (or null), not a string.
  error: { name?: string; message?: string; stack?: string } | null;
}

// --- registration ---------------------------------------------------------

/** Register every QuikRun tool onto the given MCP server. */
export function registerTools(server: McpServer): void {
  // 1. list_snippets ------------------------------------------------------
  server.tool(
    "list_snippets",
    "List all of the user's QuikRun snippets with a compact summary (name, slug, language, visibility, endpoint, run count, last run).",
    {},
    async () =>
      guard(async () => {
        const { snippets } = await request<{ snippets: SnippetSummary[] }>("/api/snippets");
        if (!snippets.length) return ok("No snippets yet. Use create_snippet to make one.");
        const lines = snippets.map(
          (s) =>
            `- ${s.name} (${s.slug}) · ${s.lang} · ${s.visibility} · ${s.runs} runs` +
            // relTime returns "—" (never null) for never-run snippets; treat it as absent.
            `${s.lastRun && s.lastRun !== "—" ? ` · last run ${s.lastRun}` : ""}\n  ${s.endpoint}`,
        );
        return ok(`${snippets.length} snippet(s):\n${lines.join("\n")}`);
      }),
  );

  // 2. get_snippet --------------------------------------------------------
  server.tool(
    "get_snippet",
    "Get one snippet's metadata and full source code by slug.",
    { slug: z.string().describe("The snippet slug.") },
    async ({ slug }) =>
      guard(async () => {
        const d = await request<SnippetDetail>(`/api/snippets/${encodeURIComponent(slug)}`);
        const s = d.snippet;
        const meta =
          `${s.name}\n` +
          `visibility: ${s.visibility} · status: ${s.status} · language: ${s.language} · runtime: ${s.runtime}\n` +
          `url: ${s.url}\n` +
          `file: ${d.file.name}${s.diff ? ` · diff: ${s.diff}` : ""}`;
        return ok(`${meta}\n\n--- code ---\n${d.code.join("\n")}`);
      }),
  );

  // 3. create_snippet -----------------------------------------------------
  server.tool(
    "create_snippet",
    "Create a new snippet. Optionally give it a name, language (defaults to javascript), and a prompt describing what it should do.",
    {
      name: z.string().optional().describe("Display name for the snippet."),
      language: z.string().optional().describe("Language, e.g. javascript. Defaults server-side."),
      prompt: z.string().optional().describe("Natural-language description of the snippet to scaffold."),
    },
    async (args) =>
      guard(async () => {
        const { slug, name } = await request<{ slug: string; name: string }>("/api/snippets", {
          method: "POST",
          body: JSON.stringify(args),
        });
        return ok(`Created snippet "${name}" (slug: ${slug}).`);
      }),
  );

  // 4. update_snippet_code ------------------------------------------------
  server.tool(
    "update_snippet_code",
    "Save source code to a snippet's draft. Overwrites the current draft code.",
    {
      slug: z.string().describe("The snippet slug."),
      code: z.string().describe("Full source code to save to the draft."),
    },
    async ({ slug, code }) =>
      guard(async () => {
        const r = await request<{ ok: boolean; diff: string; savedAt: string; lines: number }>(
          `/api/snippets/${encodeURIComponent(slug)}/code`,
          { method: "PUT", body: JSON.stringify({ code }) },
        );
        return ok(`Saved draft: ${r.lines} lines · diff ${r.diff} · at ${r.savedAt}.`);
      }),
  );

  // 5. run_snippet --------------------------------------------------------
  server.tool(
    "run_snippet",
    "Run a snippet and return its output, HTTP response summary, and logs. Optionally override the request method, path, body, and bodyType, or run ad-hoc code.",
    {
      slug: z.string().describe("The snippet slug."),
      method: z.string().optional().describe("HTTP method for the run, e.g. GET or POST."),
      path: z.string().optional().describe("Request path passed to the snippet."),
      body: z.string().optional().describe("Request body payload."),
      bodyType: z.enum(["None", "JSON", "Text"]).optional().describe("How to interpret the body."),
      code: z.string().optional().describe("Ad-hoc code to run instead of the saved draft."),
    },
    async (args) =>
      guard(async () => {
        const r = await request<RunResult>(`/api/snippets/${encodeURIComponent(args.slug)}/run`, {
          method: "POST",
          body: JSON.stringify(args),
        });
        const parts = [`status: ${r.status}`];
        if (r.response) {
          // ms/size are pre-formatted strings ("12ms", "1.2 KB") — don't append units.
          parts.push(
            `response: ${r.response.status} ${r.response.statusText} · ${r.response.ms} · ${r.response.size}`,
          );
        }
        if (r.error) parts.push(`error: ${[r.error.name, r.error.message].filter(Boolean).join(": ")}`);
        if (r.json?.length) parts.push(`\n--- output ---\n${r.json.join("\n")}`);
        if (r.logLines?.length) {
          const logs = r.logLines.map((l) => `[${l.level}] ${l.text}`).join("\n");
          parts.push(`\n--- logs ---\n${logs}`);
        }
        return r.error ? fail(parts.join("\n")) : ok(parts.join("\n"));
      }),
  );

  // 6. deploy_snippet -----------------------------------------------------
  server.tool(
    "deploy_snippet",
    "Publish a snippet's current draft as the live version.",
    { slug: z.string().describe("The snippet slug.") },
    async ({ slug }) =>
      guard(async () => {
        const r = await request<{ status: string; url: string; version: { label?: string; badge?: string } }>(
          `/api/snippets/${encodeURIComponent(slug)}/deploy`,
          { method: "POST" },
        );
        return ok(`Deployed ${r.version?.label ?? "live"} (${r.status}). Live at ${r.url}`);
      }),
  );

  // 7. update_snippet -----------------------------------------------------
  server.tool(
    "update_snippet",
    "Update a snippet's settings: name, visibility (private|public), language, or runtime.",
    {
      slug: z.string().describe("The snippet slug."),
      name: z.string().optional().describe("New display name."),
      visibility: z.enum(["private", "public"]).optional().describe("Snippet visibility."),
      language: z.string().optional().describe("New language."),
      runtime: z.string().optional().describe("New runtime."),
    },
    async ({ slug, ...patch }) =>
      guard(async () => {
        await request(`/api/snippets/${encodeURIComponent(slug)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        return ok(`Updated snippet ${slug}.`);
      }),
  );

  // 8. duplicate_snippet --------------------------------------------------
  server.tool(
    "duplicate_snippet",
    "Duplicate a snippet, returning the new snippet's slug and name.",
    { slug: z.string().describe("The snippet slug to duplicate.") },
    async ({ slug }) =>
      guard(async () => {
        const r = await request<{ slug: string; name: string }>(
          `/api/snippets/${encodeURIComponent(slug)}/duplicate`,
          { method: "POST" },
        );
        return ok(`Duplicated to "${r.name}" (slug: ${r.slug}).`);
      }),
  );

  // 9. delete_snippet -----------------------------------------------------
  server.tool(
    "delete_snippet",
    "[DESTRUCTIVE] Permanently delete a snippet by slug. This cannot be undone.",
    { slug: z.string().describe("The snippet slug to delete.") },
    async ({ slug }) =>
      guard(async () => {
        await request<{ ok: boolean }>(`/api/snippets/${encodeURIComponent(slug)}`, {
          method: "DELETE",
        });
        return ok(`Deleted snippet ${slug}.`);
      }),
  );
}
