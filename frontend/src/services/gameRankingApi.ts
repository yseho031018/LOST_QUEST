import { ApiClientError, apiRequest } from './apiClient';
import { loadAuthSession } from './authSession';
import { cleanNickname, type RankingEntry } from './questGameData';

/** 미니게임 ranking shared by every visitor (server, all-time top 10). No login: a nickname only. */

function toEntry(value: unknown): RankingEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const nickname = typeof raw.nickname === 'string' ? cleanNickname(raw.nickname) : '';
  const numbers = [raw.score, raw.solved, raw.bestCombo];
  if (!nickname || !numbers.every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)
    || typeof raw.playedAt !== 'string' || Number.isNaN(Date.parse(raw.playedAt))) return null;
  const id = typeof raw.id === 'number' && Number.isSafeInteger(raw.id) && raw.id > 0 ? raw.id : undefined;
  return { ...(id ? { id } : {}), nickname, score: raw.score as number, solved: raw.solved as number, bestCombo: raw.bestCombo as number, playedAt: raw.playedAt };
}

function toRanking(value: unknown): RankingEntry[] {
  if (!Array.isArray(value)) throw new Error('랭킹 응답이 올바르지 않습니다.');
  return value.map(toEntry).filter((entry): entry is RankingEntry => entry !== null);
}

export async function fetchRanking(): Promise<RankingEntry[]> {
  return toRanking(await apiRequest('/api/game/ranking', { timeoutMs: 8_000 }));
}

/** Saves a finished run; returns its rank over all runs and the new top 10. */
export async function submitScore(run: Omit<RankingEntry, 'playedAt'>): Promise<{ rank: number; entry: RankingEntry; ranking: RankingEntry[] }> {
  const body = await apiRequest('/api/game/scores', { method: 'POST', body: run, timeoutMs: 10_000 }) as Record<string, unknown> | null;
  const entry = toEntry(body?.entry);
  const rank = body?.rank;
  if (!entry || typeof rank !== 'number' || !Number.isSafeInteger(rank) || rank < 1) throw new Error('랭킹 저장 응답이 올바르지 않습니다.');
  return { rank, entry, ranking: toRanking(body?.ranking) };
}

/** Administrators only: removes one run and returns the new top 10. */
export async function deleteScore(id: number): Promise<RankingEntry[]> {
  const session = loadAuthSession();
  if (!session) throw new ApiClientError('HTTP_ERROR', '로그인 후 이용해 주세요.', 401);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiClientError('INVALID_INPUT', '삭제할 기록을 다시 선택해 주세요.');
  return toRanking(await apiRequest(`/api/game/scores/${id}`, { method: 'DELETE', accessToken: session.accessToken, timeoutMs: 10_000 }));
}

/** The server refused the run itself (a blocked nickname, too many saves): say why instead of keeping it on the device. */
export function refusedRunMessage(error: unknown): string | null {
  if (!(error instanceof ApiClientError) || error.code !== 'HTTP_ERROR' || (error.status !== 400 && error.status !== 429)) return null;
  return error.fieldErrors[0]?.message ?? error.message;
}
