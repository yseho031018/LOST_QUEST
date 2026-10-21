import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl } from './apiClient';
import { getRuntimeApiBaseUrl, loadRuntimeApiBaseUrl, resetRuntimeApiBaseUrl } from './runtimeConfig';

const CONFIG = 'https://raw.githubusercontent.com/example/repo/runtime-config/api-config.json';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { resetRuntimeApiBaseUrl(); vi.unstubAllEnvs(); });

describe('runtime API address', () => {
  it('uses a quick-tunnel address from the config file ahead of the build-time address', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://old-tunnel.trycloudflare.com');
    const fetcher = vi.fn().mockResolvedValue(json({ apiBaseUrl: ' https://new-tunnel-name.trycloudflare.com/ ' }));
    expect(await loadRuntimeApiBaseUrl(CONFIG, fetcher, 3000, 120_000)).toBe('https://new-tunnel-name.trycloudflare.com');
    expect(fetcher).toHaveBeenCalledWith(`${CONFIG}?v=2`, expect.objectContaining({ cache: 'no-store', credentials: 'omit' }));
    expect(getApiBaseUrl()).toBe('https://new-tunnel-name.trycloudflare.com');
  });
  it.each([
    { apiBaseUrl: 'https://evil.example.com' },
    { apiBaseUrl: 'http://plain.trycloudflare.com' },
    { apiBaseUrl: 'https://a.trycloudflare.com.evil.example' },
    { apiBaseUrl: 42 },
    null,
  ])('ignores an unexpected address %j and keeps the build-time one', async body => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://old-tunnel.trycloudflare.com');
    expect(await loadRuntimeApiBaseUrl(CONFIG, vi.fn().mockResolvedValue(json(body)))).toBeNull();
    expect(getRuntimeApiBaseUrl()).toBeNull();
    expect(getApiBaseUrl()).toBe('https://old-tunnel.trycloudflare.com');
  });
  it('keeps the build-time address when the config is missing, failing or slow', async () => {
    expect(await loadRuntimeApiBaseUrl(undefined, vi.fn())).toBeNull();
    expect(await loadRuntimeApiBaseUrl(CONFIG, vi.fn().mockResolvedValue(json({}, 404)))).toBeNull();
    expect(await loadRuntimeApiBaseUrl(CONFIG, vi.fn().mockRejectedValue(new TypeError('offline')))).toBeNull();
    const slow = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    expect(await loadRuntimeApiBaseUrl(CONFIG, slow as unknown as typeof fetch, 10)).toBeNull();
    expect(getRuntimeApiBaseUrl()).toBeNull();
  });
});
