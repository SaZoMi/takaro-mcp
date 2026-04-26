import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  StatsControllerGetActivityStatsTimeTypeEnum,
  StatsControllerGetActivityStatsDataTypeEnum,
  StatsControllerGetEventsCountEventNameEnum,
  StatsControllerGetEventsCountBucketStepEnum,
} from '@takaro/apiclient';
import { getClient } from '../client.js';

export function registerMonitoringTools(server: McpServer): void {

  server.tool(
    'get_stats',
    'Query Takaro statistics. Actions: activity (player activity, requires timeType and dataType), currency (economy curve for a server), player_online (online count over time), events_count (event frequency, requires eventName), latency (server latency, requires gameServerId), ping (player ping, requires gameServerId and playerId), country (player country distribution).',
    {
      action: z.enum(['activity', 'currency', 'player_online', 'events_count', 'latency', 'ping', 'country']),
      gameServerId: z.string().optional().describe('Game server ID (required for currency, latency, ping; optional filter for others)'),
      playerId: z.string().optional().describe('Player ID (required for ping)'),
      startDate: z.string().optional().describe('Start of time range (ISO timestamp)'),
      endDate: z.string().optional().describe('End of time range (ISO timestamp)'),
      // activity-specific
      timeType: z.nativeEnum(StatsControllerGetActivityStatsTimeTypeEnum).optional()
        .describe('Time bucketing for activity stats (required for activity)'),
      dataType: z.nativeEnum(StatsControllerGetActivityStatsDataTypeEnum).optional()
        .describe('Data series type for activity stats (required for activity)'),
      // events_count-specific
      eventName: z.nativeEnum(StatsControllerGetEventsCountEventNameEnum).optional()
        .describe('Event name to count (required for events_count)'),
      bucketStep: z.nativeEnum(StatsControllerGetEventsCountBucketStepEnum).optional()
        .describe('Time bucket size for events_count'),
    },
    async ({ action, gameServerId, playerId, startDate, endDate, timeType, dataType, eventName, bucketStep }) => {
      try {
        const client = await getClient();
        let result;

        switch (action) {
          case 'activity': {
            const tt = timeType ?? StatsControllerGetActivityStatsTimeTypeEnum.Daily;
            const dt = dataType ?? StatsControllerGetActivityStatsDataTypeEnum.Players;
            result = await client.stats.statsControllerGetActivityStats(tt, dt, gameServerId, startDate, endDate);
            break;
          }
          case 'currency': {
            if (!gameServerId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_GAME_SERVER', message: 'gameServerId is required for currency stats' }) }] };
            result = await client.stats.statsControllerGetCurrencyStats(gameServerId, undefined, startDate, endDate);
            break;
          }
          case 'player_online': {
            result = await client.stats.statsControllerGetPlayerOnlineStats(gameServerId, startDate, endDate);
            break;
          }
          case 'events_count': {
            if (!eventName) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_EVENT_NAME', message: 'eventName is required for events_count' }) }] };
            const bs = bucketStep ?? StatsControllerGetEventsCountBucketStepEnum._24h;
            result = await client.stats.statsControllerGetEventsCount(eventName, bs, undefined, gameServerId, undefined, playerId, undefined, startDate, endDate);
            break;
          }
          case 'latency': {
            if (!gameServerId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_GAME_SERVER', message: 'gameServerId is required for latency stats' }) }] };
            result = await client.stats.statsControllerGetLatencyStats(gameServerId, startDate, endDate);
            break;
          }
          case 'ping': {
            if (!gameServerId || !playerId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_PARAMS', message: 'gameServerId and playerId are required for ping stats' }) }] };
            result = await client.stats.statsControllerGetPingStats(gameServerId, playerId, startDate, endDate);
            break;
          }
          case 'country': {
            result = await client.stats.statsControllerGetCountryStats(gameServerId ? [gameServerId] : undefined);
            break;
          }
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(result!.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'GET_STATS_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'track_players',
    'Query player tracking data. Actions: movement_history (where a player has been), inventory_history (what items a player has had), players_by_item (find players who have a specific item), radius (players within X meters of coordinates), bounding_box (players within min/max X/Y/Z bounds).',
    {
      action: z.enum(['movement_history', 'inventory_history', 'players_by_item', 'radius', 'bounding_box']),
      playerId: z.string().optional().describe('Player ID (movement_history, inventory_history)'),
      itemId: z.string().optional().describe('Item ID (players_by_item)'),
      startDate: z.string().optional().describe('Start of time range (ISO)'),
      endDate: z.string().optional().describe('End of time range (ISO)'),
      // radius
      x: z.number().optional().describe('Center X (radius)'),
      y: z.number().optional().describe('Center Y (radius)'),
      z_coord: z.number().optional().describe('Center Z (radius)'),
      radius: z.number().optional().describe('Radius in meters (radius)'),
      // bounding box
      minX: z.number().optional().describe('Min X (bounding_box)'),
      maxX: z.number().optional().describe('Max X (bounding_box)'),
      minY: z.number().optional().describe('Min Y (bounding_box)'),
      maxY: z.number().optional().describe('Max Y (bounding_box)'),
      minZ: z.number().optional().describe('Min Z (bounding_box)'),
      maxZ: z.number().optional().describe('Max Z (bounding_box)'),
    },
    async ({ action, playerId, itemId, startDate, endDate, x, y, z_coord, radius, minX, maxX, minY, maxY, minZ, maxZ }) => {
      try {
        const client = await getClient();
        let result;

        // Helper: convert ISO string to the NOTDOMAINSCOPEDTakaroModelDTOCreatedAt shape
        const toDate = (s?: string) => s ? { value: s } as unknown as Parameters<typeof client.tracking.trackingControllerGetPlayerInventoryHistory>[0] extends { startDate?: infer T } ? T : never : undefined;

        switch (action) {
          case 'movement_history': {
            result = await client.tracking.trackingControllerGetPlayerMovementHistory({
              ...(playerId ? { playerId: [playerId] } : {}),
              ...(startDate ? { startDate } : {}),
              ...(endDate ? { endDate } : {}),
            } as unknown as Parameters<typeof client.tracking.trackingControllerGetPlayerMovementHistory>[0]);
            break;
          }
          case 'inventory_history': {
            if (!playerId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_PLAYER_ID', message: 'playerId is required' }) }] };
            result = await client.tracking.trackingControllerGetPlayerInventoryHistory({
              playerId,
              ...(startDate ? { startDate } : {}),
              ...(endDate ? { endDate } : {}),
            } as unknown as Parameters<typeof client.tracking.trackingControllerGetPlayerInventoryHistory>[0]);
            break;
          }
          case 'players_by_item': {
            if (!itemId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ITEM_ID', message: 'itemId is required' }) }] };
            result = await client.tracking.trackingControllerGetPlayersByItem({ itemId } as Parameters<typeof client.tracking.trackingControllerGetPlayersByItem>[0]);
            break;
          }
          case 'radius': {
            if (x === undefined || y === undefined || z_coord === undefined || radius === undefined) {
              return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_COORDS', message: 'x, y, z_coord, radius are all required' }) }] };
            }
            result = await client.tracking.trackingControllerGetRadiusPlayers({ x, y, z: z_coord, radius } as Parameters<typeof client.tracking.trackingControllerGetRadiusPlayers>[0]);
            break;
          }
          case 'bounding_box': {
            if (minX === undefined || maxX === undefined || minY === undefined || maxY === undefined || minZ === undefined || maxZ === undefined) {
              return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_BOUNDS', message: 'minX, maxX, minY, maxY, minZ, maxZ are all required' }) }] };
            }
            result = await client.tracking.trackingControllerGetBoundingBoxPlayers({ minX, maxX, minY, maxY, minZ, maxZ } as Parameters<typeof client.tracking.trackingControllerGetBoundingBoxPlayers>[0]);
            break;
          }
        }

        void toDate; // suppress unused warning
        return { content: [{ type: 'text' as const, text: JSON.stringify(result!.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'TRACK_PLAYERS_ERROR', message: String(err) }) }] };
      }
    },
  );
}
