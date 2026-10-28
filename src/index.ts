import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const apiKey = process.env.FUB_API_KEY;
if (!apiKey) throw new Error("FUB_API_KEY is required");
const baseUrl = process.env.FUB_BASE_URL ?? "https://api.followupboss.com/v1";
const systemKey = process.env.FUB_SYSTEM_KEY;

async function fub(path: string, init: RequestInit = {}) {
  const url = new URL(path.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`);
  headers.set("Accept", "application/json");
  if (systemKey) headers.set("X-System-Key", systemKey);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(url, {...init, headers});
  const text = await response.text();
  let data: unknown; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`Follow Up Boss API ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

const result = (data: unknown) => ({content: [{type: "text" as const, text: JSON.stringify(data, null, 2)}]});
const server = new McpServer({name: "local-fub-mcp", version: "1.0.0"});

server.registerTool("fub_api", {
  title: "Follow Up Boss API",
  description: "Call an official Follow Up Boss REST API endpoint. Paths are relative to /v1, for example people, events, notes, tasks, or pipelines. Use GET for inspection; POST/PATCH/PUT/DELETE modify CRM data.",
  inputSchema: z.object({
    method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]).default("GET"),
    path: z.string().min(1).describe("Relative FUB v1 path, without the base URL"),
    query: z.record(z.string(), z.string()).optional(),
    body: z.record(z.string(), z.unknown()).optional()
  })
}, async ({method, path, query, body}) => {
  const suffix = query ? `?${new URLSearchParams(query).toString()}` : "";
  return result(await fub(`${path}${suffix}`, {method, body: body ? JSON.stringify(body) : undefined}));
});

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
  description: "Add a note to a Follow Up Boss contact. Confirm the person ID and note text before calling.",
  inputSchema: z.object({personId: z.number().int().positive(), note: z.string().min(1)})
}, async ({personId, note}) => result(await fub("notes", {method: "POST", body: JSON.stringify({personId, note})})));

server.registerTool("fub_create_task", {
  title: "Create FUB task",
  description: "Create a Follow Up Boss task. Confirm task details before calling.",
  inputSchema: z.object({personId: z.number().int().positive().optional(), description: z.string().min(1), dueDate: z.string().optional()})
}, async ({personId, description, dueDate}) => result(await fub("tasks", {method: "POST", body: JSON.stringify({personId, description, dueDate})})));

await server.connect(new StdioServerTransport());
