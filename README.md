# Local Follow Up Boss MCP

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

Never commit `.env` files or API keys.

## MCP client configuration

For a stdio MCP client, point it at `npm --prefix /absolute/path/to/fub-mcp run dev` and pass `FUB_API_KEY` in the process environment. The `fub_api` tool exposes the complete REST surface, while the other tools provide common contact, note, and task operations.
