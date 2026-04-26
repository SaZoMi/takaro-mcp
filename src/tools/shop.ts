import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getClient } from '../client.js';

export function registerShopTools(server: McpServer): void {

  server.tool(
    'manage_shop',
    'Manage the Takaro in-game shop: listings (items for sale), orders (purchases), and categories. For create_listing, provide gameServerId, name, price, and an items array (each with amount and optional itemId/quality/code).',
    {
      action: z.enum([
        'list_listings', 'get_listing', 'create_listing', 'delete_listing',
        'search_orders', 'get_order', 'claim_order', 'cancel_order',
        'list_categories', 'get_category', 'create_category', 'update_category', 'delete_category',
      ]),
      id: z.string().optional().describe('Resource ID (for get/delete/claim/cancel)'),
      gameServerId: z.string().optional().describe('Game server ID (required for create_listing)'),
      limit: z.number().optional().describe('Max results (default 20)'),
      // listing
      name: z.string().optional().describe('Name (create_listing, create_category, update_category)'),
      price: z.number().optional().describe('Price in currency (create_listing)'),
      items: z.array(z.object({
        amount: z.number().describe('Item quantity'),
        itemId: z.string().optional().describe('Takaro item ID'),
        quality: z.string().optional().describe('Item quality string'),
        code: z.string().optional().describe('Item code/id string'),
      })).optional().describe('Items included in the listing (create_listing)'),
      // order
      listingId: z.string().optional().describe('Listing ID (create_order)'),
      playerId: z.string().optional().describe('Player ID filter (search_orders)'),
      // category
      description: z.string().optional().describe('Category description'),
    },
    async ({ action, id, gameServerId, limit = 20, name, price, items, listingId, playerId, description }) => {
      try {
        const client = await getClient();

        switch (action) {
          case 'list_listings': {
            const result = await client.shopListing.shopListingControllerSearch({
              filters: { ...(gameServerId ? { gameServerId: [gameServerId] } : {}) },
              limit,
            });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'get_listing': {
            if (!id) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ID', message: 'id is required' }) }] };
            const result = await client.shopListing.shopListingControllerGetOne(id);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'create_listing': {
            if (!name || price === undefined || !gameServerId || !items?.length) {
              return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_FIELDS', message: 'name, price, gameServerId, and items[] are required for create_listing' }) }] };
            }
            const result = await client.shopListing.shopListingControllerCreate({ name, price, gameServerId, items });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'delete_listing': {
            if (!id) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ID', message: 'id is required' }) }] };
            await client.shopListing.shopListingControllerDelete(id);
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, deleted: id }) }] };
          }

          case 'search_orders': {
            const result = await client.shopOrder.shopOrderControllerSearch({
              filters: {
                ...(playerId ? { playerId: [playerId] } : {}),
              },
              limit,
            });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'get_order': {
            if (!id) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ID', message: 'id is required' }) }] };
            const result = await client.shopOrder.shopOrderControllerGetOne(id);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'claim_order': {
            if (!id) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ID', message: 'id is required' }) }] };
            const result = await client.shopOrder.shopOrderControllerClaim(id);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'cancel_order': {
            if (!id) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ID', message: 'id is required' }) }] };
            const result = await client.shopOrder.shopOrderControllerCancel(id);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }

          case 'list_categories': {
            const result = await client.shopCategory.shopCategoryControllerSearch({ limit });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'get_category': {
            if (!id) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ID', message: 'id is required' }) }] };
            const result = await client.shopCategory.shopCategoryControllerGetOne(id);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'create_category': {
            if (!name) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_NAME', message: 'name is required' }) }] };
            const result = await client.shopCategory.shopCategoryControllerCreate(
              { name, ...(description ? { description } : {}) } as Parameters<typeof client.shopCategory.shopCategoryControllerCreate>[0]
            );
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'update_category': {
            if (!id) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ID', message: 'id is required' }) }] };
            const result = await client.shopCategory.shopCategoryControllerUpdate(
              id,
              { ...(name ? { name } : {}), ...(description ? { description } : {}) } as Parameters<typeof client.shopCategory.shopCategoryControllerUpdate>[1]
            );
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'delete_category': {
            if (!id) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ID', message: 'id is required' }) }] };
            await client.shopCategory.shopCategoryControllerRemove(id);
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, deleted: id }) }] };
          }
        }

        void listingId; // unused in current actions
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MANAGE_SHOP_ERROR', message: String(err) }) }] };
      }
    },
  );
}
