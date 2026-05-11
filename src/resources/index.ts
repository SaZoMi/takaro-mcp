import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'fs';
import path from 'path';
import { MODULES_ROOT, walkDir } from '../utils/fs-guard.js';
import { listKnownIssuePrompts, loadKnownIssues, formatIssuesAsMarkdown } from '../utils/known-issues.js';

const MODULE_TEMPLATE = `# Takaro Module Code Pattern

Every command, hook, cronjob, and function file MUST follow this exact structure:

\`\`\`js
import { data, takaro, checkPermission, TakaroUserError } from '@takaro/helpers';

async function main() {
  // data contains: pog, player, gameServerId, module (config + moduleId)
  const { pog, player, gameServerId, module: mod } = data;

  // Example: send a message to the player
  await pog.pm('Hello from your module!');

  // Example: check permission before proceeding
  if (!checkPermission(pog, 'MY_PERMISSION')) {
    throw new TakaroUserError('You do not have permission to use this command.');
  }

  // Example: add currency to a player
  await takaro.playerOnGameserver.playerOnGameServerControllerAddCurrency(
    gameServerId,
    pog.playerId,
    { currency: 100 }
  );

  // Example: read a variable
  const vars = await takaro.variable.variableControllerSearch({
    filters: { key: ['my-key'], gameServerId: [gameServerId], moduleId: [mod.moduleId] }
  });
  const existing = vars.data.data[0];

  // Example: create or update a variable
  if (!existing) {
    await takaro.variable.variableControllerCreate({
      key: 'my-key',
      value: JSON.stringify({ count: 1 }),
      gameServerId,
      moduleId: mod.moduleId,
      playerId: player.id,
    });
  }

  // Example: broadcast to the whole server
  await takaro.gameserver.gameServerControllerSendMessage(gameServerId, {
    message: 'Announcement to all players!'
  });
}

await main();
\`\`\`

## Key rules
- ALWAYS import from \`@takaro/helpers\` (not from the Takaro API client directly)
- ALWAYS wrap logic in \`async function main()\` and call \`await main()\` at the end
- Use \`TakaroUserError\` for player-facing errors (shows message instead of stack trace)
- \`data.pog\` = player on game server (has .pm(), .playerId, .online, etc.)
- \`data.player\` = global player object (has .id, .name)
- \`data.gameServerId\` = string ID of the game server
- \`data.module.moduleId\` = string ID of the module (for variable scoping)
- \`data.module.userConfig\` = parsed module config values
- Module functions (shared helpers) are available only if defined in module.json and referenced

## Minimal module.json
\`\`\`json
{
  "name": "my-module",
  "description": "What this module does",
  "version": "latest",
  "supportedGames": ["all"],
  "config": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  },
  "permissions": [],
  "commands": {
    "hello": {
      "trigger": "hello",
      "description": "Say hello",
      "helpText": "Usage: /hello [name]",
      "function": "src/commands/hello/index.js",
      "arguments": [
        {
          "name": "name",
          "type": "string",
          "helpText": "Who to greet",
          "position": 0,
          "defaultValue": "world"
        }
      ]
    }
  },
  "hooks": {},
  "cronJobs": {},
  "functions": {}
}
\`\`\`

## Available takaro.* methods inside module code
- \`takaro.playerOnGameserver.playerOnGameServerControllerAddCurrency(gameServerId, playerId, { currency })\`
- \`takaro.playerOnGameserver.playerOnGameServerControllerDeductCurrency(gameServerId, playerId, { currency })\`
- \`takaro.playerOnGameserver.playerOnGameServerControllerGetOne(gameServerId, playerId)\`
- \`takaro.playerOnGameserver.playerOnGameServerControllerSearch({ filters })\`
- \`takaro.variable.variableControllerCreate({ key, value, gameServerId, moduleId, playerId? })\`
- \`takaro.variable.variableControllerSearch({ filters: { key, gameServerId, moduleId, playerId } })\`
- \`takaro.variable.variableControllerUpdate(id, { value })\`
- \`takaro.variable.variableControllerDelete(id)\`
- \`takaro.gameserver.gameServerControllerSendMessage(gameServerId, { message })\`
- \`takaro.player.playerControllerGetOne(playerId)\`
- \`pog.pm(message)\` — send a private message to the triggering player
`;

