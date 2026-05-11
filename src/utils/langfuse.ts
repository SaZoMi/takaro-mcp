import { Langfuse } from 'langfuse';

let _langfuse: Langfuse | null = null;

export function getLangfuse(): Langfuse | null {
  const secretKey = process.env['LANGFUSE_SECRET_KEY'];
  const publicKey = process.env['LANGFUSE_PUBLIC_KEY'];
  if (!secretKey || !publicKey) return null;

  if (!_langfuse) {
    _langfuse = new Langfuse({
      secretKey,
      publicKey,
      baseUrl: process.env['LANGFUSE_BASE_URL'] ?? 'https://cloud.langfuse.com',
      release: process.env['npm_package_version'] ?? '1.0.0',
      sdkIntegration: 'takaro-mcp',
      environment: process.env['NODE_ENV'] ?? 'production',
    });
    _langfuse.debug(process.env['LANGFUSE_DEBUG'] === 'true');
  }
  return _langfuse;
}

/** Flush all pending events and shut down the client — call on graceful shutdown. */
export async function shutdownLangfuse(): Promise<void> {
  await _langfuse?.shutdownAsync();
  _langfuse = null;
}

/** Flush pending events without shutting down — use for mid-request flushing. */
export async function flushLangfuse(): Promise<void> {
  await _langfuse?.flushAsync();
}
