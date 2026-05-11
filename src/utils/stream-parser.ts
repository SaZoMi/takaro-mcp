export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  timestamp?: string;  // ISO string from the stream's user event
}

export interface UsageRecord {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface FinalResult {
  subtype: string;
  isError: boolean;
  numTurns: number;
  durationMs: number;
  totalCostUsd: number;
  usage: UsageRecord;
}

export interface RunResult {
  toolCalls: ToolCallRecord[];
  usage: UsageRecord;
  finalResult: FinalResult | null;
  startTime?: string;  // ISO string of first event in the stream
  reasoningTokens: number;  // estimated from thinking block char lengths (÷4)
}

const emptyUsage = (): UsageRecord => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
});

type ContentBlock = Record<string, unknown>;

export function parseStreamJson(rawOutput: string): RunResult {
  const result: RunResult = {
    toolCalls: [],
    usage: emptyUsage(),
    finalResult: null,
    reasoningTokens: 0,
  };

  // Pending tool_use blocks waiting to be matched with their tool_result
  const pending = new Map<string, { id: string; name: string; input: Record<string, unknown> }>();

  let startTimeCaptured = false;
  for (const line of rawOutput.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    // Capture run start time from the first parsed event
    if (!startTimeCaptured) {
      result.startTime = new Date().toISOString();
      startTimeCaptured = true;
    }

    // Tool USE intent + reasoning tokens: buried inside assistant message content blocks
    if (event['type'] === 'assistant') {
      const msg = event['message'] as { content?: ContentBlock[] } | undefined;
      for (const block of msg?.content ?? []) {
        if (block['type'] === 'tool_use') {
          const id = String(block['id'] ?? '');
          pending.set(id, {
            id,
            name: String(block['name'] ?? ''),
            input: (block['input'] ?? {}) as Record<string, unknown>,
          });
        }
        // Accumulate reasoning tokens from thinking blocks (estimate: chars ÷ 4)
        if (block['type'] === 'thinking') {
          const text = String(block['thinking'] ?? '');
          result.reasoningTokens += Math.round(text.length / 4);
        }
      }
    }

    // Tool RESULT: buried inside user message content blocks
    if (event['type'] === 'user') {
      const timestamp = event['timestamp'] as string | undefined;
      const msg = event['message'] as { content?: ContentBlock[] } | undefined;
      for (const block of msg?.content ?? []) {
        if (block['type'] === 'tool_result') {
          const toolUseId = String(block['tool_use_id'] ?? '');
          const call = pending.get(toolUseId);
          if (call) {
            const raw = block['content'];
            const output = Array.isArray(raw)
              ? (raw as Array<{ type: string; text?: string }>).map(c => c.text ?? '').join('')
              : String(raw ?? '');
            result.toolCalls.push({
              id: toolUseId,
              name: call.name,
              input: call.input,
              output,
              isError: Boolean(block['is_error']),
              timestamp,
            });
            pending.delete(toolUseId);
          }
        }
      }
    }

    if (event['type'] === 'result') {
      const raw = (event['usage'] ?? {}) as Partial<UsageRecord>;
      const usage: UsageRecord = {
        input_tokens: raw.input_tokens ?? 0,
        output_tokens: raw.output_tokens ?? 0,
        cache_creation_input_tokens: raw.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: raw.cache_read_input_tokens ?? 0,
      };
      result.usage = usage;
      result.finalResult = {
        subtype: String(event['subtype'] ?? ''),
        isError: Boolean(event['is_error']),
        numTurns: Number(event['num_turns'] ?? 0),
        durationMs: Number(event['duration_ms'] ?? 0),
        totalCostUsd: Number(event['total_cost_usd'] ?? 0),
        usage,
      };
    }
  }

  return result;
}
