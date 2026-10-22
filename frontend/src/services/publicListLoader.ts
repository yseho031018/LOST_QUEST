import { ApiClientError, checkApiHealth } from './apiClient';
import { listServerItems } from './itemApi';
import { listPoliceItems, type PoliceQuery } from './publicItemApi';
import { readPublicList, savePublicList, type PublicListData, type PublicListRequest } from './publicListCache';
import { describeSourceError, idleSource, type SourceState } from './searchSources';
import type { ItemType } from '../types';

/** Auth/validation/not-found/permission failures are never disguised as connectivity outages. */
export function isPublicConnectionFailure(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return false;
  if (error.status && [400, 401, 403, 404, 409, 422, 429].includes(error.status)) return error.gatewayError && ![400, 401, 403].includes(error.status);
  return error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT' || error.gatewayError
    || (error.code === 'HTTP_ERROR' && [500, 502, 503, 504].includes(error.status ?? 0));
}

export async function loadPublicList(request: PublicListRequest, load: () => Promise<PublicListData>, shouldStore: () => boolean = () => true): Promise<SourceState> {
  try {
    const data = await load();
    const lastSyncedAt = data.cache ? Date.parse(data.cache.fetchedAt) : Date.now();
    const cacheSaved = shouldStore() ? await savePublicList(request, data, lastSyncedAt, Date.now()) : false;
    return { ...idleSource, ...data, status: 'ready', dataStatus: 'live', lastSyncedAt, cacheSaved };
  } catch (error) {
    const errorMessage = describeSourceError(error);
    const connectionFailure = isPublicConnectionFailure(error);
    const errorCode = error instanceof ApiClientError && error.serverCode ? { errorCode: error.serverCode } : {};
    // Additional-page failures belong to that page; they must not replace an existing result set.
    if (!connectionFailure || (request.kind.startsWith('police') && request.page > 1)) {
      return { ...idleSource, status: 'error', dataStatus: connectionFailure ? 'unavailable' : 'request-error', error: errorMessage, ...errorCode };
    }
    // Restore the contiguous pages actually viewed for this exact police query, without mixing queries.
    const cached = request.kind.startsWith('police')
      ? await readPublicList({ ...request, page: 1 }, Date.now(), true)
      : await readPublicList(request);
    return cached
      ? { ...idleSource, ...cached, status: 'ready', dataStatus: 'cached', lastSyncedAt: cached.updatedAt, error: errorMessage }
      : { ...idleSource, status: 'error', dataStatus: 'unavailable', error: errorMessage, ...errorCode };
  }
}

export function loadCommunityPublicList(type: ItemType): Promise<SourceState> {
  return loadPublicList({ kind: type === 'lost' ? 'communityLost' : 'communityFound', page: 1, size: 0 }, async () => {
    const items = await listServerItems(type);
    return { items, page: 1, totalPages: 1, totalCount: items.length };
  });
}

const KEYWORD_HEALTH_TIMEOUT_MS = 4_000;
let keywordHealthCheck: Promise<boolean> | null = null;

/** One /api/health request at a time (concurrent failures share it), with a timeout and no retries. */
function backendAnswers(): Promise<boolean> {
  keywordHealthCheck ??= checkApiHealth({ timeoutMs: KEYWORD_HEALTH_TIMEOUT_MS })
    .then(() => true, () => false)
    .finally(() => { keywordHealthCheck = null; });
  return keywordHealthCheck;
}

const KEYWORD_FALLBACK_PAGES = 3;
const KEYWORD_FALLBACK_SIZE = 50;
const squash = (text: string | undefined) => (text ?? '').replace(/\s+/g, '').toLowerCase();

/**
 * The 경찰청 lost-item keyword API is down while its date listing still works: look for the keyword (every word of it)
 * in the newest listing pages. Null when those pages cannot be read either.
 */
export async function recentLostMatches(keyword: string): Promise<SourceState | null> {
  const pages = await Promise.allSettled(Array.from({ length: KEYWORD_FALLBACK_PAGES },
    (_, index) => listPoliceItems('lost', { page: index + 1, size: KEYWORD_FALLBACK_SIZE })));
  const seen = new Set<string>();
  const items = pages.flatMap(page => page.status === 'fulfilled' ? page.value.items : [])
    .filter(item => !seen.has(item.id) && seen.add(item.id));
  if (!items.length) return null;
  const words = keyword.split(/\s+/).map(squash).filter(Boolean);
  const hits = items.filter(item => {
    const text = squash([item.title, item.category, item.description].join(' '));
    return words.every(word => text.includes(word));
  });
  return { ...idleSource, status: 'ready', dataStatus: 'live', items: hits, page: 1, totalPages: 1, totalCount: hits.length,
    lastSyncedAt: Date.now(), keywordFallback: { keyword, scanned: items.length } };
}

export async function loadPolicePublicList(type: ItemType, query: PoliceQuery, shouldStore: () => boolean = () => true): Promise<SourceState> {
  const { refresh: _refresh, ...conditions } = query;
  const state = await loadPublicList({ kind: type === 'lost' ? 'policeLost' : 'policeFound', query: { ...conditions }, page: query.page ?? 1, size: query.size ?? 50 },
    () => listPoliceItems(type, query), shouldStore);
  const keyword = query.q?.trim();
  if (type !== 'lost' || !keyword || (query.page ?? 1) !== 1 || state.status !== 'error') return state;
  // Only a search-only failure (the server said so, or it failed like an outage while /api/health answers) gets the
  // fallback; a real outage keeps the general notice. Unknown or failed checks keep it too.
  const searchOnly = state.errorCode === 'EXTERNAL_API_ERROR'
    || (state.dataStatus === 'unavailable' && !state.errorCode && await backendAnswers());
  if (!searchOnly) return state;
  const fallback = await recentLostMatches(keyword).catch(() => null);
  return fallback ?? (state.errorCode ? state : { ...state, backendReachable: true });
}