const API_REFERENCE = `# Takaro Module API Reference

## What is available inside module code

Module code runs in a sandboxed JavaScript environment with access to \`@takaro/helpers\`.

### The \`data\` object
\`\`\`ts
data.pog          // PlayerOnGameServer — the player who triggered the event
data.player       // Player — global player record
data.gameServerId // string — current game server ID
data.module = {
  moduleId: string,       // ID of this module installation
  userConfig: object,     // Parsed config from module.json config schema
}
// For commands:
data.arguments    // Parsed command arguments as defined in module.json
// For hooks:
data.eventData    // Raw event payload
// For cronjobs:
// (no extra data fields)
\`\`\`

### pog methods
\`\`\`js
await pog.pm('message')           // Send private message to triggering player
pog.playerId                      // Player's UUID
pog.online                        // boolean
pog.currency                      // Current currency balance
\`\`\`

### checkPermission
\`\`\`js
import { checkPermission } from '@takaro/helpers';
// Returns true if player has the permission (optionally with a minimum count)
checkPermission(pog, 'PERMISSION_CODE')
checkPermission(pog, 'PERMISSION_CODE', minCount)
\`\`\`

### TakaroUserError
\`\`\`js
import { TakaroUserError } from '@takaro/helpers';
// Throws a user-facing error (shown as a message, not a stack trace)
throw new TakaroUserError('You cannot do that!');
\`\`\`

### Hook event types (for module.json hooks[].eventType)
- \`player-connected\`
- \`player-disconnected\`
- \`chat-message\`
- \`player-death\`
- \`entity-killed\`
- \`log\`

### CronJob temporalValue examples
- \`0 * * * *\`   — every hour
- \`0 0 * * *\`   — daily at midnight UTC
- \`*/5 * * * *\` — every 5 minutes

### Command argument types
- \`string\` — text argument
- \`number\` — numeric argument
- \`boolean\` — true/false flag
- \`player\` — resolves to a player object

### Command argument schema (module.json)
Arguments are defined as an array under the command. Each argument **must** have a \`position\` (0-based index). Do **not** use \`required\` — that field does not exist in the DB and will cause a 500 error on import.

\`\`\`json
"arguments": [
  {
    "name": "target",
    "type": "player",
    "helpText": "The player to target",
    "position": 0
  },
  {
    "name": "amount",
    "type": "number",
    "helpText": "How much to give",
    "position": 1,
    "defaultValue": "100"
  }
]
\`\`\`

- Use \`"position": <index>\` to order arguments (starting at 0)
- Optional arguments should include \`"defaultValue": "<value>"\`
- Never add a \`"required"\` field — it will break the import

### Error handling pattern
\`\`\`js
try {
  // critical operation
} catch (err) {
  // Use TakaroUserError for player-visible messages
  // Use console.log for debugging (visible in event logs)
  console.log('Error details:', err.message);
  throw new TakaroUserError('Something went wrong, please try again.');
}
\`\`\`
`;

const BOT_API_REFERENCE = `# Bot API Reference

The bot service provides an HTTP API for creating and controlling Minecraft player bots for testing. The port is configured by \`BOT_PORT\` in \`.env\` (default 3101).

**Base URL**: \`http://localhost:\${BOT_PORT:-3101}\`

All POST endpoints require \`Content-Type: application/json\` header.

## Bot Management

### Create a bot
\`\`\`
POST /bots
{"name": "tester"}
\`\`\`
Returns: \`{created: "tester", username: "Bot_tester"}\`

Bot usernames follow the pattern \`Bot_<name>\`. The combined username must not exceed 16 characters (Minecraft limit), so bot names can be at most 12 characters.

### Destroy a bot
\`\`\`
DELETE /bots/:name
\`\`\`
Returns: \`204 No Content\`

### Status (all bots)
\`\`\`
GET /status
\`\`\`
Returns status of all active bots including: connected, name, username, health, food, position, gameMode. Returns \`{}\` when no bots exist.

### List all bots
\`\`\`
GET /bots
\`\`\`

## Per-Bot Actions

### Chat (send message or Takaro command)
\`\`\`
POST /bot/:name/chat
{"message": "+ping"}
\`\`\`
Use the correct command prefix (fetch from settings API — typically \`+\` or \`/\`).

### Move to coordinates
\`\`\`
POST /bot/:name/move
{"x": 100, "y": 64, "z": 100}
\`\`\`
Continuous forward motion for up to 30 seconds or until within 2 blocks of target.

### Attack nearest entity
\`\`\`
POST /bot/:name/attack
\`\`\`

### Interact with block in sight
\`\`\`
POST /bot/:name/use
\`\`\`
5 block range.

### Look at coordinates
\`\`\`
POST /bot/:name/look
{"x": 100, "y": 64, "z": 100}
\`\`\`

### Jump
\`\`\`
POST /bot/:name/jump
\`\`\`
0.5 second hold.

### Respawn (after death)
\`\`\`
POST /bot/:name/respawn
\`\`\`

## Per-Bot Queries

### Online players
\`\`\`
GET /bot/:name/players
\`\`\`
Returns: \`[{username, uuid, ping, gamemode}, ...]\`

### Position
\`\`\`
GET /bot/:name/position
\`\`\`
Returns: \`{x, y, z}\`

### Health
\`\`\`
GET /bot/:name/health
\`\`\`
Returns: \`{health, food, saturation}\`

### Inventory
\`\`\`
GET /bot/:name/inventory
\`\`\`
Returns: \`[{name, count, slot, displayName}, ...]\`

## Usage Example

\`\`\`bash
# Create a bot
curl -X POST http://localhost:\${BOT_PORT:-3101}/bots \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"tester"}'

# Wait for connection
sleep 5
curl http://localhost:\${BOT_PORT:-3101}/status

# Trigger a command
curl -X POST http://localhost:\${BOT_PORT:-3101}/bot/tester/chat \\
  -H 'Content-Type: application/json' \\
  -d '{"message":"/greet World"}'

# Clean up
curl -X DELETE http://localhost:\${BOT_PORT:-3101}/bots/tester
\`\`\`

## Troubleshooting

- If a bot returns 503, the Minecraft server is likely still starting — wait and retry
- Bots auto-reconnect after server restarts with exponential backoff (5s to 60s)
- If the bot can't connect, check \`docker compose logs bot\` and \`docker compose logs paper\`
`;

