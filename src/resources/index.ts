import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'fs';
import path from 'path';
import { MODULES_ROOT, walkDir } from '../utils/fs-guard.js';

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
      "helpText": "Usage: /hello",
      "function": "src/commands/hello/index.js",
      "arguments": []
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
}
