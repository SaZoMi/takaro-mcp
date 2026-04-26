import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getClient } from '../client.js';

export function registerPlayerActionTools(server: McpServer): void {

  server.tool(
    'player_action',
    'Perform a moderation or management action on a player on a game server. Actions: ban (with optional reason), unban, kick (reason required), teleport (x/y/z required), give_item (itemName + amount + quality required), send_message (message to whole server). WARNING: do not call ban/kick without user confirmation.',
    {
      action: z.enum(['ban', 'unban', 'kick', 'teleport', 'give_item', 'send_message'])
        .describe('Action to perform on the player'),
      gameServerId: z.string().describe('Game server ID from list_game_servers'),
      playerId: z.string().describe('Player ID from list_players'),
      reason: z.string().optional().describe('Reason string (ban, kick)'),
      x: z.number().optional().describe('X coordinate (teleport)'),
      y: z.number().optional().describe('Y coordinate (teleport)'),
      z_coord: z.number().optional().describe('Z coordinate (teleport)'),
      itemName: z.string().optional().describe('Item name/id to give (give_item)'),
      amount: z.number().optional().describe('Amount (give_item, default 1)'),
      quality: z.string().optional().describe('Item quality string (give_item, e.g. "1" or "normal")'),
      message: z.string().optional().describe('Message text (send_message, broadcasts to the whole server)'),
    },
    async ({ action, gameServerId, playerId, reason, x, y, z_coord, itemName, amount, quality, message }) => {
      try {
        const client = await getClient();
        switch (action) {
          case 'ban':
            await client.gameserver.gameServerControllerBanPlayer(gameServerId, playerId, { reason });
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, action: 'ban', playerId, reason }) }] };

          case 'unban':
            await client.gameserver.gameServerControllerUnbanPlayer(gameServerId, playerId);
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, action: 'unban', playerId }) }] };

          case 'kick':
            if (!reason) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_REASON', message: 'reason is required for kick' }) }] };
            await client.gameserver.gameServerControllerKickPlayer(gameServerId, playerId, { reason });
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, action: 'kick', playerId, reason }) }] };

          case 'teleport':
            if (x === undefined || y === undefined || z_coord === undefined) {
              return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_COORDS', message: 'x, y, z_coord are all required for teleport' }) }] };
            }
            await client.gameserver.gameServerControllerTeleportPlayer(gameServerId, playerId, { x, y, z: z_coord });
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, action: 'teleport', playerId, x, y, z: z_coord }) }] };

          case 'give_item':
            if (!itemName) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ITEM', message: 'itemName is required for give_item' }) }] };
            await client.gameserver.gameServerControllerGiveItem(gameServerId, playerId, {
              name: itemName,
              amount: amount ?? 1,
              quality: quality ?? '1',
            });
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, action: 'give_item', playerId, itemName, amount: amount ?? 1 }) }] };

          case 'send_message':
            if (!message) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_MESSAGE', message: 'message is required for send_message' }) }] };
            await client.gameserver.gameServerControllerSendMessage(gameServerId, { message });
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, action: 'send_message', message }) }] };
        }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'PLAYER_ACTION_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'execute_server_command',
    'Execute a raw admin/RCON command on a game server and return the output. Use for direct console commands e.g. "say Hello" or "gamemode survival PlayerName".',
    {
      gameServerId: z.string().describe('Game server ID'),
      command: z.string().describe('Raw console command, e.g. "say Hello World"'),
    },
    async ({ gameServerId, command }) => {
      try {
        const client = await getClient();
        const result = await client.gameserver.gameServerControllerExecuteCommand(gameServerId, { command });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'EXECUTE_COMMAND_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'manage_bans',
    'List in-game bans on a game server. action="list" returns active bans for the specified game server.',
    {
      action: z.enum(['list']).describe('Action (currently only list is supported)'),
      gameServerId: z.string().describe('Game server ID to list bans for'),
    },
    async ({ gameServerId }) => {
      try {
        const client = await getClient();
        const result = await client.gameserver.gameServerControllerListBans(gameServerId);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MANAGE_BANS_ERROR', message: String(err) }) }] };
      }
    },
  );
}
