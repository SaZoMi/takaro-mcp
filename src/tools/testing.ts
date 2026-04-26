import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  EventSearchInputAllowedFiltersEventNameEnum,
  SettingsControllerGetKeysEnum,
  type VariableSearchInputAllowedFilters,
} from '@takaro/apiclient';
import { getClient } from '../client.js';

export function registerTestingTools(server: McpServer): void {

  server.tool(
    'list_players',
    'List players registered on a game server. Returns playerId, name, and online status. Use this to get a playerId for trigger_command.',
    {
      gameServerId: z.string().describe('Game server ID from list_game_servers'),
      onlineOnly: z.boolean().optional().describe('If true, only return currently online players (default: false)'),
    },
    async ({ gameServerId, onlineOnly }) => {
      try {
        const client = await getClient();
        const result = await client.playerOnGameserver.playerOnGameServerControllerSearch({
          filters: { gameServerId: [gameServerId], ...(onlineOnly ? { online: [true] } : {}) },
          limit: 100,
        });
        const players = result.data.data.map((p) => ({
          playerId: p.playerId,
          playerOnGameserverId: p.id,
          online: p.online ?? null,
        }));
        return { content: [{ type: 'text' as const, text: JSON.stringify(players, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'LIST_PLAYERS_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'get_command_prefix',
    'Get the command prefix configured for a game server (e.g. "/" for Minecraft). Needed to construct the correct trigger message for trigger_command.',
    { gameServerId: z.string().describe('Game server ID') },
    async ({ gameServerId }) => {
      try {
        const client = await getClient();
        const result = await client.settings.settingsControllerGet(
          [SettingsControllerGetKeysEnum.CommandPrefix],
          gameServerId,
        );
        const prefix = result.data.data[0]?.value ?? '/';
        return { content: [{ type: 'text' as const, text: JSON.stringify({ prefix }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'GET_PREFIX_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'trigger_command',
    'Simulate a player sending a chat message (command) on a game server. Use get_command_prefix to build the correct message, e.g. "/hello" or "+daily". Returns a timestamp to use as the "after" parameter for poll_events.',
    {
      gameServerId: z.string().describe('Game server ID'),
      playerId: z.string().describe('Player ID from list_players'),
      message: z.string().describe('Full chat message including prefix, e.g. "/hello World"'),
    },
    async ({ gameServerId, playerId, message }) => {
      try {
        const client = await getClient();
        const timestamp = new Date().toISOString();
        await client.command.commandControllerTrigger(gameServerId, { msg: message, playerId });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ triggered: true, timestamp, gameServerId, playerId, message }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'TRIGGER_COMMAND_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'poll_events',
    'Poll for a Takaro execution event (CommandExecuted, HookExecuted, CronJobExecuted, etc.) on a game server after a given timestamp. Returns the event with meta.result.success and meta.result.logs when found. Use the timestamp from trigger_command as the afterTimestamp.',
    {
      gameServerId: z.string().describe('Game server ID'),
      eventName: z.nativeEnum(EventSearchInputAllowedFiltersEventNameEnum).describe('Event type to wait for, e.g. "command-executed"'),
      afterTimestamp: z.string().describe('ISO timestamp — only return events created after this time (use trigger_command\'s timestamp)'),
      timeoutMs: z.number().optional().describe('Max wait time in milliseconds (default: 30000)'),
      pollIntervalMs: z.number().optional().describe('Poll interval in milliseconds (default: 1500)'),
    },
    async ({ gameServerId, eventName, afterTimestamp, timeoutMs = 30000, pollIntervalMs = 1500 }) => {
      try {
        const client = await getClient();
        const deadline = Date.now() + timeoutMs;
        const after = new Date(afterTimestamp);

        while (Date.now() < deadline) {
          const result = await client.event.eventControllerSearch({
            filters: {
              eventName: [eventName as EventSearchInputAllowedFiltersEventNameEnum],
              gameserverId: [gameServerId],
            },
            greaterThan: { createdAt: after.toISOString() },
          });

          const events = result.data.data;
          if (events.length > 0) {
            const ev = events[0]!;
            const meta = ev.meta as unknown as Record<string, unknown> | undefined;
            const result2 = meta?.['result'] as Record<string, unknown> | undefined;
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  found: true,
                  eventId: ev.id,
                  createdAt: ev.createdAt,
                  success: result2?.['success'] ?? null,
                  logs: result2?.['logs'] ?? null,
                  meta: ev.meta,
                }),
              }],
            };
          }

          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify({ found: false, reason: 'timeout', timeoutMs }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'POLL_EVENTS_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'read_variables',
    'Read persistent module variables (key-value store). Filter by gameServerId, moduleId, key, or playerId. Use this to inspect module state (e.g. lottery pot, player streak data) without needing in-game access.',
    {
      gameServerId: z.string().optional().describe('Filter by game server ID'),
      moduleId: z.string().optional().describe('Filter by module ID'),
      key: z.string().optional().describe('Filter by variable key'),
      playerId: z.string().optional().describe('Filter by player ID'),
    },
    async ({ gameServerId, moduleId, key, playerId }) => {
      try {
        const client = await getClient();
        const filters: VariableSearchInputAllowedFilters = {};
        if (gameServerId) filters.gameServerId = [gameServerId];
        if (moduleId) filters.moduleId = [moduleId];
        if (key) filters.key = [key];
        if (playerId) filters.playerId = [playerId];

        const result = await client.variable.variableControllerSearch({ filters, limit: 100 });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'READ_VARIABLES_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'bot_action',
    'Control a Mineflayer test bot via the bot HTTP service (default port 3101). Actions: "create" spawns a bot, "chat" sends a message in-game, "status" checks if the bot is connected, "delete" removes the bot. The bot service must be running (docker compose up bot in ai-module-writer).',
    {
      action: z.enum(['create', 'chat', 'delete', 'status']).describe('Action to perform'),
      botName: z.string().describe('Bot username/name'),
      message: z.string().optional().describe('Chat message to send (required for action="chat")'),
    },
    async ({ action, botName, message }) => {
      const botPort = process.env['BOT_PORT'] ?? '3101';
      const baseUrl = `http://localhost:${botPort}`;
      try {
        let resp: Response;
        switch (action) {
          case 'create':
            resp = await fetch(`${baseUrl}/bots`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: botName }),
            });
            break;
          case 'chat':
            if (!message) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_MESSAGE', message: 'message is required for action="chat"' }) }] };
            resp = await fetch(`${baseUrl}/bots/${encodeURIComponent(botName)}/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message }),
            });
            break;
          case 'status':
            resp = await fetch(`${baseUrl}/bots/${encodeURIComponent(botName)}`);
            break;
          case 'delete':
            resp = await fetch(`${baseUrl}/bots/${encodeURIComponent(botName)}`, { method: 'DELETE' });
            break;
        }
        const text = await resp.text();
        let body: unknown;
        try { body = JSON.parse(text); } catch { body = text; }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: resp.status, ok: resp.ok, body }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'BOT_ACTION_ERROR', message: String(err), hint: `Is the bot service running? Check: docker compose up bot in ai-module-writer. Port: ${botPort}` }) }] };
      }
    },
  );
}
