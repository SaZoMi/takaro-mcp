import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getClient } from '../client.js';

export function registerIntegrationTools(server: McpServer): void {

  server.tool(
    'discord',
    'Interact with Discord via the Takaro Discord bot. Actions: send_message (post a message to a channel), get_channels (list channels in a guild), get_guilds (list connected Discord servers), get_roles (list roles in a guild).',
    {
      action: z.enum(['send_message', 'get_channels', 'get_guilds', 'get_roles'])
        .describe('Action to perform'),
      guildId: z.string().optional().describe('Discord guild/server ID (get_channels, get_roles)'),
      channelId: z.string().optional().describe('Discord channel ID (send_message)'),
      message: z.string().optional().describe('Message text to send (send_message)'),
      limit: z.number().optional().describe('Max results (get_guilds, default 20)'),
    },
    async ({ action, guildId, channelId, message, limit = 20 }) => {
      try {
        const client = await getClient();
        switch (action) {
          case 'send_message': {
            if (!channelId || !message) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_PARAMS', message: 'channelId and message are required' }) }] };
            const result = await client.discord.discordControllerSendMessage(channelId, { content: message } as Parameters<typeof client.discord.discordControllerSendMessage>[1]);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }] };
          }
          case 'get_channels': {
            if (!guildId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_GUILD_ID', message: 'guildId is required' }) }] };
            const result = await client.discord.discordControllerGetChannels(guildId);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }] };
          }
          case 'get_guilds': {
            const result = await client.discord.discordControllerSearch({ limit });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'get_roles': {
            if (!guildId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_GUILD_ID', message: 'guildId is required' }) }] };
            const result = await client.discord.discordControllerGetRoles(guildId);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }] };
          }
        }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'DISCORD_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'manage_items',
    'Look up game items in Takaro. Actions: search (find items by name or filter), get (get item details by ID). Useful when building shop listings or give_item calls.',
    {
      action: z.enum(['search', 'get']).describe('Action to perform'),
      itemId: z.string().optional().describe('Item ID (get)'),
      name: z.string().optional().describe('Search by name (search)'),
      gameServerId: z.string().optional().describe('Filter by game server (search)'),
      limit: z.number().optional().describe('Max results (search, default 20)'),
    },
    async ({ action, itemId, name, gameServerId, limit = 20 }) => {
      try {
        const client = await getClient();
        switch (action) {
          case 'search': {
            const result = await client.item.itemControllerSearch({
              filters: { ...(gameServerId ? { gameserverId: [gameServerId] } : {}) },
              search: name ? { name: [name] } : undefined,
              limit,
            });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'get': {
            if (!itemId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ITEM_ID', message: 'itemId is required' }) }] };
            const result = await client.item.itemControllerFindOne(itemId);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
        }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MANAGE_ITEMS_ERROR', message: String(err) }) }] };
      }
    },
  );
}
