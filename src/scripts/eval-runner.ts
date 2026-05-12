#!/usr/bin/env node
/**
 * Evaluation runner: benchmarks 11 Takaro module prompts against 3 Claude models.
 * Drives Claude Code CLI (`claude -p`) for each combination, parses stream-json output,
 * and posts structured metrics to Langfuse as dataset run items.
 *
 * Usage:
 *   node dist/scripts/eval-runner.js --model all --prompt all --run-name baseline
 *   node dist/scripts/eval-runner.js --model claude-haiku-4-5-20251001 --prompt build-afk-checker
 */
import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';
import { readdir, readFile } from 'fs/promises';
import { getLangfuse } from '../utils/langfuse.js';
import { parseStreamJson } from '../utils/stream-parser.js';
import { deriveScores } from '../utils/eval-metrics.js';
import { persistKnownIssues } from '../utils/known-issues.js';
import { buildOrchestratorPrompt } from './orchestrator-prompt.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const MCP_URL = `http://localhost:${PORT}/mcp`;
const DATASET_NAME = 'takaro-module-eval';
const MAX_TURNS = parseInt(process.env['EVAL_MAX_TURNS'] ?? '60', 10);

const ALL_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
];

const BRASSY22_SERVER_ID = '7a494b4b-647d-481d-89d1-beb7e6295669';
const EVAL_BOT_NAME = 'eval-bot';

function modelShort(model: string): string {
  if (model.includes('opus'))  return 'opus';
  if (model.includes('haiku')) return 'haiku';
  return 'sonnet';
}

function makeModuleName(promptName: string, model: string, timestamp: string): string {
  return `${promptName}-${modelShort(model)}-${timestamp}`;
}

function buildSystemPrompt(model: string, promptName: string, moduleName: string): string {
  return [
    'You are a Takaro module developer. Your task is to build, deploy, test, and clean up a Takaro module.',
    'Use the available MCP tools. Do not ask for clarification — execute the full workflow below.',
    '',
    `STEP 0 — KNOWN ISSUES: Read takaro://known-issues/${promptName} and avoid any listed errors.`,
    '',
    `STEP 1 — BUILD: Scaffold the module with the exact name "${moduleName}".`,
    `  Use "${moduleName}" as the name in both the scaffold directory and in module.json's "name" field.`,
    '  Write all source files (JS commands/hooks/cronjobs/functions) and the module.json, then push.',
    '',
    `STEP 2 — INSTALL: Install the module on game server "${BRASSY22_SERVER_ID}" using install_module.`,
    '  - Use the moduleId and latestVersionId from push_module\'s response.',
    '',
    `STEP 3 — CONNECT BOT: Create the test bot with bot_action(action:"create", botName:"${EVAL_BOT_NAME}").`,
    `  - Then call list_players(gameServerId:"${BRASSY22_SERVER_ID}", onlineOnly:true) to find the bot's playerId.`,
    '  - If the bot does not appear within ~5 seconds, try list_players once more.',
    '',
    'STEP 4 — TEST CORE FUNCTIONALITY:',
    '  - For each command defined in the module: call trigger_command with the bot\'s playerId, then',
    '    poll_events(eventName:"command-executed") to verify it fired with success=true.',
    '  - For cronjob-only modules: verify the installation succeeded (no test command needed).',
    '  - For hook-only modules: verify the installation succeeded.',
    '',
    'STEP 5 — HANDLE FAILURES: If a test fails or poll_events returns success=false:',
    '  1. Call get_failed_events to read the error log.',
    '  2. Determine if the error is fixable (code bug, wrong API call, bad argument schema).',
    '     — If fixable: uninstall_module, fix the source file(s), push, reinstall, retest. Repeat up to 3 times.',
    '     — If NOT fixable (server down, infrastructure error, game server unreachable): proceed to cleanup.',
    '',
    'STEP 6 — CLEANUP (always run, even on failure):',
    `  - uninstall_module(moduleId, gameServerId:"${BRASSY22_SERVER_ID}")`,
    `  - bot_action(action:"delete", botName:"${EVAL_BOT_NAME}")`,
  ].join('\n');
}

