// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuestGamePage from './QuestGamePage';
import { fetchRanking, submitScore } from '../services/gameRankingApi';
import { loadRanking, type RankingEntry } from '../services/questGameData';

vi.mock('../services/gameRankingApi', () => ({ fetchRanking: vi.fn(), submitScore: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (nickname: string, score: number, playedAt = '2026-10-22T01:00:00.000Z'): RankingEntry => ({ nickname, score, solved: 3, bestCombo: 2, playedAt });

describe('shared 미니게임 ranking', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const render = async () => { await act(async () => { root.render(<MemoryRouter><QuestGamePage /></MemoryRouter>); }); };
  const text = () => container.textContent ?? '';
  const button = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes(label))!;
  const choices = () => Array.from(container.querySelectorAll<HTMLButtonElement>('.simple-choice-btn'));
  const clues = () => Array.from(container.querySelectorAll('.simple-clue-pill strong')).map(e => e.textContent!.trim());
  const correctButton = () => {
    const [category, color, feature] = clues();
    return choices().find(b => b.querySelector('strong')!.textContent === `${color} ${category}` && b.querySelector('.simple-choice-feature')!.textContent === feature)!;
  };
  const finishWithScore = async (corrects: number) => {
    await render();
    await act(async () => { button('게임 시작').click(); });
    for (let i = 0; i < corrects; i++) await act(async () => { correctButton().click(); });
    for (let i = 0; i < 3; i++) await act(async () => { choices().find(b => b !== correctButton())!.click(); });
  };
  const typeNickname = async (value: string) => {
    const input = container.querySelector<HTMLInputElement>('#quest-nickname')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('shows every visitor\'s top 10 from the server', async () => {
    vi.mocked(fetchRanking).mockResolvedValue([entry('부스최고', 2400), entry('관람객', 900)]);
    await render();
    const board = container.querySelector('.quest-ranking')!;
    expect(board.textContent).toContain('모든 방문자의 기록');
    expect(board.textContent).toContain('부스최고');
    expect(board.textContent).toContain('2,400');
  });

  it('saves a finished run to the server and shows its rank', async () => {
    vi.mocked(fetchRanking).mockResolvedValue([entry('부스최고', 2400)]);
    const mine = entry('셜록', 220, '2026-10-22T05:00:00.000Z');
    vi.mocked(submitScore).mockResolvedValue({ rank: 2, entry: mine, ranking: [entry('부스최고', 2400), mine] });
    await finishWithScore(2);
    await typeNickname('셜록');
    await act(async () => { button('랭킹 등록').click(); });
    expect(submitScore).toHaveBeenCalledWith({ nickname: '셜록', score: 220, solved: 2, bestCombo: 2 });
    expect(text()).toContain('셜록 님이 2위에 올랐어요!');
    expect(loadRanking()).toEqual([]);  // the shared ranking is not copied into this device's list
    await act(async () => { button('랭킹 보기').click(); });
    expect(container.querySelector('.quest-ranking-list li.is-mine')?.textContent).toContain('셜록');
  });

  it('keeps the run on this device when the server cannot take it', async () => {
    vi.mocked(fetchRanking).mockResolvedValue([]);
    vi.mocked(submitScore).mockRejectedValue(new Error('offline'));
    await finishWithScore(1);
    await typeNickname('왓슨');
    await act(async () => { button('랭킹 등록').click(); });
    expect(text()).toContain('왓슨 님이 1위에 올랐어요!');
    expect(loadRanking()).toEqual([expect.objectContaining({ nickname: '왓슨', score: 100 })]);
    await act(async () => { button('랭킹 보기').click(); });
    expect(container.querySelector('.quest-ranking')!.textContent).toContain('이 기기에서 플레이한 기록');
  });

  it('falls back to this device\'s ranking when the server ranking cannot be read', async () => {
    vi.mocked(fetchRanking).mockRejectedValue(new Error('offline'));
    await render();
    expect(container.querySelector('.quest-ranking')!.textContent).toContain('이 기기에서 플레이한 기록');
  });
});
