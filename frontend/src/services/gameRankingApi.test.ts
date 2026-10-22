// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiRequest } from './apiClient';
import { clearAuthSession, saveAuthSession } from './authSession';
import { deleteScore, fetchRanking, refusedRunMessage, submitScore } from './gameRankingApi';

vi.mock('./apiClient', async importOriginal => ({ ...await importOriginal<typeof import('./apiClient')>(), apiRequest: vi.fn() }));
const row = { nickname: '탐정', score: 300, solved: 3, bestCombo: 2, playedAt: '2026-10-22T05:00:00Z' };

describe('game ranking API', () => {
  it('reads the shared ranking and drops malformed rows', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce([row, { ...row, nickname: '   ' }, { ...row, score: -1 }, 'x']);
    expect(await fetchRanking()).toEqual([row]);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/game/ranking', expect.objectContaining({ timeoutMs: 8000 }));
  });
  it('posts a run and returns its rank and the new top 10', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ rank: 4, entry: row, ranking: [row] });
    await expect(submitScore({ nickname: '탐정', score: 300, solved: 3, bestCombo: 2 })).resolves.toEqual({ rank: 4, entry: row, ranking: [row] });
    expect(apiRequest).toHaveBeenLastCalledWith('/api/game/scores', expect.objectContaining({ method: 'POST', body: { nickname: '탐정', score: 300, solved: 3, bestCombo: 2 } }));
  });
  it('rejects a response that is not a saved run', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ rank: 0, entry: row, ranking: [] });
    await expect(submitScore({ nickname: '탐정', score: 300, solved: 3, bestCombo: 2 })).rejects.toThrow();
    vi.mocked(apiRequest).mockResolvedValueOnce({ ranking: 'nope' });
    await expect(fetchRanking()).rejects.toThrow();
  });
  it('keeps the server id so administrators can delete a run', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce([{ ...row, id: 7 }, { ...row, id: -1 }]);
    expect(await fetchRanking()).toEqual([{ ...row, id: 7 }, row]);
  });
  it('deletes a run with the signed-in token only', async () => {
    clearAuthSession();
    await expect(deleteScore(7)).rejects.toMatchObject({ status: 401 });
    saveAuthSession('aaa.bbb.ccc', 3600);
    vi.mocked(apiRequest).mockResolvedValueOnce([]);
    await expect(deleteScore(7)).resolves.toEqual([]);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/game/scores/7', expect.objectContaining({ method: 'DELETE', accessToken: 'aaa.bbb.ccc' }));
    clearAuthSession();
  });
  it('explains a refused run but not a connection failure', () => {
    const blocked = new ApiClientError('HTTP_ERROR', '입력값을 확인해 주세요.', 400, { fieldErrors: [{ field: 'nickname', message: '사용할 수 없는 닉네임이에요.' }] });
    expect(refusedRunMessage(blocked)).toBe('사용할 수 없는 닉네임이에요.');
    expect(refusedRunMessage(new ApiClientError('HTTP_ERROR', '요청이 너무 잦아요.', 429))).toBe('요청이 너무 잦아요.');
    expect(refusedRunMessage(new ApiClientError('NETWORK_ERROR', 'x'))).toBeNull();
    expect(refusedRunMessage(new ApiClientError('HTTP_ERROR', 'x', 500))).toBeNull();
  });
});
