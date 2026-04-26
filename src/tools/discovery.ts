import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs';
import { getClient } from '../client.js';
import { MODULES_ROOT } from '../utils/fs-guard.js';

let cachedOpenApiSpec: Record<string, unknown> | null = null;

export function registerDiscoveryTools(server: McpServer): void {

  server.tool(
    'list_game_servers',
    'List all game servers registered in Takaro. Returns id, name, type, and online status. Use this to get a gameServerId for deployment and testing.',
    { search: z.string().optional().describe('Optional name filter') },
    async ({ search }) => {
      try {
        const client = await getClient();
        const result = await client.gameserver.gameServerControllerSearch({
          filters: search ? { name: [search] } : undefined,
          limit: 100,
        });
        const servers = result.data.data.map((gs) => ({
          id: gs.id,
          name: gs.name,
          type: gs.type,
          online: (gs as unknown as Record<string, unknown>)['online'] ?? null,
        }));
        return { content: [{ type: 'text' as const, text: JSON.stringify(servers, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'TAKARO_API_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'list_modules',
    'List modules. source="local" lists module directories on disk (in MODULES_ROOT). source="takaro" lists modules already imported into Takaro via the API.',
    { source: z.enum(['local', 'takaro']).describe('"local" for disk modules, "takaro" for API modules') },
    async ({ source }) => {
      try {
        if (source === 'local') {
          if (!fs.existsSync(MODULES_ROOT)) {
            return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MODULES_ROOT_NOT_FOUND', message: `MODULES_ROOT does not exist: ${MODULES_ROOT}` }) }] };
          }
          const entries = fs.readdirSync(MODULES_ROOT, { withFileTypes: true });
          const modules = entries
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
          return { content: [{ type: 'text' as const, text: JSON.stringify(modules, null, 2) }] };
        } else {
          const client = await getClient();
          const result = await client.module.moduleControllerSearch({ limit: 100, page: 0 });
          const modules = result.data.data.map((m) => ({
            id: m.id,
            name: m.name,
            latestVersionId: m.latestVersion?.id ?? null,
          }));
          return { content: [{ type: 'text' as const, text: JSON.stringify(modules, null, 2) }] };
        }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'LIST_MODULES_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'get_openapi_spec',
    'Fetch the Takaro OpenAPI specification (cached after first call). Use the optional filter to narrow results to relevant paths, e.g. "variable" or "player". This shows what takaro.* API calls are available inside module code.',
    { filter: z.string().optional().describe('Keyword to filter path names, e.g. "variable", "player", "gameserver"') },
    async ({ filter }) => {
      try {
        if (!cachedOpenApiSpec) {
          const host = process.env['TAKARO_HOST'];
          if (!host) throw new Error('TAKARO_HOST not set');
          const resp = await fetch(`${host}/api/openapi.json`);
          if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching OpenAPI spec`);
          cachedOpenApiSpec = (await resp.json()) as Record<string, unknown>;
        }

        let spec = cachedOpenApiSpec;
        if (filter) {
          const paths = (spec['paths'] as Record<string, unknown>) ?? {};
          const filtered: Record<string, unknown> = {};
          for (const [p, v] of Object.entries(paths)) {
            if (p.toLowerCase().includes(filter.toLowerCase())) {
              filtered[p] = v;
            }
          }
          spec = { ...spec, paths: filtered };
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(spec, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'OPENAPI_FETCH_ERROR', message: String(err) }) }] };
      }
    },
  );
}
