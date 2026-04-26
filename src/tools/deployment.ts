import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execFileSync, SpawnSyncReturns } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getClient } from '../client.js';
import { MODULES_ROOT, MODULE_TO_JSON_SCRIPT } from '../utils/fs-guard.js';

export function registerDeploymentTools(server: McpServer): void {

  server.tool(
    'push_module',
    'Convert a local module directory to Takaro import JSON and push it to the Takaro API. If a module with the same name already exists in Takaro, it is deleted first (idempotent). Returns the moduleId and latestVersionId needed for install_module. Requires ai-module-writer to be built first (npm run build in ai-module-writer).',
    { moduleName: z.string().describe('Module directory name under MODULES_ROOT') },
    async ({ moduleName }) => {
      try {
        if (!fs.existsSync(MODULE_TO_JSON_SCRIPT)) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: true,
                code: 'SCRIPT_NOT_FOUND',
                message: `module-to-json.js not found at ${MODULE_TO_JSON_SCRIPT}. Run 'npm run build' in ai-module-writer first.`,
              }),
            }],
          };
        }

        const moduleDir = path.resolve(MODULES_ROOT, moduleName);
        if (!fs.existsSync(moduleDir)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MODULE_NOT_FOUND', message: `Module directory '${moduleName}' not found at ${moduleDir}` }) }] };
        }

        // Convert local module dir → JSON via the compiled script
        const tempFile = path.join(os.tmpdir(), `takaro-push-${Date.now()}.json`);
        try {
          try {
            execFileSync(process.execPath, [MODULE_TO_JSON_SCRIPT, moduleDir, tempFile], {
              stdio: ['pipe', 'pipe', 'pipe'],
            });
          } catch (err) {
            const spawnErr = err as SpawnSyncReturns<Buffer>;
            const stderr = spawnErr.stderr?.toString().trim() ?? '';
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  error: true,
                  code: 'PUSH_FAILED',
                  message: `module-to-json conversion failed for '${moduleName}'`,
                  stderr: stderr || '(no stderr output)',
                }),
              }],
            };
          }

          const moduleJson = JSON.parse(fs.readFileSync(tempFile, 'utf-8')) as { name: string };
          const client = await getClient();

          // Delete existing module with same name (idempotent)
          const existing = await client.module.moduleControllerSearch({ filters: { name: [moduleJson.name] } });
          const existingMod = existing.data.data.find((m) => m.name === moduleJson.name);
          if (existingMod) {
            await client.module.moduleControllerRemove(existingMod.id);
          }

          await client.module.moduleControllerImport(moduleJson);

          // Fetch the newly imported module to get its ID
          const after = await client.module.moduleControllerSearch({ filters: { name: [moduleJson.name] } });
          const found = after.data.data.find((m) => m.name === moduleJson.name);
          if (!found) throw new Error(`Module '${moduleJson.name}' not found after import`);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                pushed: true,
                moduleId: found.id,
                name: found.name,
                latestVersionId: found.latestVersion?.id ?? null,
              }),
            }],
          };
        } finally {
          if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'PUSH_MODULE_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'install_module',
    'Install a Takaro module version on a game server. Use the moduleId and latestVersionId returned by push_module, and the gameServerId from list_game_servers.',
    {
      moduleId: z.string().describe('Module ID returned by push_module or list_modules'),
      versionId: z.string().describe('Version ID (latestVersionId) returned by push_module'),
      gameServerId: z.string().describe('Game server ID from list_game_servers'),
      userConfig: z.record(z.unknown()).optional().describe('Optional user-facing module config (matches config schema in module.json)'),
      systemConfig: z.record(z.unknown()).optional().describe('Optional system config'),
    },
    async ({ moduleId: _moduleId, versionId, gameServerId, userConfig, systemConfig }) => {
      try {
        const client = await getClient();
        await client.module.moduleInstallationsControllerInstallModule({
          versionId,
          gameServerId,
          userConfig: userConfig ? JSON.stringify(userConfig) : undefined,
          systemConfig: systemConfig ? JSON.stringify(systemConfig) : undefined,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ installed: true, versionId, gameServerId }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'INSTALL_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'uninstall_module',
    'Uninstall a module from a game server. Use before re-installing a corrected version.',
    {
      moduleId: z.string().describe('Module ID'),
      gameServerId: z.string().describe('Game server ID'),
    },
    async ({ moduleId, gameServerId }) => {
      try {
        const client = await getClient();
        await client.module.moduleInstallationsControllerUninstallModule(moduleId, gameServerId);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ uninstalled: true, moduleId, gameServerId }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'UNINSTALL_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'delete_module_from_takaro',
    'Permanently delete a module from Takaro (uninstall first if installed). Use for a clean re-push cycle.',
    { moduleId: z.string().describe('Module ID to delete') },
    async ({ moduleId }) => {
      try {
        const client = await getClient();
        await client.module.moduleControllerRemove(moduleId);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, moduleId }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'DELETE_MODULE_ERROR', message: String(err) }) }] };
      }
    },
  );
}