// ─── LOC from disk (for subagent runs where write_module_file is not in parent stream) ───

async function countLinesFromDisk(moduleName: string): Promise<number> {
  const modulesRoot = (process.env['MODULES_ROOT'] ?? 'D:/BachMCP/sazomi/ai-module-writer/modules')
    .replace(/\\/g, '/');
  const srcDir = path.join(modulesRoot, moduleName, 'src');
  let total = 0;
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.name.endsWith('.js') || e.name.endsWith('.ts')) {
        try {
          const content = await readFile(full, 'utf8');
          total += content.split('\n').length;
        } catch { /* skip unreadable files */ }
      }
    }
  };
  await walk(srcDir);
  return total;
}

// ─── CLI argument parsing ──────────────────────────────────────────────────

function parseArgs(): { models: string[]; prompts: string[] | 'all'; runName: string; orchestrator: boolean } {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const modelArg = get('--model') ?? 'all';
  const models = modelArg === 'all' ? ALL_MODELS : [modelArg];

  const promptArg = get('--prompt') ?? 'all';
  const prompts: string[] | 'all' = promptArg === 'all' ? 'all' : [promptArg];

  const date = new Date().toISOString().slice(0, 10);
  const runName = get('--run-name') ?? `eval-${date}`;

  const orchestrator = args.includes('--orchestrator');

  return { models, prompts, runName, orchestrator };
}

// ─── MCP helpers ──────────────────────────────────────────────────────────

interface McpPrompt { name: string; description?: string }
interface McpMessage { content: { type: string; text?: string } }
interface JsonRpcResponse { result?: unknown; error?: { message: string } }

let msgId = 1;
let mcpSessionId: string | undefined;

async function mcpCall(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (mcpSessionId) headers['mcp-session-id'] = mcpSessionId;

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: msgId++, method, params }),
  });

  const sid = res.headers.get('mcp-session-id');
  if (sid) mcpSessionId = sid;

  const text = await res.text();
  const jsonLine = text.split('\n').find(l => l.startsWith('{') || l.startsWith('data: {'));
  const parsed = JSON.parse((jsonLine ?? text).replace(/^data:\s*/, '')) as JsonRpcResponse;
  if (parsed.error) throw new Error(parsed.error.message);
  return parsed.result;
}

async function fetchPrompts(): Promise<Array<{ name: string; text: string; description: string }>> {
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'eval-runner', version: '1.0.0' },
  });

  const { prompts } = await mcpCall('prompts/list') as { prompts: McpPrompt[] };

  const result = [];
  for (const p of prompts) {
    const { messages } = await mcpCall('prompts/get', { name: p.name }) as { messages: McpMessage[] };
    const text = messages.map(m => m.content.type === 'text' ? (m.content.text ?? '') : '').join('\n');
    result.push({ name: p.name, text, description: p.description ?? '' });
  }
  return result;
}

// ─── Claude Code runner ───────────────────────────────────────────────────

function runClaude(promptText: string, model: string, promptName: string, moduleName: string, verbose = false, orchestrator = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const systemPrompt = orchestrator
      ? buildOrchestratorPrompt(moduleName, promptName)
      : buildSystemPrompt(model, promptName, moduleName);
    const fullPrompt = `${systemPrompt}\n\n${promptText}`;
    // Resolve the .mcp.json one level above the package root so Claude can find the takaro server
    const mcpConfigPath = path.resolve(process.cwd(), '..', '.mcp.json');

    const args = [
      '-p', '-',
      '--model', model,
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', String(MAX_TURNS),
      '--mcp-config', mcpConfigPath,
      '--dangerously-skip-permissions',
    ];

    let stdout = '';
    let partial = '';

    const proc = spawn('claude', args, { env: process.env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdin.write(fullPrompt, 'utf8');
    proc.stdin.end();

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (!verbose) return;

      // Parse complete lines as they arrive
      partial += text;
      const lines = partial.split('\n');
      partial = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as Record<string, unknown>;
          logStreamEvent(event);
        } catch { /* skip non-JSON */ }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      if (verbose) process.stderr.write(chunk);
    });

    proc.on('error', reject);
    proc.on('close', () => {
      if (!stdout) {
        reject(new Error('claude produced no output'));
      } else {
        resolve(stdout);
      }
    });
  });
}

