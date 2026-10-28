# Follow Up Boss MCP

## Project handoff

The detailed implementation plan is in [HANDOFF.md](./HANDOFF.md). It is written for the developer taking this project from a local proof of concept to a polished hosted service for a non-technical user.

This is a local Model Context Protocol server backed by the official Follow Up Boss REST API (`https://api.followupboss.com/v1`). ClientForge does not include a complete FUB client; this server is standalone.

## Configure

```bash
cd fub-mcp
npm install
export FUB_API_KEY='your-key'
# Optional, only if your FUB integration has a registered system key:
export FUB_SYSTEM_KEY='your-system-key'
npm run dev
```

Never commit `.env` files or API keys. For production, the recommended direction is a hosted Cloudflare Worker with secrets stored in Cloudflare and OAuth used for the ChatGPT connection. The current local server is intended for development and API testing.

## MCP client configuration

For a stdio MCP client, point it at `npm --prefix /absolute/path/to/fub-mcp run dev` and pass `FUB_API_KEY` in the process environment. The `fub_api` tool exposes the complete REST surface, while the other tools provide common contact, note, and task operations.
