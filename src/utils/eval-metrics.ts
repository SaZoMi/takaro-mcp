import type { RunResult } from './stream-parser.js';

export interface EvalScores {
  lines_of_code: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  tool_call_count: number;
  error_count: number;
  shot_count: number;
  num_turns: number;
  success: number;
  duration_ms: number;
  // Iteration metrics
  push_attempt_count: number;
  zero_shot_success: number;
  self_correction_count: number;
  throughput_tools_per_min: number;
  time_to_first_push_ms: number;
  module_complexity: number;
  error_recovery_efficiency: number;
  tool_distribution: Record<string, number>;
  // Test phase metrics
  install_success: number;
  functional_test_passed: number;
  test_cycle_count: number;
  // Phase-level scores
  build_success: number;
  error_in_build: number;
  error_in_install: number;
  error_in_test: number;
  build_duration_ms: number;
  test_duration_ms: number;
}

const FILE_WRITE_TOOLS = new Set([
  'mcp__takaro__write_module_file',
  'write_module_file',
]);

const PUSH_TOOLS = new Set([
  'mcp__takaro__push_module',
  'push_module',
]);

const MODULE_JSON_TOOLS = new Set([
  'mcp__takaro__write_module_json',
  'write_module_json',
]);

const INSTALL_TOOLS = new Set([
  'mcp__takaro__install_module',
  'install_module',
]);

const POLL_TOOLS = new Set([
  'mcp__takaro__poll_events',
  'poll_events',
]);