function logStreamEvent(event: Record<string, unknown>): void {
  const type = String(event['type'] ?? '');

  if (type === 'tool') {
    const name = String(event['tool_name'] ?? '');
    const isError = Boolean(event['is_error']);
    const content = event['content'] as Array<{ text?: string }> | undefined;
    const output = content?.map(c => c.text ?? '').join('').slice(0, 200) ?? '';
    const icon = isError ? '✗' : '✓';
    console.log(`    ${icon} tool: ${name}${isError ? ` — ERROR: ${output}` : ''}`);
  }

  if (type === 'assistant') {
    const msg = event['message'] as { content?: Array<{ type: string; name?: string }>; usage?: { output_tokens?: number } } | undefined;
    const tools = msg?.content?.filter(c => c.type === 'tool_use').map(c => c.name).join(', ');
    const tokens = msg?.usage?.output_tokens;
    if (tools) console.log(`    → calling: ${tools}${tokens ? ` (${tokens} tokens)` : ''}`);
  }

  if (type === 'result') {
    const subtype = String(event['subtype'] ?? '');
    const turns = Number(event['num_turns'] ?? 0);
    const cost = Number(event['total_cost_usd'] ?? 0);
    console.log(`    ⬛ done: ${subtype} | turns=${turns} cost=$${cost.toFixed(4)}`);
  }
}

// ─── Langfuse posting ─────────────────────────────────────────────────────

