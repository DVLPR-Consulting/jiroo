# Jiroo MCP server

Jiroo exposes its tickets to AI agents (Claude Code, Codex and any MCP client) through a
[Model Context Protocol](https://modelcontextprotocol.io) server at `/api/mcp` (JIR-158).
It speaks Streamable HTTP, is stateless, and authenticates every request with a
**personal access token** (JIR-156) sent as a bearer header. The agent acts as the
token's owner, with the owner's permissions; the token's scope (`read` or `write`)
caps what it may do.

## Configure a client

Create a token on the « Jetons d'accès » page (user menu), then:

**Claude Code**

```bash
claude mcp add --transport http jiroo https://jiroo-dev.vercel.app/api/mcp \
  --header "Authorization: Bearer jiroo_pat_…"
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.jiroo]
url = "https://jiroo-dev.vercel.app/api/mcp"
bearer_token_env_var = "JIROO_TOKEN"
```

and export `JIROO_TOKEN=jiroo_pat_…` in the environment Codex starts from.

**Generic MCP client**: Streamable HTTP, `Authorization: Bearer <token>`. OAuth is not
supported: a request without a bearer token gets `401` with a `WWW-Authenticate: Bearer`
challenge and no authorization server to discover.

## Tools

| Tool | Scope | What it does |
| --- | --- | --- |
| `list_backlogs` | read | Backlogs the owner can read (`includeArchived`). |
| `list_statuses` | read | Statuses of one backlog, with ids and categories. |
| `search_items` | read | Live items, filtered by `backlog`, `statusId`, `assignee` (`"me"` or a user id), `type`, `query`; paged by `cursor` (creation order). |
| `get_item` | read | One item by key with description, comments and activities. |
| `list_my_items` | read | Items assigned to the owner. |
| `create_item` | write | Create an item (`backlog`, `type`, `title`, optional `parentKey`, `statusId`, `priority`, `assigneeId`, `estimatePoints`, dates, `kind`, `sprintId`). |
| `update_item` | write | Change `title`, `description`, `priority`, `assigneeId`, `estimatePoints`, `startDate`, `dueDate`; only the fields sent change. |
| `transition_item` | write | Move an item to a status of its backlog. |
| `add_comment` | write | Add a Markdown comment, optionally notifying `mentionIds`. |

Every tool answers text plus `structuredContent`. Refusals (read-only token on a write
tool, request budget spent, unknown key, missing permission, business rule) are tool
results with `isError: true` and a French message; unexpected failures are logged
server-side and answered with a generic message.

## Rules

- **Permissions**: the owner's Jira-style permissions apply (`browse_backlog`,
  `create_items`, `edit_items`, `transition_items`, `assign_items`, `add_comments`…).
  A backlog the owner cannot read answers « introuvable », like the interface.
- **Scope**: `write` implies `read`; a `read` token is refused on write tools before any work.
- **Budget**: 300 requests per minute and per token, shared with the REST API; a refusal
  says how long to wait.
- **Traceability**: every write is an activity with `source = mcp` and the token id; the
  board updates live for open tabs.
- **Revocation**: revoke the token on the « Jetons d'accès » page; an administrator's
  password or 2FA reset revokes all of the user's tokens.

## Local check

```bash
curl -s https://jiroo-dev.vercel.app/api/mcp -H "Authorization: Bearer $JIROO_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
