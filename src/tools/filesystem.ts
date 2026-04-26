import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { MODULES_ROOT, guardedModulePath, moduleRoot, walkDir } from '../utils/fs-guard.js';

const MINIMAL_MODULE_JSON = (name: string, description: string) => ({
  name,
  description: description || 'A Takaro module',
  version: 'latest',
  supportedGames: ['all'],
  config: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  permissions: [],
  commands: {},
  hooks: {},
  cronJobs: {},
  functions: {},
});

export function registerFilesystemTools(server: McpServer): void {

  server.tool(
    'scaffold_module',
    'Create a new module directory under MODULES_ROOT with a minimal module.json and an empty src/ folder. Use this to start a new module before writing command/hook/function files.',
    {
      moduleName: z.string().describe('Module name (kebab-case, e.g. "my-module"). Must start with "test-" or a descriptive name.'),
      description: z.string().optional().describe('Short description of what the module does'),
    },
    async ({ moduleName, description }) => {
      try {
        const dir = path.resolve(MODULES_ROOT, moduleName);
        if (fs.existsSync(dir)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MODULE_EXISTS', message: `Module '${moduleName}' already exists at ${dir}. Use read/write tools to modify it.` }) }] };
        }
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        const json = MINIMAL_MODULE_JSON(moduleName, description ?? '');
        fs.writeFileSync(path.join(dir, 'module.json'), JSON.stringify(json, null, 2));
        return { content: [{ type: 'text' as const, text: JSON.stringify({ created: true, path: dir, files: ['module.json', 'src/'] }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'SCAFFOLD_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'list_module_files',
    'List all files inside a local module directory (relative paths). Use this to see the current structure of a module under development.',
    { moduleName: z.string().describe('Module directory name under MODULES_ROOT') },
    async ({ moduleName }) => {
      try {
        const dir = moduleRoot(moduleName);
        if (!fs.existsSync(dir)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MODULE_NOT_FOUND', message: `Module '${moduleName}' not found at ${dir}` }) }] };
        }
        const files = walkDir(dir);
        return { content: [{ type: 'text' as const, text: JSON.stringify(files, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'LIST_FILES_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'read_module_file',
    'Read the content of a file inside a local module. filePath is relative to the module root, e.g. "src/commands/greet/index.js" or "module.json".',
    {
      moduleName: z.string().describe('Module directory name'),
      filePath: z.string().describe('File path relative to the module root, e.g. "src/commands/greet/index.js"'),
    },
    async ({ moduleName, filePath }) => {
      try {
        const target = guardedModulePath(moduleName, filePath);
        if (!fs.existsSync(target)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'FILE_NOT_FOUND', message: `File '${filePath}' not found in module '${moduleName}'` }) }] };
        }
        const content = fs.readFileSync(target, 'utf-8');
        return { content: [{ type: 'text' as const, text: content }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'READ_FILE_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'write_module_file',
    'Write (create or overwrite) a file inside a local module. Creates parent directories as needed. Use this to write command/hook/cronjob/function JS files. filePath is relative to the module root.',
    {
      moduleName: z.string().describe('Module directory name'),
      filePath: z.string().describe('File path relative to the module root, e.g. "src/commands/greet/index.js"'),
      content: z.string().describe('Full file content to write'),
    },
    async ({ moduleName, filePath, content }) => {
      try {
        const target = guardedModulePath(moduleName, filePath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, 'utf-8');
        return { content: [{ type: 'text' as const, text: JSON.stringify({ written: true, path: filePath, bytes: Buffer.byteLength(content, 'utf-8') }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'WRITE_FILE_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'read_module_json',
    'Read and parse the module.json metadata file for a local module. Returns the full LocalModuleJson object including commands, hooks, cronJobs, config schema, and permissions.',
    { moduleName: z.string().describe('Module directory name') },
    async ({ moduleName }) => {
      try {
        const target = guardedModulePath(moduleName, 'module.json');
        if (!fs.existsSync(target)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'MODULE_JSON_NOT_FOUND', message: `module.json not found for '${moduleName}'` }) }] };
        }
        const parsed = JSON.parse(fs.readFileSync(target, 'utf-8'));
        return { content: [{ type: 'text' as const, text: JSON.stringify(parsed, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'READ_MODULE_JSON_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'write_module_json',
    'Write the module.json metadata for a local module. Pass the full LocalModuleJson object. This defines commands (trigger, description, helpText, function path, arguments), hooks (eventType, function path), cronJobs (temporalValue, function path), config schema, and permissions.',
    {
      moduleName: z.string().describe('Module directory name'),
      content: z.record(z.unknown()).describe('Full module.json object (name, commands, hooks, cronJobs, functions, config, permissions, etc.)'),
    },
    async ({ moduleName, content }) => {
      try {
        const target = guardedModulePath(moduleName, 'module.json');
        const json = JSON.stringify(content, null, 2);
        fs.writeFileSync(target, json, 'utf-8');
        return { content: [{ type: 'text' as const, text: JSON.stringify({ written: true, bytes: Buffer.byteLength(json, 'utf-8') }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'WRITE_MODULE_JSON_ERROR', message: String(err) }) }] };
      }
    },
  );

  server.tool(
    'delete_module_file',
    'Delete a file inside a local module. Use this to remove stale command/hook/function files during iteration.',
    {
      moduleName: z.string().describe('Module directory name'),
      filePath: z.string().describe('File path relative to the module root'),
    },
    async ({ moduleName, filePath }) => {
      try {
        const target = guardedModulePath(moduleName, filePath);
        if (!fs.existsSync(target)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'FILE_NOT_FOUND', message: `File '${filePath}' not found in module '${moduleName}'` }) }] };
        }
        fs.unlinkSync(target);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, path: filePath }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, code: 'DELETE_FILE_ERROR', message: String(err) }) }] };
      }
    },
  );
}