async function postToLangfuse(opts: {
  runName: string;
  promptName: string;
  model: string;
  moduleName: string;
  promptText: string;
  rawOutput: string;
}): Promise<void> {
  const lf = getLangfuse();
  if (!lf) { console.warn('  Langfuse not configured — skipping trace'); return; }

  const { runName, promptName, model, moduleName, promptText, rawOutput } = opts;
  const run = parseStreamJson(rawOutput);
  const scores = deriveScores(run);

  // For subagent runs, write_module_file calls are inside Agent tool outputs and not visible
  // in the parent stream — count lines directly from disk if the parent stream shows 0.
  if (scores.lines_of_code === 0) {
    const diskLoc = await countLinesFromDisk(moduleName);
    if (diskLoc > 0) scores.lines_of_code = diskLoc;
  }

  // Root trace — sessionId groups all models for the same prompt+run in one session
  const trace = lf.trace({
    name: `eval:${promptName}`,
    sessionId: `${runName}:${promptName}`,
    input: { promptName, model },
    output: { success: scores.success === 1, subtype: run.finalResult?.subtype ?? 'unknown' },
    metadata: {
      model,
      promptName,
      runName,
      tool_distribution: scores.tool_distribution,
    },
    tags: [model, promptName, runName],
  });

  // Generation: full Claude conversation with full token breakdown
  const responseTokens = Math.max(0, run.usage.output_tokens - run.reasoningTokens);
  trace.generation({
    name: 'claude-code-run',
    model,
    input: promptText,
    output: run.finalResult?.subtype ?? 'unknown',
    startTime: run.startTime ? new Date(run.startTime) : undefined,
    usage: {
      input: run.usage.input_tokens,
      output: run.usage.output_tokens,
      total: run.usage.input_tokens
        + run.usage.output_tokens
        + run.usage.cache_read_input_tokens
        + run.usage.cache_creation_input_tokens,
    },
    metadata: {
      cost_usd: scores.cost_usd,
      num_turns: scores.num_turns,
      // Full token breakdown for manual inspection
      input_tokens: run.usage.input_tokens,
      output_tokens: run.usage.output_tokens,
      reasoning_tokens: run.reasoningTokens,
      response_tokens: responseTokens,
      cache_read_tokens: run.usage.cache_read_input_tokens,
      cache_creation_tokens: run.usage.cache_creation_input_tokens,
    },
  });

  // ── Phase detection ──────────────────────────────────────────────────────
  // Assign each tool call to a named phase so Langfuse shows a hierarchical timeline.
  type Phase = 'build' | `deploy_cycle_${number}` | `fix_${number}` | 'cleanup';

  interface PhaseGroup {
    phase: Phase;
    calls: typeof run.toolCalls;
  }

  const phases: PhaseGroup[] = [];
  let currentPhase: Phase = 'build';
  let currentCalls: typeof run.toolCalls = [];
  let cycleN = 1;
  let fixN = 1;

  // Detect cleanup = last uninstall_module onward (if no more installs follow)
  const lastUninstallIdx = [...run.toolCalls].reduce<number>(
    (acc, tc, i) => (tc.name === 'mcp__takaro__uninstall_module' || tc.name === 'uninstall_module') ? i : acc,
    -1,
  );
  const hasInstallAfterLastUninstall = run.toolCalls.slice(lastUninstallIdx + 1).some(
    tc => tc.name === 'mcp__takaro__install_module' || tc.name === 'install_module',
  );
  const cleanupStartIdx = lastUninstallIdx >= 0 && !hasInstallAfterLastUninstall ? lastUninstallIdx : Infinity;

  run.toolCalls.forEach((tc, idx) => {
    const name = tc.name;
    const isInstall = name === 'mcp__takaro__install_module' || name === 'install_module';
    const isUninstall = name === 'mcp__takaro__uninstall_module' || name === 'uninstall_module';
    const isPush = name === 'mcp__takaro__push_module' || name === 'push_module';

    // Flush current phase when we hit a phase boundary
    if (idx === cleanupStartIdx) {
      phases.push({ phase: currentPhase, calls: currentCalls });
      currentPhase = 'cleanup';
      currentCalls = [];
    } else if (isInstall && currentPhase === 'build') {
      phases.push({ phase: 'build', calls: currentCalls });
      currentPhase = `deploy_cycle_${cycleN}`;
      currentCalls = [];
    } else if (isUninstall && currentPhase.startsWith('deploy_cycle')) {
      phases.push({ phase: currentPhase, calls: currentCalls });
      currentPhase = `fix_${fixN++}` as Phase;
      currentCalls = [];
    } else if (isInstall && currentPhase.startsWith('fix_')) {
      // fix phase ends; new deploy cycle starts but install is in the new cycle
      phases.push({ phase: currentPhase, calls: currentCalls });
      cycleN++;
      currentPhase = `deploy_cycle_${cycleN}`;
      currentCalls = [];
    } else if (isPush && currentPhase.startsWith('fix_')) {
      // push is the last tool of the fix phase; next tool will start deploy cycle
      currentCalls.push(tc);
      phases.push({ phase: currentPhase, calls: currentCalls });
      cycleN++;
      currentPhase = `deploy_cycle_${cycleN}`;
      currentCalls = [];
      return;
    }
    currentCalls.push(tc);
  });
  if (currentCalls.length > 0) phases.push({ phase: currentPhase, calls: currentCalls });

  // ── Write spans per phase ────────────────────────────────────────────────
  // Track file sizes across cycles for fix-diff events
  const fileLineCounts: Record<string, number> = {};

  for (const group of phases) {
    const { phase, calls } = group;
    if (calls.length === 0) continue;

    const phaseHasError = calls.some(tc => tc.isError);
    const firstTs = calls[0]!.timestamp;
    const lastTs = calls[calls.length - 1]!.timestamp;
    const phaseStart = firstTs ? new Date(firstTs) : undefined;
    const phaseEnd = lastTs ? new Date(lastTs) : undefined;

    const phaseSpan = trace.span({
      name: phase,
      startTime: phaseStart,
      endTime: phaseEnd,
      level: phaseHasError ? 'ERROR' : 'DEFAULT',
      metadata: { phase, tool_count: calls.length },
    });

    for (const tc of calls) {
      const isError = tc.isError;
      const outputLimit = isError ? 8000 : 2000;

      phaseSpan.span({
        name: tc.name,
        input: tc.input,
        output: tc.output ? { text: tc.output.slice(0, outputLimit) } : undefined,
        startTime: tc.timestamp ? new Date(tc.timestamp) : undefined,
        level: isError ? 'ERROR' : 'DEFAULT',
        statusMessage: isError ? tc.output.slice(0, 1000) : undefined,
      });

      // Fix-diff: detect when the same file is rewritten in a fix phase
      if (phase.startsWith('fix_')) {
        const isFileWrite = tc.name === 'mcp__takaro__write_module_file' || tc.name === 'write_module_file';
        if (isFileWrite) {
          const filePath = String(tc.input['filePath'] ?? tc.input['path'] ?? '');
          const content = String(tc.input['content'] ?? '');
          const newLines = content.split('\n').length;
          const prevLines = fileLineCounts[filePath];
          if (prevLines !== undefined) {
            phaseSpan.event({
              name: 'code-fix',
              metadata: { file: filePath, before_lines: prevLines, after_lines: newLines, delta: newLines - prevLines },
            });
          }
          fileLineCounts[filePath] = newLines;
        }
      } else {
        // Track file sizes from build phase for comparison in fix phases
        const isFileWrite = tc.name === 'mcp__takaro__write_module_file' || tc.name === 'write_module_file';
        if (isFileWrite) {
          const filePath = String(tc.input['filePath'] ?? tc.input['path'] ?? '');
          const content = String(tc.input['content'] ?? '');
          fileLineCounts[filePath] = content.split('\n').length;
        }
      }
    }
  }

  // Scores
  const scoreEntries: Array<[string, number]> = [
    ['lines_of_code',             scores.lines_of_code],
    ['total_tokens',              scores.total_tokens],
    ['tool_call_count',           scores.tool_call_count],
    ['error_count',               scores.error_count],
    ['shot_count',                scores.shot_count],
    ['num_turns',                 scores.num_turns],
    ['success',                   scores.success],
    ['cost_usd',                  scores.cost_usd],
    ['duration_ms',               scores.duration_ms],
    ['push_attempt_count',        scores.push_attempt_count],
    ['zero_shot_success',         scores.zero_shot_success],
    ['self_correction_count',     scores.self_correction_count],
    ['throughput_tools_per_min',  scores.throughput_tools_per_min],
    ['time_to_first_push_ms',     scores.time_to_first_push_ms],
    ['module_complexity',         scores.module_complexity],
    ['error_recovery_efficiency', scores.error_recovery_efficiency],
    ['install_success',           scores.install_success],
    ['functional_test_passed',    scores.functional_test_passed],
    ['test_cycle_count',          scores.test_cycle_count],
    ['build_success',             scores.build_success],
    ['error_in_build',            scores.error_in_build],
    ['error_in_install',          scores.error_in_install],
    ['error_in_test',             scores.error_in_test],
    ['build_duration_ms',         scores.build_duration_ms],
    ['test_duration_ms',          scores.test_duration_ms],
    // Token breakdown scores
    ['input_tokens',              run.usage.input_tokens],
    ['output_tokens',             run.usage.output_tokens],
    ['reasoning_tokens',          run.reasoningTokens],
    ['response_tokens',           Math.max(0, run.usage.output_tokens - run.reasoningTokens)],
    ['cache_read_tokens',         run.usage.cache_read_input_tokens],
    ['cache_creation_tokens',     run.usage.cache_creation_input_tokens],
  ];

  for (const [name, value] of scoreEntries) {
    lf.score({ traceId: trace.id, name, value, dataType: 'NUMERIC' });
  }

  // Persist failure patterns for the agent to learn from on future runs
  if (scores.success === 0) {
    persistKnownIssues(promptName, run.toolCalls);
  }

  // Link to dataset run
  const datasetItem = await lf.api.datasetItemsCreate({
    datasetName: DATASET_NAME,
    id: promptName,
    input: { promptName, promptText },
  }).catch(() => null);

  if (datasetItem) {
    await lf.api.datasetRunItemsCreate({
      runName: `${runName}-${model}`,
      runDescription: `Model: ${model} | Run: ${runName}`,
      metadata: { model, runName },
      datasetItemId: datasetItem.id,
      traceId: trace.id,
    });
  }

  await lf.flushAsync();
}

