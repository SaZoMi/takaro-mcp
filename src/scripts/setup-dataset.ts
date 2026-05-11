#!/usr/bin/env node
/**
 * One-time script: creates the Langfuse dataset "takaro-module-eval" and
 * upserts one item per registered MCP prompt.
 *
 * Requires the MCP server to be running (reads prompts via HTTP).
 * Usage: node dist/scripts/setup-dataset.js
 */
import 'dotenv/config';
import { getLangfuse } from '../utils/langfuse.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const MCP_URL = `http://localhost:${PORT}/mcp`;
const DATASET_NAME = 'takaro-module-eval';

interface JsonRpcResponse {
  result?: unknown;
  error?: { message: string };
}

interface McpPrompt {
  name: string;
  description?: string;
}

interface McpMessage {
  content: { type: string; text?: string };
}

let msgId = 1;
let sessionId: string | undefined;

async function mcpCall(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const body = JSON.stringify({ jsonrpc: '2.0', id: msgId++, method, params });
  const res = await fetch(MCP_URL, { method: 'POST', headers, body });

  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;

  const text = await res.text();
  // StreamableHTTP may return SSE or plain JSON — extract first JSON object
  const jsonLine = text.split('\n').find(l => l.startsWith('{') || l.startsWith('data: {'));
  const json = jsonLine?.replace(/^data:\s*/, '') ?? text;
  const parsed = JSON.parse(json) as JsonRpcResponse;
  if (parsed.error) throw new Error(parsed.error.message);
  return parsed.result;
}

async function main(): Promise<void> {
  const lf = getLangfuse();
  if (!lf) throw new Error('Langfuse not configured — check LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY in .env');

  console.log(`Connecting to MCP server at ${MCP_URL}...`);

  // Initialize MCP session
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'setup-dataset', version: '1.0.0' },
  });

  // List all registered prompts
  const listResult = await mcpCall('prompts/list') as { prompts: McpPrompt[] };
  const prompts = listResult.prompts;
  console.log(`Found ${prompts.length} prompts: ${prompts.map(p => p.name).join(', ')}`);

  // Create dataset (no-op if already exists)
  try {
    await lf.api.datasetsCreate({
      name: DATASET_NAME,
      description: 'Takaro module prompts for AI model evaluation',
    });
    console.log(`Created dataset "${DATASET_NAME}"`);
  } catch {
    console.log(`Dataset "${DATASET_NAME}" already exists — skipping creation`);
  }

  // Upsert one item per prompt
  for (const prompt of prompts) {
    const getResult = await mcpCall('prompts/get', { name: prompt.name }) as { messages: McpMessage[] };
    const promptText = getResult.messages
      .map(m => m.content.type === 'text' ? (m.content.text ?? '') : '')
      .join('\n');

    await lf.api.datasetItemsCreate({
      datasetName: DATASET_NAME,
      id: prompt.name,
      input: { promptName: prompt.name, promptText },
      metadata: { description: prompt.description ?? '' },
    });
    console.log(`  Upserted item: ${prompt.name}`);
  }

  await lf.flushAsync();
  console.log(`\nDone — ${prompts.length} items in dataset "${DATASET_NAME}"`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
