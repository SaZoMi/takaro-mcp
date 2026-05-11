import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
import { registerDiscoveryTools } from './tools/discovery.js';
import { registerFilesystemTools } from './tools/filesystem.js';
import { registerDeploymentTools } from './tools/deployment.js';
import { registerTestingTools } from './tools/testing.js';
import { registerPlayerActionTools } from './tools/player-actions.js';
import { registerEventsExtendedTools } from './tools/events-extended.js';
import { registerModuleComponentTools } from './tools/module-components.js';
import { registerShopTools } from './tools/shop.js';
import { registerMonitoringTools } from './tools/monitoring.js';
import { registerIntegrationTools } from './tools/integrations.js';
import { registerResources } from './resources/index.js';
import { registerAFKCheckerPrompt } from './prompts/AFKChecker.js';
import { registerBannedItemsPrompt } from './prompts/BannedItems.js';
import { registerServerMessagesPrompt } from './prompts/serverMessages.js';
import { registerHighPingKickerPrompt } from './prompts/highPingKicker.js';
import { registerChatBridgePrompt } from './prompts/chatBridge.js';
import { registerEconomyUtilsPrompt } from './prompts/economyUtils.js';
import { registerMiniGamesPrompt } from './prompts/miniGames.js';
import { registerLobbyAndBackPrompt } from './prompts/lobbyandback.js';
import { registerWhitelistingPrompt } from './prompts/Whitelisting.js';
import { registerBuffManagerPrompt } from './prompts/BuffManager.js';
import { registerGeneralStockMarketPrompt } from './prompts/GeneralstockMarket.js';
import { getLangfuse } from './utils/langfuse.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const requestContext = new AsyncLocalStorage<{ sessionId: string }>();

/**
 * Wraps every server.tool() registration so each call creates a Langfuse trace + span.
 * No-ops when Langfuse keys are absent.
 */
function patchWithTracing(server: McpServer): void {
  const lf = getLangfuse();
  if (!lf) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = (server as any).tool.bind(server);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).tool = (name: string, description: string, schema: unknown, handler: ToolHandler) => {
    const traced: ToolHandler = async (args) => {
      const sessionId = requestContext.getStore()?.sessionId;
      const trace = lf.trace({
        name: `mcp:${name}`,
        input: args,
        metadata: { tool: name },
        sessionId,
        tags: [name],
      });
      const span = trace.span({ name, input: args });
      const start = Date.now();
      try {
        const result = await handler(args);
        span.end({ output: result });
        trace.update({ output: result, metadata: { tool: name, durationMs: Date.now() - start } });
        lf.flushAsync().catch(() => {});
        return result;
      } catch (err) {
        span.end({ level: 'ERROR', statusMessage: String(err) });
        trace.update({ metadata: { tool: name, error: String(err), durationMs: Date.now() - start } });
        lf.flushAsync().catch(() => {});
        throw err;
      }
    };
    return original(name, description, schema, traced);
  };
}

/** Create a fully configured McpServer instance. Called once per HTTP request (stateless mode). */
function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'takaro', version: '1.0.0' });
  patchWithTracing(server);

  // Ping — used to verify the server is reachable
  server.tool('ping', 'Health check. Returns { ok: true } if the MCP server is running.', {}, async () => ({
    content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, server: 'takaro-mcp', version: '1.0.0' }) }],
  }));

  registerDiscoveryTools(server);
  registerFilesystemTools(server);
  registerDeploymentTools(server);
  registerTestingTools(server);
  registerPlayerActionTools(server);
  registerEventsExtendedTools(server);
  registerModuleComponentTools(server);
  registerShopTools(server);
  registerMonitoringTools(server);
  registerIntegrationTools(server);
  registerResources(server);
  registerAFKCheckerPrompt(server);
  registerBannedItemsPrompt(server);
  registerServerMessagesPrompt(server);
  registerHighPingKickerPrompt(server);
  registerChatBridgePrompt(server);
  registerEconomyUtilsPrompt(server);
  registerMiniGamesPrompt(server);
  registerLobbyAndBackPrompt(server);
  registerWhitelistingPrompt(server);
  registerBuffManagerPrompt(server);
  registerGeneralStockMarketPrompt(server);

  return server;
}

export function startHttpServer(port = 3000): void {
  const app = express();
  app.use(express.json());

  function resolveSessionId(req: Request): string {
    return (req.headers['mcp-session-id'] as string | undefined)
      ?? (req.headers['x-session-id'] as string | undefined)
      ?? randomUUID();
  }

  // POST: client → server messages (tool calls, initialize, etc.)
  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = resolveSessionId(req);
    await requestContext.run({ sessionId }, async () => {
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      // Register close handler AFTER connecting so transport.close() only runs cleanup,
      // never races with an in-flight handleRequest write.
      try {
        await server.connect(transport);
        res.on('close', () => { transport.close().catch(() => {}); });
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        // ERR_HTTP_HEADERS_SENT means the response already succeeded — suppress it.
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ERR_HTTP_HEADERS_SENT') return;
        if (!res.headersSent) res.status(500).json({ error: String(err) });
      }
    });
  });

  // GET: server → client SSE channel (server-initiated messages / streaming)
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = resolveSessionId(req);
    await requestContext.run({ sessionId }, async () => {
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      try {
        await server.connect(transport);
        res.on('close', () => { transport.close().catch(() => {}); });
        await transport.handleRequest(req, res);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ERR_HTTP_HEADERS_SENT') return;
        if (!res.headersSent) res.status(500).json({ error: String(err) });
      }
    });
  });

  // DELETE: session teardown (no-op in stateless mode)
  app.delete('/mcp', (_req: Request, res: Response) => {
    res.status(200).end();
  });

  app.listen(port, () => {
    console.log(`Takaro MCP server listening on http://localhost:${port}/mcp`);
    console.log('Connect with: npx @modelcontextprotocol/inspector http://localhost:3000/mcp');
  });
}