export function deriveScores(run: RunResult): EvalScores {
  const { toolCalls, finalResult } = run;

  // Lines of code across all file writes
  let linesOfCode = 0;
  for (const tc of toolCalls) {
    if (FILE_WRITE_TOOLS.has(tc.name)) {
      const content = tc.input['content'];
      if (typeof content === 'string') {
        linesOfCode += content.split('\n').length;
      }
    }
  }

  // Error count
  const errorCount = toolCalls.filter(tc => tc.isError).length;

  // Shot count: starts at 1, increments each time a non-error tool call follows an error cluster
  let shotCount = 1;
  let inErrorCluster = false;
  for (const tc of toolCalls) {
    if (tc.isError) {
      inErrorCluster = true;
    } else if (inErrorCluster) {
      shotCount++;
      inErrorCluster = false;
    }
  }

  // Success: final result is "success" AND the last push_module call succeeded
  const pushCalls = toolCalls.filter(tc => PUSH_TOOLS.has(tc.name));
  const pushSucceeded = pushCalls.length > 0 && !pushCalls[pushCalls.length - 1]!.isError;
  const success = finalResult?.subtype === 'success' && pushSucceeded ? 1 : 0;

  // Push attempt count: number of push_module calls made
  const pushAttemptCount = pushCalls.length;

  // Zero-shot success: succeeded on the very first push attempt
  const zeroShotSuccess = pushAttemptCount === 1 && success === 1 ? 1 : 0;

  // Self-correction count: number of times the agent recovered from an error cluster
  const selfCorrectionCount = shotCount - 1;

  // Throughput: tool calls per minute (guard against zero duration)
  const durationMs = finalResult?.durationMs ?? 0;
  const throughputToolsPerMin = durationMs > 0
    ? (toolCalls.length / (durationMs / 60_000))
    : 0;

  // Time to first push: proportional proxy based on position of first push call
  const firstPushIndex = toolCalls.findIndex(tc => PUSH_TOOLS.has(tc.name));
  const timeToFirstPushMs = firstPushIndex >= 0 && toolCalls.length > 0 && durationMs > 0
    ? Math.round((firstPushIndex / toolCalls.length) * durationMs)
    : 0;

  // Module complexity: sum of component types defined in write_module_json calls
  let moduleComplexity = 0;
  for (const tc of toolCalls) {
    if (MODULE_JSON_TOOLS.has(tc.name)) {
      const json = tc.input['json'] ?? tc.input['content'];
      try {
        const parsed = typeof json === 'string' ? JSON.parse(json) : json;
        if (parsed && typeof parsed === 'object') {
          const p = parsed as Record<string, unknown>;
          moduleComplexity = Math.max(moduleComplexity,
            Object.keys((p['commands'] as object | undefined) ?? {}).length +
            Object.keys((p['hooks'] as object | undefined) ?? {}).length +
            Object.keys((p['cronJobs'] as object | undefined) ?? {}).length +
            Object.keys((p['functions'] as object | undefined) ?? {}).length,
          );
        }
      } catch { /* malformed JSON — skip */ }
    }
  }

  // Error recovery efficiency: errors per self-correction (lower is better)
  const errorRecoveryEfficiency = errorCount / Math.max(selfCorrectionCount, 1);

  // Tool distribution: call counts per tool name
  const toolDistribution: Record<string, number> = {};
  for (const tc of toolCalls) {
    toolDistribution[tc.name] = (toolDistribution[tc.name] ?? 0) + 1;
  }

  // Install success: any install_module call that did not error
  const installCalls = toolCalls.filter(tc => INSTALL_TOOLS.has(tc.name));
  const installSuccess = installCalls.some(tc => !tc.isError) ? 1 : 0;

  // Test cycle count: number of install attempts (each install = one deploy+test cycle)
  const testCycleCount = installCalls.length;

  // Functional test passed:
  //   - For command modules: poll_events returned success=true after a trigger_command
  //   - For cronjob/hook-only modules (no trigger_command calls): install success is sufficient
  const hasTriggerCall = toolCalls.some(tc =>
    tc.name === 'mcp__takaro__trigger_command' || tc.name === 'trigger_command',
  );
  const pollPassed = toolCalls
    .filter(tc => POLL_TOOLS.has(tc.name) && !tc.isError)
    .some(tc => {
      try {
        const out = JSON.parse(tc.output) as Record<string, unknown>;
        return out['success'] === true;
      } catch { return false; }
    });
  const functionalTestPassed = pollPassed || (!hasTriggerCall && installSuccess === 1) ? 1 : 0;

  // Build success: first push_module call did not error
  const firstPush = toolCalls.find(tc => PUSH_TOOLS.has(tc.name));
  const buildSuccess = firstPush && !firstPush.isError ? 1 : 0;

  // Phase error flags — determine which phase first saw an error
  // Phases: build = before first install_module; install/test = after
  const firstInstallIdx = toolCalls.findIndex(tc => INSTALL_TOOLS.has(tc.name));
  const buildTools = firstInstallIdx >= 0 ? toolCalls.slice(0, firstInstallIdx) : toolCalls;
  const postBuildTools = firstInstallIdx >= 0 ? toolCalls.slice(firstInstallIdx) : [];

  const errorInBuild = buildTools.some(tc => tc.isError) ? 1 : 0;
  const errorInInstall = postBuildTools
    .filter(tc => INSTALL_TOOLS.has(tc.name))
    .some(tc => tc.isError) ? 1 : 0;
  const errorInTest = postBuildTools
    .filter(tc => POLL_TOOLS.has(tc.name))
    .some(tc => tc.isError) ? 1 : 0;

  // Phase durations using timestamps when available, else positional estimate
  const msFromTimestamp = (a?: string, b?: string): number | null => {
    if (!a || !b) return null;
    const diff = new Date(b).getTime() - new Date(a).getTime();
    return diff >= 0 ? diff : null;
  };

  const firstToolTs = toolCalls[0]?.timestamp;
  const firstPushTs = firstPush?.timestamp;
  const firstInstall = firstInstallIdx >= 0 ? toolCalls[firstInstallIdx] : undefined;
  const firstInstallTs = firstInstall?.timestamp;
  const firstPollTs = toolCalls.find(tc => POLL_TOOLS.has(tc.name))?.timestamp;

  const buildDurationMs = msFromTimestamp(firstToolTs, firstPushTs)
    ?? (firstPush && durationMs > 0
      ? Math.round((toolCalls.indexOf(firstPush) / toolCalls.length) * durationMs)
      : 0);

  const testDurationMs = msFromTimestamp(firstInstallTs, firstPollTs)
    ?? 0;

  const u = run.usage;
  return {
    lines_of_code: linesOfCode,
    total_tokens: u.input_tokens + u.output_tokens + u.cache_read_input_tokens,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_tokens: u.cache_read_input_tokens,
    cost_usd: finalResult?.totalCostUsd ?? 0,
    tool_call_count: toolCalls.length,
    error_count: errorCount,
    shot_count: shotCount,
    num_turns: finalResult?.numTurns ?? 0,
    success,
    duration_ms: durationMs,
    push_attempt_count: pushAttemptCount,
    zero_shot_success: zeroShotSuccess,
    self_correction_count: selfCorrectionCount,
    throughput_tools_per_min: throughputToolsPerMin,
    time_to_first_push_ms: timeToFirstPushMs,
    module_complexity: moduleComplexity,
    error_recovery_efficiency: errorRecoveryEfficiency,
    tool_distribution: toolDistribution,
    install_success: installSuccess,
    functional_test_passed: functionalTestPassed,
    test_cycle_count: testCycleCount,
    build_success: buildSuccess,
    error_in_build: errorInBuild,
    error_in_install: errorInInstall,
    error_in_test: errorInTest,
    build_duration_ms: buildDurationMs,
    test_duration_ms: testDurationMs,
  };
}
