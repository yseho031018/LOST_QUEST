import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModelCachePreparation, modelErrorMessage, ModelCacheRecoveryError, repairModelCache } from './modelLoading';

const origin = 'https://lost-quest.example';
const models = [{ directory: 'dinov2-small', source: 'onnx-community/dinov2-small' }];
const local = `${origin}/models/onnx-community/dinov2-small/config.json`;
let entries: Map<string, Response>;
let cache: { keys: ReturnType<typeof vi.fn>; match: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
let storage: { has: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
beforeEach(() => {
  entries = new Map();
  cache = {
    keys: vi.fn(async () => [...entries.keys()].map(url => new Request(url))),
    match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
    delete: vi.fn(async (request: Request) => entries.delete(request.url)),
  };
  storage = { has: vi.fn(async () => true), open: vi.fn(async () => cache), delete: vi.fn() };
  vi.stubGlobal('location', new URL(origin)); vi.stubGlobal('caches', storage);
});
afterEach(() => vi.unstubAllGlobals());

describe('targeted Transformers.js model cache recovery', () => {
  it('removes HTML at a known model JSON key and leaves normal JSON, ONNX, HF and unrelated caches untouched', async () => {
    entries.set(local, new Response('<!doctype html><html>SPA</html>', { headers: { 'Content-Type': 'text/html' } }));
    const keep = [
      [`${origin}/models/dinov2-small/config.json`, '{"model_type":"dinov2"}'],
      [`${origin}/models/dinov2-small/tokenizer.json`, '{"valid":"JSON with a wrong MIME is still preserved"}'],
      [`${origin}/models/onnx-community/dinov2-small/onnx/model_quantized.onnx`, 'normal binary'],
      ['https://huggingface.co/onnx-community/dinov2-small/resolve/pinned/config.json', '{"model_type":"dinov2"}'],
      [`${origin}/models/unrelated/config.json`, '<!doctype html><html>other model</html>'],
      ['https://other.example/models/onnx-community/dinov2-small/config.json', '<html>other origin</html>'],
    ];
    keep.forEach(([key, body]) => entries.set(key, new Response(body, { headers: { 'Content-Type': 'text/html' } })));
    await repairModelCache(models);
    expect([...entries.keys()]).toEqual(keep.map(([key]) => key));
    expect(storage.open).toHaveBeenCalledExactlyOnceWith('transformers-cache');
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it('detects HTML from its body even with a misleading JSON MIME and split stream chunks', async () => {
    const chunks = ['\ufeff  ', '<!DOC', 'TYPE html><html>SPA</html>'];
    const stream = new ReadableStream({ pull(controller) { const chunk = chunks.shift(); if (chunk) controller.enqueue(new TextEncoder().encode(chunk)); else controller.close(); } });
    // match returns this disposable response so the streaming shape is retained in the test.
    cache.match.mockResolvedValueOnce(new Response(stream, { headers: { 'Content-Type': 'application/json' } }));
    entries.set(local, new Response('bad'));
    await repairModelCache(models); expect(entries.has(local)).toBe(false);
  });
  it('does not create a cache when no Transformers.js cache exists', async () => {
    storage.has.mockResolvedValue(false); await repairModelCache(models); expect(storage.open).not.toHaveBeenCalled();
  });
  it('does not access browser storage in local model mode or when the Cache API is unavailable', async () => {
    await createModelCachePreparation(models, false)(); expect(storage.has).not.toHaveBeenCalled();
    vi.stubGlobal('caches', undefined); await expect(repairModelCache(models)).resolves.toBeUndefined();
  });
  it('coalesces concurrent preparation and reuses successful recovery', async () => {
    const prepare = createModelCachePreparation(models, true);
    const a = prepare(), b = prepare(); expect(a).toBe(b); await Promise.all([a, b]); await prepare();
    expect(storage.open).toHaveBeenCalledTimes(1);
  });
  it('reports a storage failure and allows a later recovery attempt', async () => {
    storage.open.mockRejectedValueOnce(new Error('Cache storage denied'));
    const prepare = createModelCachePreparation(models, true);
    await expect(prepare()).rejects.toBeInstanceOf(ModelCacheRecoveryError);
    await expect(prepare()).resolves.toBeUndefined(); expect(storage.open).toHaveBeenCalledTimes(2);
  });
  it('reports a failed deletion rather than allowing a pipeline to consume poisoned JSON', async () => {
    entries.set(local, new Response('<html>SPA</html>')); cache.delete.mockResolvedValue(false);
    await expect(repairModelCache(models)).rejects.toBeInstanceOf(ModelCacheRecoveryError);
  });
  it('accepts an entry already removed by another worker', async () => {
    entries.set(local, new Response('<html>SPA</html>'));
    cache.delete.mockImplementation(async (request: Request) => { entries.delete(request.url); return false; });
    await expect(repairModelCache(models)).resolves.toBeUndefined();
  });
  it('provides understandable Korean recovery and download guidance without exposing developer commands', () => {
    expect(modelErrorMessage()).toContain('인터넷 연결'); expect(modelErrorMessage()).toContain('첫 실행');
    expect(modelErrorMessage('MODEL_CACHE_RECOVERY_FAILED')).toContain('캐시를 복구');
    expect(modelErrorMessage()).not.toMatch(/npm|Unexpected token/);
  });
});
