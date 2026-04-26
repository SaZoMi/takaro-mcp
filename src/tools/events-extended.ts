import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EventSearchInputAllowedFiltersEventNameEnum } from '@takaro/apiclient';
import { getClient } from '../client.js';

export function registerEventsExtendedTools(server: McpServer): void {

  server.tool(
    'search_events',
    'Directly query the Takaro event log with filters. Unlike poll_events (which waits for a new event), this immediately returns matching historical events. Useful for debugging, auditing, and checking past executions.',
    {
      gameServerId: z.string().optional().describe('Filter by game server ID'),
      eventName: z.nativeEnum(EventSearchInputAllowedFiltersEventNameEnum).optional()
        .describe('Filter by event type, e.g. "command-executed", "hook-executed", "player-connected"'),
      moduleId: z.string().optional().describe('Filter by module ID'),
      playerId: z.string().optional().describe('Filter by player ID'),
      afterTimestamp: z.string().optional().describe('Only return events after this ISO timestamp'),
      limit: z.number().optional().describe('Max number of events to return (default 20, max 100)'),
      page: z.number().optional().describe('Page number for pagination (default 0)'),
    },
    async ({ gameServerId, eventName, moduleId, playerId, afterTimestamp, limit = 20, page = 0 }) => {
      try {
        const client = await getClient();

        const result = await client.event.eventControllerSearch({
          filters: {
            ...(eventName ? { eventName: [eventName] } : {}),
            ...(gameServerId ? { gameserverId: [gameServerId] } : {}),
            ...(moduleId ? { moduleId: [moduleId] } : {}),
            ...(playerId ? { playerId: [playerId] } : {}),
          },
          greaterThan: afterTimestamp ? { createdAt: afterTimestamp } : undefined,
          limit: Math.min(limit, 100),
          page,
        });

        const events = result.data.data.map((ev) => {
          const meta = ev.meta as unknown as Record<string, unknown> | undefined;
          const res = meta?.['result'] as Record<string, unknown> | undefined;
          return {
            id: ev.id,
            eventName: ev.eventName,
            createdAt: ev.createdAt,
            success: res?.['success'] ?? null,
            logs: res?.['logs'] ?? null,
          };
        });

        return { content: [{ type: 'text' as const, text: JSON.stringify({ total: result.data.meta?.total ?? events.length, page, events }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'SEARCH_EVENTS_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'get_failed_events',
    'Get recent failed function executions (commands, hooks, or cronjobs that errored). Returns the error logs so you can debug module code issues.',
    {
      gameServerId: z.string().optional().describe('Filter by game server ID'),
      moduleId: z.string().optional().describe('Filter by module ID'),
      limit: z.number().optional().describe('Max results (default 20)'),
    },
    async ({ gameServerId, moduleId, limit = 20 }) => {
      try {
        const client = await getClient();

        const result = await client.event.eventControllerSearch({
          filters: {
            ...(gameServerId ? { gameserverId: [gameServerId] } : {}),
            ...(moduleId ? { moduleId: [moduleId] } : {}),
          },
          limit: Math.min(limit, 100),
        });

        const failed = result.data.data.filter((ev) => {
          const meta = ev.meta as unknown as Record<string, unknown> | undefined;
          const res = meta?.['result'] as Record<string, unknown> | undefined;
          return res?.['success'] === false;
        }).map((ev) => {
          const meta = ev.meta as unknown as Record<string, unknown> | undefined;
          const res = meta?.['result'] as Record<string, unknown> | undefined;
          return { id: ev.id, eventName: ev.eventName, createdAt: ev.createdAt, logs: res?.['logs'] ?? null };
        });

        return { content: [{ type: 'text' as const, text: JSON.stringify(failed, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'GET_FAILED_EVENTS_ERROR', message: String(err) }) }] };
      }
    },
  );
}
