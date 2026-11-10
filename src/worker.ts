import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

interface Env {
  FUB_API_KEY: string;
  FUB_SYSTEM_KEY?: string;
  FUB_BASE_URL?: string;
  MCP_AUTH_TOKEN: string;
  ENABLE_FUB_API?: string;
}

const encoder = new TextEncoder();

async function safeEqual(a: string, b: string) {
  const [ha, hb] = await Promise.all([a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s)))));
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

function createFub(env: Env) {
  const baseUrl = env.FUB_BASE_URL ?? "https://api.followupboss.com/v1";
  return async function fub(path: string, init: RequestInit = {}) {
    const url = new URL(path.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Basic ${btoa(`${env.FUB_API_KEY}:`)}`);
    headers.set("Accept", "application/json");
    if (env.FUB_SYSTEM_KEY) headers.set("X-System-Key", env.FUB_SYSTEM_KEY);
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(url, {...init, headers, signal: AbortSignal.timeout(20_000)});
    const text = await response.text();
    let data: unknown; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) throw new Error(`Follow Up Boss API ${response.status}: ${typeof data === "string" ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500)}`);
    return data;
  };
}

const result = (data: unknown) => ({content: [{type: "text" as const, text: JSON.stringify(data, null, 2)}]});

function createServer(env: Env) {
  const fub = createFub(env);
  const server = new McpServer({name: "local-fub-mcp", version: "1.0.0"});

  if (env.ENABLE_FUB_API === "true") {
    server.registerTool("fub_api", {
      title: "Follow Up Boss API",
      description: "Developer/admin troubleshooting: call a Follow Up Boss REST endpoint. Paths are relative to /v1. DELETE is not allowed. POST/PATCH/PUT modify CRM data, so confirm with the user first.",
      inputSchema: z.object({
        method: z.enum(["GET", "POST", "PATCH", "PUT"]).default("GET"),
        path: z.string().min(1).describe("Relative FUB v1 path, without the base URL"),
        query: z.record(z.string(), z.string()).optional(),
        body: z.record(z.string(), z.unknown()).optional()
      })
    }, async ({method, path, query, body}) => {
      const suffix = query ? `?${new URLSearchParams(query).toString()}` : "";
      return result(await fub(`${path}${suffix}`, {method, body: body ? JSON.stringify(body) : undefined}));
    });
  }

  server.registerTool("fub_search_people", {
    title: "Search FUB people",
    description: "Search contacts in Follow Up Boss. Provide a FUB-supported query such as email, phone, name, stage, or tag.",
    inputSchema: z.object({query: z.record(z.string(), z.string()).optional()})
  }, async ({query}) => result(await fub(`people${query ? `?${new URLSearchParams(query).toString()}` : ""}`)));

  server.registerTool("fub_get_person", {
    title: "Get FUB person",
    description: "Retrieve one Follow Up Boss contact by numeric person ID.",
    inputSchema: z.object({personId: z.number().int().positive()})
  }, async ({personId}) => result(await fub(`people/${personId}`)));

  server.registerTool("fub_create_note", {
    title: "Create FUB note",
    description: "Add a note to a Follow Up Boss contact. Summarize the person and note text to the user and get confirmation before calling.",
    inputSchema: z.object({personId: z.number().int().positive(), note: z.string().min(1)})
  }, async ({personId, note}) => result(await fub("notes", {method: "POST", body: JSON.stringify({personId, note})})));

  server.registerTool("fub_create_task", {
    title: "Create FUB task",
    description: "Create a Follow Up Boss task. Summarize the contact, task, and due date to the user and get confirmation before calling.",
    inputSchema: z.object({personId: z.number().int().positive().optional(), description: z.string().min(1), dueDate: z.string().optional()})
  }, async ({personId, description, dueDate}) => result(await fub("tasks", {method: "POST", body: JSON.stringify({personId, description, dueDate})})));

  return server;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") return Response.json({ok: true});
    if (pathname !== "/mcp") return new Response("Not found", {status: 404});

    const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "");
    if (!env.MCP_AUTH_TOKEN || !match || !(await safeEqual(match[1], env.MCP_AUTH_TOKEN))) {
      return new Response("Unauthorized", {status: 401, headers: {"WWW-Authenticate": "Bearer"}});
    }

    // Stateless: a fresh server and transport per request.
    const server = createServer(env);
    const transport = new WebStandardStreamableHTTPServerTransport({enableJsonResponse: true});
    await server.connect(transport);
    return transport.handleRequest(request);
  }
};
