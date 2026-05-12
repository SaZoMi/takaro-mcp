# Takaro MCP Server

An MCP (Model Context Protocol) server that gives an LLM coding agent full access to the [Takaro](https://takaro.io) game server management platform. The agent can write, deploy, and test Takaro modules autonomously through 36 tools covering the complete module development workflow.

## What It Does

Takaro lets you build **modules** — collections of JavaScript commands, hooks, cronjobs, and functions that run on game servers (Minecraft, etc.). This MCP server exposes tools so an LLM can:

- Write module source files locally
- Push and install modules to Takaro via the API
- Trigger commands and verify execution events
- Manage players, roles, bans, the shop, Discord, and more

## Prerequisites

- [Docker](https://www.docker.com/) (for the recommended deployment)
- A Takaro account with at least one domain and game server
- Node.js 22+ (only needed for local/dev deployment)

## Quick Start (Docker)

**1. Configure credentials**

```bash
cp .env.example .env
```

Edit `.env` with your Takaro credentials:

```env
TAKARO_HOST=https://api.next.takaro.dev
TAKARO_USERNAME=your@email.com
TAKARO_PASSWORD=yourpassword
TAKARO_DOMAIN_ID=YourDomainName
```

> **Finding your domain ID:** Log into the Takaro dashboard — the domain name shown in the top-left selector is the value for `TAKARO_DOMAIN_ID`.

**2. Start the server**

```bash
docker compose up -d
```

The server starts on `http://localhost:3000/mcp`. Check the logs to confirm:

```bash
docker compose logs
# Expected output:
#   Takaro connection: OK (YourDomainName)
#   Takaro MCP server listening on http://localhost:3000/mcp
```

**3. Stop the server**

```bash
docker compose down
```

---

## Connecting to Claude Code

Add a `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "takaro": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Start the MCP server first, then open Claude Code in the project directory. All 36 tools will be available natively as `mcp__takaro__<tool_name>`.

Verify the connection is live with:
```
/mcp
```

---

## Local Development (without Docker)

```bash
npm install --legacy-peer-deps
npm run build
node dist/index.js
```

The `modules/` directory is read from `MODULES_ROOT` (defaults to `D:/BachMCP/sazomi/ai-module-writer/modules`). Override via `.env`:

```env
MODULES_ROOT=C:/path/to/your/modules
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TAKARO_HOST` | Yes | — | Takaro API base URL |
| `TAKARO_USERNAME` | Yes | — | Account email |
| `TAKARO_PASSWORD` | Yes | — | Account password |
| `TAKARO_DOMAIN_ID` | Yes | — | Domain/workspace name |
| `PORT` | No | `3000` | HTTP port to listen on |
| `MODULES_ROOT` | No | `D:/BachMCP/sazomi/ai-module-writer/modules` | Path to local module directories |
| `BOT_PORT` | No | `3101` | Port for the Mineflayer bot service |

---

## Available Tools (36)

### Health
| Tool | Description |
|------|-------------|
| `ping` | Health check — returns `{ ok: true }` |

### Discovery
| Tool | Description |
|------|-------------|
| `list_game_servers` | List all registered game servers (id, name, type) |
| `list_modules` | List local (disk) or Takaro (API) modules |
| `get_openapi_spec` | Fetch and cache the Takaro OpenAPI spec, optionally filtered by keyword |

### Filesystem — Module Development
| Tool | Description |
|------|-------------|
| `scaffold_module` | Create a new module directory with minimal `module.json` and `src/` |
| `list_module_files` | List all files in a local module |
| `read_module_file` | Read any source file in a module |
| `write_module_file` | Write a command/hook/cronjob/function JS file |
| `read_module_json` | Read the `module.json` metadata |
| `write_module_json` | Write the full `module.json` (commands, hooks, cronJobs, config, permissions) |
| `delete_module_file` | Delete a stale file during iteration |

### Deployment
| Tool | Description |
|------|-------------|
| `push_module` | Convert local files → Takaro import JSON → push to API (idempotent) |
| `install_module` | Install a module version on a game server |
| `uninstall_module` | Uninstall a module from a game server |
| `delete_module_from_takaro` | Permanently delete a module from Takaro |
| `get_installed_modules` | List all installed modules across game servers |
| `manage_module_versions` | Get, search, or tag module versions |

### Testing & Verification
| Tool | Description |
|------|-------------|
| `list_players` | List players on a game server |
| `get_command_prefix` | Get the command prefix (e.g. `/`) for a game server |
| `trigger_command` | Simulate a player sending a command |
| `poll_events` | Wait for a specific execution event (command/hook/cronjob) |
| `search_events` | Query the event log directly with filters |
| `get_failed_events` | Get recent failed executions with error logs |
| `read_variables` | Read persistent module key-value variables |
| `bot_action` | Control a Mineflayer test bot (create, chat, delete, status) |

### Player & Server Management
| Tool | Description |
|------|-------------|
| `player_action` | Ban, unban, kick, teleport, give item, or send message to a player |
| `execute_server_command` | Execute a raw RCON/admin command on a game server |
| `manage_bans` | List active bans on a game server |
| `manage_hooks` | List, get, trigger, and get executions for hooks |
| `manage_cronjobs` | List, get, trigger, and get executions for cronjobs |
| `manage_roles` | Create, list, update, delete roles and list available permissions |

### Platform Features
| Tool | Description |
|------|-------------|
| `manage_shop` | Manage shop listings, orders, and categories |
| `get_stats` | Query activity, currency, player-online, event-count, latency, ping, and country stats |
| `track_players` | Query movement history, inventory history, radius, and bounding-box tracking |
| `discord` | Send messages and list channels/guilds via the Takaro Discord bot |
| `manage_items` | Search and look up game items |

---

## Resources

The server also exposes MCP resources readable by the LLM on demand — they are not injected into every request, so they do not bloat the context window unless explicitly read:

| URI | Description |
|-----|-------------|
| `takaro://module-template` | Canonical module code pattern — the exact import header, `async function main()` wrapper, and skeleton `module.json` |
| `takaro://api-reference` | Curated reference of all `takaro.*` API methods available inside module code |
| `takaro://reference-modules` | List of local reference modules the agent can read for examples |
| `takaro://reference-modules/{name}` | Full source of a reference module |
| `takaro://module/{name}/files` | Live file map of a module under development |
| `takaro://bot-api` | Full HTTP API reference for the Mineflayer test bot service (create, chat, status, delete, player queries, movement) |
| `takaro://known-issues` | List of all prompt names that have recorded failure patterns |
| `takaro://known-issues/{promptName}` | Known error patterns for a specific prompt, accumulated from previous failed eval runs |

---

## Module Development Workflow

The typical agent workflow for building a new module:

```
1. scaffold_module        → create module directory
2. write_module_file      → write JS source files
3. write_module_json      → define commands/hooks/cronJobs/config
4. push_module            → convert + import to Takaro
5. list_game_servers      → get gameServerId
6. install_module         → deploy to game server
7. list_players           → get a playerId for testing
8. trigger_command        → simulate player input
9. poll_events            → verify execution succeeded
10. get_failed_events     → debug if something went wrong
```

### Module Code Pattern

Every command, hook, cronjob, and function file must follow this structure:

```js
import { data, takaro, checkPermission, TakaroUserError } from '@takaro/helpers';

async function main() {
  const { pog, player, gameServerId, module: mod } = data;

  // Send a message to the triggering player
  await pog.pm('Hello!');

  // Broadcast to the whole server
  await takaro.gameserver.gameServerControllerSendMessage(gameServerId, {
    message: 'Hello everyone!',
  });
}

await main();
```

---

## Project Structure

```
takaro-mcp/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # Entry point — startup health check + HTTP server
    ├── server.ts             # McpServer factory + Express HTTP transport (port 3000)
    ├── client.ts             # Takaro API client singleton
    ├── scripts/
    │   ├── module-to-json.ts # Bundled converter (no ai-module-writer build needed)
    │   └── eval-runner.ts    # Evaluation harness — runs prompts against Claude, posts metrics to Langfuse
    ├── types/
    │   └── module.ts         # Shared module type definitions
    ├── utils/
    │   ├── fs-guard.ts       # Path-traversal guard + MODULES_ROOT resolution
    │   ├── validate.ts       # Entity name validation
    │   ├── langfuse.ts       # Langfuse client singleton
    │   ├── stream-parser.ts  # Parses Claude stream-json output into structured tool call records
    │   ├── eval-metrics.ts   # Derives 31 numeric scores from a parsed run
    │   └── known-issues.ts   # File-backed error memory per prompt (data/known-issues/)
    ├── tools/
    │   ├── discovery.ts
    │   ├── filesystem.ts
    │   ├── deployment.ts
    │   ├── testing.ts
    │   ├── player-actions.ts
    │   ├── events-extended.ts
    │   ├── module-components.ts
    │   ├── shop.ts
    │   ├── monitoring.ts
    │   └── integrations.ts
    └── resources/
        └── index.ts          # MCP resources (templates, API reference, bot API, known issues)
```

---

## Evaluation Harness

The `eval-runner` script benchmarks prompts against Claude models, traces every run to Langfuse, and accumulates failure patterns for future runs.

```bash
# Single prompt, single model
node dist/scripts/eval-runner.js --model claude-sonnet-4-6 --prompt build-server-messages --run-name baseline

# All prompts, all models
node dist/scripts/eval-runner.js --model all --prompt all --run-name baseline-v1
```

**What it does per run:**

1. Fetches the prompt from the MCP server (`prompts/list` + `prompts/get`)
2. Spawns `claude -p` with the prompt + a 6-step system prompt (known-issues → build → install → bot connect → test → cleanup)
3. Parses the `stream-json` output into structured tool call records
4. Runs emergency cleanup (uninstall module, delete bot) regardless of Claude's behaviour
5. Posts a hierarchical Langfuse trace with phase spans (build / deploy\_cycle\_N / fix\_N / cleanup), 31 numeric scores, and full token breakdown
6. Persists error patterns to `data/known-issues/{promptName}.json` for failed runs

**Langfuse scores posted (31 total):** `success`, `build_success`, `install_success`, `functional_test_passed`, `zero_shot_success`, `push_attempt_count`, `shot_count`, `self_correction_count`, `test_cycle_count`, `error_count`, `error_in_build`, `error_in_install`, `error_in_test`, `error_recovery_efficiency`, `duration_ms`, `build_duration_ms`, `test_duration_ms`, `time_to_first_push_ms`, `throughput_tools_per_min`, `num_turns`, `tool_call_count`, `total_tokens`, `input_tokens`, `output_tokens`, `reasoning_tokens`, `response_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `cost_usd`, `lines_of_code`, `module_complexity`

**Required env vars for eval:**

```env
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com
```
