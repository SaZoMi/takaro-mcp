import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { HookTriggerDTOEventTypeEnum } from '@takaro/apiclient';
import { getClient } from '../client.js';

export function registerModuleComponentTools(server: McpServer): void {

  server.tool(
    'manage_hooks',
    'Manage Takaro hooks (event-triggered module functions). Actions: list (search hooks), get (get hook by ID), trigger (simulate a game event that fires matching hooks — requires eventType and optionally eventMeta), get_executions (recent execution events for a hook).',
    {
      action: z.enum(['list', 'get', 'trigger', 'get_executions']),
      hookId: z.string().optional().describe('Hook ID (get, get_executions)'),
      gameServerId: z.string().optional().describe('Game server ID (required for trigger; filter for list)'),
      moduleId: z.string().optional().describe('Filter by module ID (list)'),
      eventType: z.nativeEnum(HookTriggerDTOEventTypeEnum).optional()
        .describe('Event type to simulate (trigger), e.g. "player-connected", "chat-message"'),
      eventMeta: z.record(z.unknown()).optional().describe('Event payload object (trigger, defaults to {})'),
      limit: z.number().optional().describe('Max results (list/get_executions, default 20)'),
    },
    async ({ action, hookId, gameServerId, moduleId, eventType, eventMeta, limit = 20 }) => {
      try {
        const client = await getClient();
        switch (action) {
          case 'list': {
            const result = await client.hook.hookControllerSearch({
              filters: {
                ...(moduleId ? { moduleId: [moduleId] } : {}),
              },
              limit,
            });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'get': {
            if (!hookId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_HOOK_ID', message: 'hookId is required for get' }) }] };
            const result = await client.hook.hookControllerGetOne(hookId);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'trigger': {
            if (!gameServerId || !eventType) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_PARAMS', message: 'gameServerId and eventType are required for trigger' }) }] };
            await client.hook.hookControllerTrigger({
              gameServerId,
              eventType,
              eventMeta: (eventMeta ?? {}) as object,
            });
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, triggered: eventType, gameServerId }) }] };
          }
          case 'get_executions': {
            if (!hookId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_HOOK_ID', message: 'hookId is required for get_executions' }) }] };
            const result = await client.hook.hookControllerGetExecutions(hookId, undefined, { limit });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
        }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MANAGE_HOOKS_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'manage_cronjobs',
    'Manage Takaro cronjobs (scheduled module functions). Actions: list (search cronjobs), get (get cronjob by ID), trigger (manually fire a cronjob — looks up its moduleId automatically), get_executions (recent execution events).',
    {
      action: z.enum(['list', 'get', 'trigger', 'get_executions']),
      cronjobId: z.string().optional().describe('CronJob ID (get, trigger, get_executions)'),
      gameServerId: z.string().optional().describe('Game server ID (required for trigger; filter for list)'),
      moduleId: z.string().optional().describe('Filter by module ID (list)'),
      limit: z.number().optional().describe('Max results (list/get_executions, default 20)'),
    },
    async ({ action, cronjobId, gameServerId, moduleId, limit = 20 }) => {
      try {
        const client = await getClient();
        switch (action) {
          case 'list': {
            const result = await client.cronjob.cronJobControllerSearch({
              filters: {
                ...(moduleId ? { moduleId: [moduleId] } : {}),
              },
              limit,
            });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'get': {
            if (!cronjobId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_CRONJOB_ID', message: 'cronjobId is required' }) }] };
            const result = await client.cronjob.cronJobControllerGetOne(cronjobId);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'trigger': {
            if (!cronjobId || !gameServerId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_PARAMS', message: 'cronjobId and gameServerId are required for trigger' }) }] };
            // Fetch moduleId from the cronjob record (required by the API)
            const cj = await client.cronjob.cronJobControllerGetOne(cronjobId);
            const fetchedModuleId = (cj.data.data as unknown as Record<string, unknown>)['moduleId'] as string | undefined;
            if (!fetchedModuleId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MODULE_ID_NOT_FOUND', message: 'Could not determine moduleId for this cronjob' }) }] };
            await client.cronjob.cronJobControllerTrigger({ gameServerId, cronjobId, moduleId: fetchedModuleId });
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, triggered: cronjobId, gameServerId }) }] };
          }
          case 'get_executions': {
            if (!cronjobId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_CRONJOB_ID', message: 'cronjobId is required' }) }] };
            const result = await client.cronjob.cronJobControllerGetExecutions(cronjobId, undefined, { limit });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
        }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MANAGE_CRONJOBS_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'manage_roles',
    'Manage Takaro roles and permissions. Actions: list, get (by ID), create (name + permissions), update, delete, get_permissions (list all available permission codes that can be assigned).',
    {
      action: z.enum(['list', 'get', 'create', 'update', 'delete', 'get_permissions']),
      roleId: z.string().optional().describe('Role ID (get, update, delete)'),
      name: z.string().optional().describe('Role name (create, update)'),
      permissions: z.array(z.object({
        permissionId: z.string(),
        count: z.number().optional(),
      })).optional().describe('Permission list for create/update'),
      limit: z.number().optional().describe('Max results (list, default 50)'),
    },
    async ({ action, roleId, name, permissions, limit = 50 }) => {
      try {
        const client = await getClient();
        switch (action) {
          case 'list': {
            const result = await client.role.roleControllerSearch({ limit });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'get': {
            if (!roleId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ROLE_ID', message: 'roleId is required' }) }] };
            const result = await client.role.roleControllerGetOne(roleId);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'create': {
            if (!name) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_NAME', message: 'name is required for create' }) }] };
            const result = await client.role.roleControllerCreate({ name, permissions: permissions ?? [] });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'update': {
            if (!roleId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ROLE_ID', message: 'roleId is required' }) }] };
            const result = await client.role.roleControllerUpdate(roleId, { name: name ?? '', permissions: permissions ?? [] });
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'delete': {
            if (!roleId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_ROLE_ID', message: 'roleId is required' }) }] };
            await client.role.roleControllerRemove(roleId);
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, deleted: roleId }) }] };
          }
          case 'get_permissions': {
            const result = await client.role.roleControllerGetPermissions();
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
        }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MANAGE_ROLES_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'get_installed_modules',
    'List all module installations — which modules are installed on which game servers. Use this to see what is currently deployed without opening the Takaro dashboard.',
    {
      gameServerId: z.string().optional().describe('Filter by game server ID'),
      moduleId: z.string().optional().describe('Filter by module ID'),
    },
    async ({ gameServerId, moduleId }) => {
      try {
        const client = await getClient();
        const result = await client.module.moduleInstallationsControllerGetInstalledModules({
          filters: {
            ...(gameServerId ? { gameServerId: [gameServerId] } : {}),
            ...(moduleId ? { moduleId: [moduleId] } : {}),
          },
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'GET_INSTALLED_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'manage_module_versions',
    'Work with module versions in Takaro. Actions: get (get a version by its version record ID), search (list all versions of a module), tag (create a named version tag — requires moduleId and a tag string).',
    {
      action: z.enum(['get', 'search', 'tag']),
      versionId: z.string().optional().describe('Version record ID (get)'),
      moduleId: z.string().optional().describe('Module ID (search required; tag required)'),
      tag: z.string().optional().describe('Version tag string to create (tag, e.g. "v1.0.0")'),
      limit: z.number().optional().describe('Max results (search, default 20)'),
    },
    async ({ action, versionId, moduleId, tag, limit = 20 }) => {
      try {
        const client = await getClient();
        switch (action) {
          case 'get': {
            if (!versionId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_VERSION_ID', message: 'versionId is required for get' }) }] };
            const result = await client.module.moduleVersionControllerGetModuleVersion(versionId);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'search': {
            if (!moduleId) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_MODULE_ID', message: 'moduleId is required for search' }) }] };
            const result = await client.module.moduleVersionControllerSearchVersions({
              filters: { moduleId: [moduleId] },
              limit,
            } as Parameters<typeof client.module.moduleVersionControllerSearchVersions>[0]);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result.data.data, null, 2) }] };
          }
          case 'tag': {
            if (!moduleId || !tag) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MISSING_PARAMS', message: 'moduleId and tag are required' }) }] };
            await client.module.moduleVersionControllerTagVersion({ tag, moduleId });
            return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, moduleId, tag }) }] };
          }
        }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MODULE_VERSIONS_ERROR', message: String(err) }) }] };
      }
    },
  );
}
