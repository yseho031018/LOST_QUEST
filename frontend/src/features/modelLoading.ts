type ModelLocation = { directory: string; source: string };
const JSON_FILES = ['config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json'];

export const MODEL_LOAD_MESSAGE = 'AI 모델을 불러오지 못했어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요. 첫 실행에는 모델 다운로드에 시간이 걸릴 수 있어요.';
export const MODEL_CACHE_MESSAGE = 'AI 모델 캐시를 복구하지 못했어요. 브라우저의 사이트 저장 공간 접근이 허용되어 있는지 확인한 뒤 다시 시도해 주세요.';
export const modelErrorMessage = (code?: string) => code === 'MODEL_CACHE_RECOVERY_FAILED' ? MODEL_CACHE_MESSAGE : MODEL_LOAD_MESSAGE;

export class ModelCacheRecoveryError extends Error {
  constructor(cause: unknown) { super(MODEL_CACHE_MESSAGE, { cause }); this.name = 'ModelCacheRecoveryError'; }
}

async function containsHtml(response: Response): Promise<boolean> {
  // Read only the prefix, including for a normal multi-megabyte tokenizer. Never load weights into memory here.
  const reader = response.body?.getReader();
  if (!reader) return false;
  const decoder = new TextDecoder();
  let prefix = '';
  try {
    while (prefix.length < 512) {
      const { done, value } = await reader.read();
      if (done) break;
      prefix += decoder.decode(value.subarray(0, 512 - prefix.length), { stream: true });
    }
    return /^\s*(?:<!doctype\s+html\b|<html(?:\s|>))/i.test(prefix);
  } finally { await reader.cancel(); }
}

/** Repair only this application's known local model JSON keys in Transformers.js's cache. */
export async function repairModelCache(models: readonly ModelLocation[]): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    if (!await caches.has('transformers-cache')) return;
    const cache = await caches.open('transformers-cache');
    const paths = new Set(models.flatMap(model => [model.source, model.directory]
      .flatMap(id => JSON_FILES.map(file => `/models/${id}/${file}`))));
    for (const request of await cache.keys()) {
      const url = new URL(request.url);
      if (url.origin !== location.origin || !paths.has(url.pathname)) continue;
      const response = await cache.match(request);
      if (!response || !await containsHtml(response)) continue;
      // Another worker may have removed the same bad entry in the meantime.
      if (!await cache.delete(request) && await cache.match(request)) throw new Error('Bad model cache entry could not be removed');
    }
  } catch (cause) { throw new ModelCacheRecoveryError(cause); }
}

/** Complete recovery before any pipeline reads its cache; coalesce concurrent calls and allow retry after failure. */
export function createModelCachePreparation(models: readonly ModelLocation[], remote: boolean): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => {
    if (!remote) return Promise.resolve();
    pending ??= repairModelCache(models).catch(error => { pending = undefined; throw error; });
    return pending;
  };
}
