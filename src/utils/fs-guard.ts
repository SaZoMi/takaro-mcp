import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MODULES_ROOT: string = path.resolve(
  process.env['MODULES_ROOT'] ?? path.join('D:', 'BachMCP', 'sazomi', 'ai-module-writer', 'modules'),
);

// Default: the copy compiled inside takaro-mcp/dist/scripts/ (no dependency on ai-module-writer build)
export const MODULE_TO_JSON_SCRIPT: string =
  process.env['MODULE_TO_JSON_SCRIPT'] ??
  path.resolve(__dirname, '..', 'scripts', 'module-to-json.js');

/**
 * Resolve a path inside MODULES_ROOT/<moduleName>/<filePath> and verify it
 * does not escape the module directory (path traversal + symlink guard).
 * Throws if the path is outside the sandbox.
 */
export function guardedModulePath(moduleName: string, filePath: string): string {
  if (!moduleName || moduleName.includes('/') || moduleName.includes('\\') || moduleName === '..' || moduleName === '.') {
    throw new Error(`Invalid module name: '${moduleName}'`);
  }

  const moduleDir = path.resolve(MODULES_ROOT, moduleName);
  const target = path.resolve(moduleDir, filePath);

  if (!target.startsWith(moduleDir + path.sep) && target !== moduleDir) {
    throw new Error(`Path '${filePath}' escapes module directory`);
  }

  // Symlink check (only if file exists)
  if (fs.existsSync(target)) {
    const realModuleDir = fs.realpathSync(moduleDir);
    const realTarget = fs.realpathSync(target);
    if (!realTarget.startsWith(realModuleDir + path.sep) && realTarget !== realModuleDir) {
      throw new Error(`Path '${filePath}' escapes module directory via symlink`);
    }
  }

  return target;
}

/** Return the absolute path to a module directory (no file path, just the root). */
export function moduleRoot(moduleName: string): string {
  return guardedModulePath(moduleName, '.');
}

/** Walk a directory recursively and return all file paths relative to the root. */
export function walkDir(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      results.push(...walkDir(full, base));
    } else {
      results.push(rel);
    }
  }
  return results;
}
