# Follow Up Boss MCP — Implementation Handoff

This document is for the developer taking over this repository. The goal is to turn the current proof-of-concept local MCP server into a polished, hosted, non-technical user experience for Follow Up Boss (FUB) users.

## Goal

Build a hosted MCP server that lets a non-technical person use Follow Up Boss through ChatGPT in plain English. The user should not need to install Node.js, run a terminal command, manage an `.env` file, or understand REST APIs.

The desired experience is:

1. The user opens a connection/setup link.
2. They authorize the connection securely.
3. They add the MCP server to ChatGPT using one permanent HTTPS URL.
4. They ask normal questions such as:
   - “Show me my hot leads that have not been contacted in seven days.”
   - “Summarize this lead’s recent activity.”
   - “Add a note that I spoke with Sarah about listing her home.”
   - “Create a task to call John tomorrow afternoon.”
5. ChatGPT confirms before creating, changing, sending, or deleting CRM data.

## Current repository status

The current code is a local TypeScript/stdin MCP proof of concept. It has:

- `fub_api`: generic access to the FUB v1 REST API
- `fub_search_people`
- `fub_get_person`
- `fub_create_note`
- `fub_create_task`
- API-key authentication through environment variables

This code is useful as a reference and API smoke-test client. It is not yet the final hosted product.

## Recommended production architecture

Use Cloudflare Workers as the hosting platform.

Suggested components:

- Cloudflare Worker: remote MCP endpoint, ideally `/mcp`
- Cloudflare Workers Secrets: FUB API key and encryption/signing secrets
- Cloudflare KV or D1: minimal connection/user metadata only, if needed
- OAuth authorization flow: authenticate the ChatGPT MCP client without exposing the FUB key
- Optional Cloudflare Pages or Worker route: friendly `/setup` and `/help` pages
- GitHub Actions: deploy on merge to `main`

Cloudflare Workers is attractive because it is serverless and the free plan currently includes 100,000 requests per day. Verify current pricing and limits before launch: https://developers.cloudflare.com/workers/platform/pricing/

Do not assume free pricing will remain unchanged. The person taking ownership of this project must create and own the Cloudflare account, billing settings, domains, and deployment credentials.

## Authentication and security requirements

Do not expose `FUB_API_KEY` to ChatGPT, the browser, logs, GitHub, or users.

ChatGPT remote MCP connections should use OAuth or another supported secure authorization flow. Review the current OpenAI documentation before implementation:

- https://developers.openai.com/api/docs/guides/custom-mcp-server
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/api/docs/guides/tools-connectors-mcp

The FUB API key should exist only as a Cloudflare Worker secret, or in a per-user encrypted secret store if the product supports multiple FUB accounts.

Minimum security requirements:

- HTTPS only
- OAuth authorization for the MCP client
- Validate OAuth redirect URIs exactly
- Never log API keys, OAuth tokens, contact notes, email bodies, phone numbers, or full tool payloads
- Use constant-time comparisons for any shared secrets
- Apply request and per-user rate limits
- Validate every tool input with Zod or equivalent
- Restrict tools to the minimum FUB scopes/capabilities needed
- Require confirmation for all write operations
- Make delete operations unavailable initially
- Return concise, redacted errors to the user
- Add a privacy policy and basic terms/contact page before public use

## Tool design: make it feel non-technical

Do not make the generic `fub_api` tool the primary user experience. Keep it for developer/admin troubleshooting, and hide or restrict it in production if possible.

Create focused, friendly tools with clear descriptions:

### Read-only tools

- `search_contacts`
  - Search by name, email, phone, stage, tag, source, assigned agent, or date/activity filters.
- `get_contact_summary`
  - Return a useful summary: identity, stage, tags, assigned agent, last activity, next task, recent notes, and recent communications when available.
- `list_follow_up_needed`
  - Find contacts with no recent contact, overdue tasks, or a requested follow-up window.
- `list_hot_leads`
  - Return contacts in the configured hot/high-priority stages or with selected tags.
- `get_contact_activity`
  - Return a chronological, concise activity history.
- `list_tasks`
  - Support overdue, today, tomorrow, and date-range views.

### Write tools

- `add_contact_note`
- `create_follow_up_task`
- `update_contact_stage`
- `add_contact_tag`
- `remove_contact_tag`
- `update_contact_fields`

Every write tool must have a description that tells the model to summarize the intended change and request user confirmation before execution. If the MCP client already provides approval UI, still make the tool descriptions explicit.

Do not implement sending email, sending text messages, deleting contacts, bulk edits, or bulk messaging until there is a separate approval design and a tested audit trail.

## Response design

