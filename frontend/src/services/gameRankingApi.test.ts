import { describe, expect, it, vi } from 'vitest';
import { apiRequest } from './apiClient';
import { fetchRanking, submitScore } from './gameRankingApi';

vi.mock('./apiClient', () => ({ apiRequest: vi.fn() }));
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
});
