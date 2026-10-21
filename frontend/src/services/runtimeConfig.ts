/**
 * Hosted builds can read the current API address from a small public file at startup, so a new
 * Cloudflare quick-tunnel URL only needs that file updated instead of a rebuild and redeploy.
 * Only quick-tunnel hosts are accepted, so the file cannot point the app at an arbitrary server.
 */
const ALLOWED_RUNTIME_API = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;
let runtimeApiBaseUrl: string | null = null;

export function getRuntimeApiBaseUrl(): string | null {
  return runtimeApiBaseUrl;
}

export async function loadRuntimeApiBaseUrl(
  configUrl: string | undefined = import.meta.env.VITE_API_CONFIG_URL,
  fetcher: typeof fetch = fetch,
  timeoutMs = 3000,
  now = Date.now(),
): Promise<string | null> {
  const source = configUrl?.trim();
  if (!source) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // The raw file host caches for minutes; a per-minute query keeps visitors at most a minute behind.
    const url = `${source}${source.includes('?') ? '&' : '?'}v=${Math.floor(now / 60_000)}`;
    const response = await fetcher(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const value = body && typeof body === 'object' && typeof (body as Record<string, unknown>).apiBaseUrl === 'string'
      ? ((body as Record<string, unknown>).apiBaseUrl as string).trim().replace(/\/+$/, '') : '';
    if (!ALLOWED_RUNTIME_API.test(value)) return null;
    runtimeApiBaseUrl = value;
    return value;
  } catch {
    // Unreachable or malformed config: keep the address baked in at build time.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Test helper. */
export function resetRuntimeApiBaseUrl(): void {
  runtimeApiBaseUrl = null;
}
