import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './apiClient';
import { loadRuntimeApiBaseUrl, refreshRuntimeApiBaseUrl, resetRuntimeApiBaseUrl } from './runtimeConfig';

const CONFIG = 'https://raw.githubusercontent.com/example/repo/runtime-config/api-config.json';
const OLD = 'https://old-tunnel.trycloudflare.com';
const NEW = 'https://new-tunnel.trycloudflare.com';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** fetch stand-in: the config file answers with `published`; the old tunnel is dead; the new one answers. */
function network(published: string) {
  return vi.fn(async (url: string) => {
    if (url.startsWith(CONFIG)) return json({ apiBaseUrl: published });
    if (url.startsWith(OLD)) throw new TypeError('Failed to fetch');
    return json({ ok: true, url });
  });
}

afterEach(() => { resetRuntimeApiBaseUrl(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('reconnecting after the tunnel moved', () => {
  it('re-reads the published address and retries once at the new tunnel', async () => {
    vi.stubEnv('VITE_API_CONFIG_URL', CONFIG);
    vi.stubEnv('VITE_API_BASE_URL', OLD);
    const fetchMock = network(NEW);
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/api/found-items')).resolves.toEqual({ ok: true, url: `${NEW}/api/found-items` });
    expect(fetchMock.mock.calls.map(([url]) => String(url).split('?')[0])).toEqual([`${OLD}/api/found-items`, CONFIG, `${NEW}/api/found-items`]);
  });

  it('does not retry when the published address is unchanged, and checks the config at most every 30 seconds', async () => {
    vi.stubEnv('VITE_API_CONFIG_URL', CONFIG);
    vi.stubEnv('VITE_API_BASE_URL', OLD);
    const fetchMock = network(OLD);
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/api/found-items')).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: expect.stringContaining('1~2분 뒤') });
    await expect(apiRequest('/api/lost-items')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith(CONFIG))).toHaveLength(1);
  });

  it('never retries HTTP errors or requests sent to an explicit address', async () => {
    vi.stubEnv('VITE_API_CONFIG_URL', CONFIG);
    vi.stubEnv('VITE_API_BASE_URL', OLD);
    const fetchMock = network(NEW);
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/api/x', { baseUrl: OLD })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: '없어요' }, 404)));
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tells an offline visitor to check their own connection', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiRequest('/api/x', { baseUrl: OLD })).rejects.toMatchObject({ message: expect.stringContaining('인터넷 연결') });
  });

  it('skips the refresh entirely when the build has no config file', async () => {
    vi.stubEnv('VITE_API_CONFIG_URL', '');
    const fetcher = vi.fn();
    expect(await refreshRuntimeApiBaseUrl(fetcher as unknown as typeof fetch)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await loadRuntimeApiBaseUrl(undefined, fetcher as unknown as typeof fetch)).toBeNull();
  });
});