export function registerResources(server: McpServer): void {

  // Static: canonical module code pattern
  server.resource(
    'module-template',
    'takaro://module-template',
    async (_uri) => ({
      contents: [{ uri: 'takaro://module-template', mimeType: 'text/markdown', text: MODULE_TEMPLATE }],
    }),
  );

  // Static: curated API reference
  server.resource(
    'api-reference',
    'takaro://api-reference',
    async (_uri) => ({
      contents: [{ uri: 'takaro://api-reference', mimeType: 'text/markdown', text: API_REFERENCE }],
    }),
  );

  // Static: bot HTTP API reference (read on demand — not injected into every prompt)
  server.resource(
    'bot-api',
    'takaro://bot-api',
    async (_uri) => ({
      contents: [{ uri: 'takaro://bot-api', mimeType: 'text/markdown', text: BOT_API_REFERENCE }],
    }),
  );

  // Dynamic: list of reference module names on disk
  server.resource(
    'reference-modules',
    'takaro://reference-modules',
    async (_uri) => {
      const modules: string[] = fs.existsSync(MODULES_ROOT)
        ? fs.readdirSync(MODULES_ROOT, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
        : [];
      const text = JSON.stringify(
        modules.map((m) => ({ name: m, uri: `takaro://reference-modules/${m}` })),
        null, 2,
      );
      return { contents: [{ uri: 'takaro://reference-modules', mimeType: 'application/json', text }] };
    },
  );

  // Dynamic: full file map of a specific reference module
  server.resource(
    'reference-module-detail',
    new ResourceTemplate('takaro://reference-modules/{name}', { list: undefined }),
    async (uri, { name }) => {
      const moduleName = Array.isArray(name) ? name[0] : name;
      if (!moduleName) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: 'name is required' }) }] };
      }
      const dir = path.resolve(MODULES_ROOT, moduleName);
      if (!fs.existsSync(dir)) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: `Module '${moduleName}' not found` }) }] };
      }
      const files = walkDir(dir);
      const fileMap: Record<string, string> = {};
      for (const f of files) {
        const abs = path.join(dir, f);
        try { fileMap[f] = fs.readFileSync(abs, 'utf-8'); } catch { fileMap[f] = '(binary or unreadable)'; }
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ name: moduleName, files: fileMap }, null, 2),
        }],
      };
    },
  );

  // Dynamic: live file map of a module under development
  server.resource(
    'module-files',
    new ResourceTemplate('takaro://module/{name}/files', { list: undefined }),
    async (uri, { name }) => {
      const moduleName = Array.isArray(name) ? name[0] : name;
      if (!moduleName) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: 'name is required' }) }] };
      }
      const dir = path.resolve(MODULES_ROOT, moduleName);
      if (!fs.existsSync(dir)) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: `Module '${moduleName}' not found` }) }] };
      }
      const files = walkDir(dir);
      const fileMap: Record<string, string> = {};
      for (const f of files) {
        const abs = path.join(dir, f);
        try { fileMap[f] = fs.readFileSync(abs, 'utf-8'); } catch { fileMap[f] = '(binary or unreadable)'; }
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ name: moduleName, files: fileMap }, null, 2),
        }],
      };
    },
  );

  // Dynamic: list all prompts that have recorded known issues
  server.resource(
    'known-issues-index',
    'takaro://known-issues',
    async (_uri) => {
      const prompts = listKnownIssuePrompts();
      const text = JSON.stringify(
        prompts.map(p => ({ prompt: p, uri: `takaro://known-issues/${p}` })),
        null, 2,
      );
      return { contents: [{ uri: 'takaro://known-issues', mimeType: 'application/json', text }] };
    },
  );

  // Dynamic: known failure patterns for a specific prompt, formatted for the agent
  server.resource(
    'known-issues-detail',
    new ResourceTemplate('takaro://known-issues/{promptName}', { list: undefined }),
    async (uri, { promptName }) => {
      const name = Array.isArray(promptName) ? promptName[0] : promptName;
      if (!name) {
        return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: 'No prompt name provided.' }] };
      }
      const issues = loadKnownIssues(name);
      const text = `# Known Issues: ${name}\n\nThese errors occurred in previous runs. Avoid repeating them.\n\n${formatIssuesAsMarkdown(issues)}`;
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
    },
  );
}
