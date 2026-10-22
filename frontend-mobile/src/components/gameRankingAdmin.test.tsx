// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GameRankingAdmin from './GameRankingAdmin';
import { deleteScore, fetchRanking } from '../services/gameRankingApi';
import { ApiClientError } from '../services/apiClient';

vi.mock('../services/gameRankingApi', () => ({ fetchRanking: vi.fn(), deleteScore: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const run = (id: number, nickname: string, score: number) => ({ id, nickname, score, solved: 3, bestCombo: 2, playedAt: '2026-10-22T05:00:00Z' });

describe('GameRankingAdmin', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { vi.resetAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const button = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === label);
  const render = async () => { await act(async () => { root.render(<GameRankingAdmin />); }); };

  it('deletes a run only after confirmation and shows the new top 10', async () => {
    vi.mocked(fetchRanking).mockResolvedValue([run(1, '나쁜닉', 900), run(2, '셜록', 600)]);
    vi.mocked(deleteScore).mockResolvedValue([run(2, '셜록', 600)]);
    await render();
    expect(container.textContent).toContain('1위 · 나쁜닉');
    await act(async () => { button('랭킹에서 지우기')!.click(); });
    expect(deleteScore).not.toHaveBeenCalled();
    expect(container.textContent).toContain("'나쁜닉' 기록(900점)을 지울까요?");
    await act(async () => { button('삭제 확인')!.click(); });
    expect(deleteScore).toHaveBeenCalledWith(1);
    expect(container.textContent).not.toContain('나쁜닉 ');
    expect(container.textContent).toContain('1위 · 셜록');
    expect(container.querySelector('[role="status"]')?.textContent).toContain("'나쁜닉' 기록을 랭킹에서 지웠어요.");
  });

  it('shows a refused delete without changing the list', async () => {
    vi.mocked(fetchRanking).mockResolvedValue([run(1, '셜록', 600)]);
    vi.mocked(deleteScore).mockRejectedValue(new ApiClientError('HTTP_ERROR', '관리자만 처리할 수 있습니다.', 403));
    await render();
    await act(async () => { button('랭킹에서 지우기')!.click(); });
    await act(async () => { button('삭제 확인')!.click(); });
    expect(container.querySelector('[role="alert"].field-error')?.textContent).toBe('관리자만 처리할 수 있습니다.');
    expect(container.textContent).toContain('1위 · 셜록');
  });
});
