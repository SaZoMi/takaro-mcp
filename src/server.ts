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

/** Create a fully configured McpServer instance. Called once per HTTP request (stateless mode). */
function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'takaro', version: '1.0.0' });

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

  return server;
}

export function startHttpServer(port = 3000): void {
  const app = express();
  app.use(express.json());

  // POST: client → server messages (tool calls, initialize, etc.)
  app.post('/mcp', async (req: Request, res: Response) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close().catch(() => {}); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // GET: server → client SSE channel (server-initiated messages / streaming)
  app.get('/mcp', async (req: Request, res: Response) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close().catch(() => {}); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
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
