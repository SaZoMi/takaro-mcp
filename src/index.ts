import 'dotenv/config';
import { getClient } from './client.js';
import { startHttpServer } from './server.js';
import { MODULES_ROOT, MODULE_TO_JSON_SCRIPT } from './utils/fs-guard.js';
import { shutdownLangfuse } from './utils/langfuse.js';
import fs from 'fs';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

async function main(): Promise<void> {
  // Startup health check
  console.log('Starting Takaro MCP server...');
  console.log(`  MODULES_ROOT:          ${MODULES_ROOT}`);
  console.log(`  MODULE_TO_JSON_SCRIPT: ${MODULE_TO_JSON_SCRIPT}`);

  if (!fs.existsSync(MODULES_ROOT)) {
    console.warn(`  WARNING: MODULES_ROOT does not exist: ${MODULES_ROOT}`);
    console.warn('  Filesystem tools will not work until this path exists.');
  }

  if (!fs.existsSync(MODULE_TO_JSON_SCRIPT)) {
    console.warn(`  WARNING: module-to-json.js not found: ${MODULE_TO_JSON_SCRIPT}`);
    console.warn('  push_module will not work. Run: npm run build (in ai-module-writer)');
  }

  // Verify Takaro credentials and connectivity (non-fatal — server starts regardless)
  try {
    const client = await getClient();
    const servers = await client.gameserver.gameServerControllerSearch({ limit: 1 });
    console.log(`  Takaro connection: OK (${servers.data.data.length > 0 ? servers.data.data[0]!.name : 'no game servers found'})`);
  } catch (err) {
    const msg = String(err);
    if (msg.includes('401')) {
      console.warn('  WARNING: Takaro login failed (401). Check TAKARO_USERNAME and TAKARO_PASSWORD in .env');
    } else if (msg.includes('403')) {
      console.warn('  WARNING: Takaro domain access denied (403). Check TAKARO_DOMAIN_ID in .env — it must match a domain the account has access to.');
      console.warn(`  Current value: TAKARO_DOMAIN_ID="${process.env['TAKARO_DOMAIN_ID']}"`);
    } else {
      console.warn(`  WARNING: Could not reach Takaro API: ${msg}`);
    }
    console.warn('  Server will start anyway. Fix credentials in .env and restart.');
  }

  startHttpServer(PORT);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}, shutting down Langfuse...`);
  await shutdownLangfuse();
  process.exit(0);
}

process.on('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)); });
process.on('SIGINT',  () => { shutdown('SIGINT').catch(() => process.exit(1)); });

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