// ─── Post-run cleanup ─────────────────────────────────────────────────────

async function emergencyCleanup(run: import('../utils/stream-parser.js').RunResult): Promise<void> {
  // Find moduleId from any successful push_module call
  const pushCall = [...run.toolCalls].reverse().find(tc =>
    (tc.name === 'mcp__takaro__push_module' || tc.name === 'push_module') && !tc.isError
  );
  if (pushCall) {
    try {
      const out = JSON.parse(pushCall.output) as Record<string, unknown>;
      const moduleId = String(out['moduleId'] ?? out['id'] ?? '');
      if (moduleId) {
        await mcpCall('tools/call', { name: 'mcp__takaro__uninstall_module', arguments: { moduleId, gameServerId: BRASSY22_SERVER_ID } });
        console.log(`  cleanup: uninstalled module ${moduleId}`);
      }
    } catch { /* best-effort */ }
  }

  // Delete eval bot
  try {
    await mcpCall('tools/call', { name: 'mcp__takaro__bot_action', arguments: { action: 'delete', botName: EVAL_BOT_NAME } });
    console.log(`  cleanup: deleted bot ${EVAL_BOT_NAME}`);
  } catch { /* best-effort */ }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { models, prompts: promptFilter, runName, orchestrator } = parseArgs();

  console.log(`Eval run: ${runName}`);
  console.log(`Models:   ${models.join(', ')}`);
  console.log(`Prompts:  ${promptFilter === 'all' ? 'all' : promptFilter.join(', ')}`);
  console.log(`Mode:     ${orchestrator ? 'orchestrator (subagent delegation)' : 'standard'}`);
  console.log(`Max turns: ${MAX_TURNS}\n`);

  console.log(`Fetching prompts from MCP server at ${MCP_URL}...`);
  const allPrompts = await fetchPrompts();

  const targetPrompts = promptFilter === 'all'
    ? allPrompts
    : allPrompts.filter(p => (promptFilter as string[]).includes(p.name));

  if (targetPrompts.length === 0) {
    console.error(`No matching prompts found. Available: ${allPrompts.map(p => p.name).join(', ')}`);
    process.exit(1);
  }

  console.log(`Running ${models.length} model(s) × ${targetPrompts.length} prompt(s) = ${models.length * targetPrompts.length} total runs\n`);

  let completed = 0;
  const total = models.length * targetPrompts.length;
  // Single timestamp for the whole eval run — all modules created in this run share the same stamp
  const runTs = new Date().toISOString().replace(/[-T:]/g, '').slice(2, 12); // YYMMDDHHmm

  for (const model of models) {
    for (const prompt of targetPrompts) {
      completed++;
      const moduleName = makeModuleName(prompt.name, model, runTs);
      console.log(`[${completed}/${total}] ${model} × ${prompt.name}`);
      console.log(`  module: ${moduleName}`);

      let rawOutput = '';
      let parsedRun: import('../utils/stream-parser.js').RunResult | null = null;
      try {
        rawOutput = await runClaude(prompt.text, model, prompt.name, moduleName, true, orchestrator);
        parsedRun = parseStreamJson(rawOutput);
        const scores = deriveScores(parsedRun);
        console.log(`  turns=${scores.num_turns} tools=${scores.tool_call_count} errors=${scores.error_count} shots=${scores.shot_count} loc=${scores.lines_of_code} tokens=${scores.total_tokens} success=${scores.success === 1} build=${scores.build_success === 1} install=${scores.install_success === 1} test=${scores.functional_test_passed === 1}`);
        console.log(`  tool_distribution: ${JSON.stringify(scores.tool_distribution)}`);
      } catch (err) {
        console.error(`  FAILED: ${err}`);
      }

      // Emergency cleanup — runs regardless of Claude's behaviour
      if (parsedRun) {
        await emergencyCleanup(parsedRun);
      }

      try {
        await postToLangfuse({ runName, promptName: prompt.name, model, moduleName, promptText: prompt.text, rawOutput });
        console.log('  → posted to Langfuse');
      } catch (err) {
        console.error(`  Langfuse post failed: ${err}`);
      }
    }
  }

  console.log(`\nDone — ${completed} runs completed.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