Responses should be written for a busy real-estate professional, not a developer.

Prefer:

```text
I found 8 hot leads without a logged contact in the last 7 days.

1. Sarah Johnson — Buyer — last contact 12 days ago
2. Mark Lee — Seller — last contact 9 days ago
...
```

Avoid returning raw JSON, API URLs, pagination fields, internal IDs, stack traces, or unexplained error codes unless the user explicitly asks for technical details.

When a user asks for a write, show a preview:

```text
I’m ready to create this task:

Contact: Sarah Johnson
Task: Call about the listing consultation
Due: Tomorrow at 2:00 PM

Should I create it?
```

## FUB API implementation notes

The official FUB API base is currently:

```text
https://api.followupboss.com/v1
```

Use the official API documentation as the source of truth:

- https://docs.followupboss.com/reference/getting-started
- https://help.followupboss.com/hc/en-us/articles/7787906777751-Follow-Up-Boss-Open-API

Confirm the exact request and response shapes for people, notes, tasks, events, stages, tags, and custom fields before adding convenience tools. Do not guess endpoint behavior from the current proof of concept.

Implement:

- pagination handling
- retry handling for safe GET requests
- clear handling of 401, 403, 404, 409, 429, and 5xx responses
- bounded page sizes
- request timeouts using `AbortController`
- response normalization into user-friendly objects
- rate-limit awareness and `Retry-After` handling

## Configuration and secrets

Use Cloudflare secret storage in production. Do not commit real values.

Likely production secrets/configuration:

```text
FUB_API_KEY
FUB_SYSTEM_KEY                 # optional, if registered with FUB
OAUTH_CLIENT_SECRET             # if the selected OAuth design requires it
SESSION_SIGNING_SECRET
ENCRYPTION_KEY                  # only if storing encrypted per-user credentials
```

Likely public configuration:

```text
FUB_BASE_URL=https://api.followupboss.com/v1
APP_BASE_URL=https://<chosen-domain>
ENVIRONMENT=production
```

Use separate development and production secrets.

## ChatGPT connection checklist

Follow the current OpenAI custom MCP documentation, since UI names and requirements can change.

The final connection should provide:

- a stable HTTPS URL ending in `/mcp`
- a recognizable server name, such as `Follow Up Boss Assistant`
- a short description explaining what it can read and change
- OAuth authorization rather than a pasted FUB API key
- read/write tools with approval behavior clearly documented

Reference:

https://developers.openai.com/api/docs/guides/custom-mcp-server

## Deployment checklist

1. Create or select the Cloudflare account owned by the project owner.
2. Confirm the billing plan and free-tier limits.
3. Create the Worker and production environment.
4. Add production secrets with `wrangler secret put` or the Cloudflare dashboard.
5. Configure the production domain or `workers.dev` URL.
6. Implement and test OAuth.
7. Deploy the Worker from GitHub Actions.
8. Test `/health`.
9. Test MCP discovery and tool listing.
10. Test read-only FUB calls using a dedicated test contact or safe account.
11. Test write approval and failure handling.
12. Connect the server to ChatGPT.
13. Test from a fresh non-technical user account.
14. Document the final URL and support contact in `README.md`.

## Acceptance criteria

The project is ready for handoff to a normal user when:

- no local installation is required
- the user never sees or handles the FUB API key
- the user can connect using a guided HTTPS/OAuth flow
- common FUB questions work in plain English
- write actions show a clear confirmation preview
- errors are understandable and do not expose secrets or raw stack traces
- pagination and rate limits work
- the server has a health endpoint and basic monitoring
- deployment is repeatable from GitHub Actions
- the collaborator can deploy and rotate secrets without this chat
- the README contains the final connection instructions

## Suggested implementation phases

### Phase 1 — Hosted read-only MCP

Move the server to Cloudflare Workers, add Streamable HTTP MCP transport, secure the FUB key as a Worker secret, and implement read-only contact/search/activity tools.

### Phase 2 — Friendly write actions

Add notes and tasks with confirmation-friendly tool schemas and strong validation.

### Phase 3 — OAuth and multi-user readiness

Add the ChatGPT-compatible OAuth flow and decide whether the service supports one FUB account or multiple independent FUB accounts.

### Phase 4 — Polish and operations

Add a setup page, helpful errors, monitoring, rate-limit handling, deployment automation, privacy documentation, and user acceptance testing.

## Important product decision

Decide whether this is:

1. A private personal assistant for one FUB account, or
2. A multi-user product where each user connects their own FUB account.

The first option is substantially simpler and safer. The second option requires per-user OAuth/token storage, account isolation, billing/quotas, deletion workflows, and a stronger privacy/security model.

