import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../../types';
import type { CategoryPrediction } from '../imageAnalysis/categories';
import { takePhotoHandover, setPhotoHandover } from './handover';
import { itemKindOf } from './itemKind';
import { candidateItemType, clearCandidateCache, compareCandidates, recognisedKind, scoreCandidate, selectCandidates, titleKindForType } from './photoSearch';

const photo = (n: number) => `http://localhost:8081/api/images/${String(n).padStart(8, '0')}-0000-0000-0000-000000000000.jpg`;
function item(id: number, title: string, extra: Partial<Item> = {}): Item {
  return { id: `api-found-${id}`, serverId: id, title, type: 'found', category: '기타', color: '검정', date: '2026-10-01',
    createdAt: `2026-10-${String(id).padStart(2, '0')}T00:00:00Z`, region: '서울', location: '역', description: '', image: photo(id),
    source: 'community', status: 'open', createdBy: 'server', ...extra };
}
const category = (id: string, confident: boolean): CategoryPrediction => ({ id, label: id, score: confident ? .9 : .3, margin: confident ? .5 : .05, confident, source: 'auto' });

afterEach(() => clearCandidateCache());

describe('title → item kind (same rules as the server)', () => {
  it.each([
    ['검정 자동 장우산', 'umbrella'], ['맥북 에어 노트북', 'laptop'], ['은색 손목시계', 'watch'], ['흰색 무선 이어폰', 'earbuds'],
    ['남색 백팩', 'bag'], ['캐리어', 'bag'], ['black backpack', 'bag'], ['열쇠 꾸러미', 'keys'], ['빨간 야구모자', 'hat'],
  ])('%s → %s', (title, kind) => expect(itemKindOf(title)).toBe(kind));
  it('stays unknown for two families or none, and falls back to the category', () => {
    expect(itemKindOf('우산이 든 가방')).toBeNull();
    expect(itemKindOf('baggage tag')).toBeNull();
    expect(itemKindOf('검정 물건', '지갑')).toBe('wallet');
    expect(itemKindOf('검정 물건', '기타')).toBeNull();
  });
});

describe('candidate selection', () => {
  it('keeps open, visible found items with an uploaded photo of the same family, newest first, up to the limit', () => {
    const items = [
      item(1, '검정 장우산'), item(5, '남색 우산'), item(3, '검정 지갑'),
      item(4, '투명 우산', { image: '/images/umbrella.svg' }), item(6, '접이식 우산', { status: 'returned' }),
      item(7, '체크 양산', { hidden: true }), item(8, '빨간 우산', { type: 'lost', id: 'api-lost-8' }), item(9, '파란 우산'),
    ];
    expect(selectCandidates(items, 'umbrella').map(i => i.serverId)).toEqual([9, 5, 1]);
    expect(selectCandidates(items, 'umbrella', 2).map(i => i.serverId)).toEqual([9, 5]);
    expect(selectCandidates(items, null).map(i => i.serverId)).toEqual([9, 5, 3, 1]);
  });
  it('maps classifier types to searchable families and asks when the classifier is unsure', () => {
    expect(titleKindForType('suitcase')).toBe('bag');
    expect(titleKindForType('scarf')).toBeNull();
    expect(recognisedKind(category('umbrella', true))).toBe('umbrella');
    expect(recognisedKind(category('umbrella', false))).toBeNull();
    expect(recognisedKind(category('other', true))).toBeNull();
    expect(candidateItemType(item(1, '검정 장우산'))).toBe('umbrella');
    expect(candidateItemType(item(2, '낚시대'))).toBe('other');
  });
});

describe('scoring and comparison', () => {
  it('shows the raw appearance so a similar photo never ties with the very same photo', () => {
    expect(scoreCandidate([1, 0], [1, 0], undefined, '검정')).toMatchObject({ score: 100, appearance: 100 });
    expect(scoreCandidate([1, 0], [0.8, 0.6], undefined, '검정')).toMatchObject({ score: 80, appearance: 80 });
    expect(scoreCandidate([1, 0], [-1, 0], undefined, '검정').appearance).toBe(0);
    expect(scoreCandidate([1, 0], [0.8, 0.6], '검정', '블랙')).toMatchObject({ score: 83, colorMatch: true });
    expect(scoreCandidate([1, 0], [0.8, 0.6], '검정', '남색')).toMatchObject({ score: 68, colorMatch: false });
  });
  it('ranks best first, reuses vectors of photos it already compared and skips unreadable photos', async () => {
    const vectors: Record<number, number[]> = { 1: [0.6, 0.8], 2: [1, 0], 3: [0.8, 0.6] };
    const deps = {
      download: vi.fn(async (url: string) => { const id = Number(url.match(/images\/(\d{8})/)![1]); if (id === 4) throw new Error('404'); return new Blob([String(id)], { type: 'image/jpeg' }); }),
      features: vi.fn(async (blob: Blob) => vectors[Number(await blob.text())]),
    };
    const candidates = [item(1, '우산 A'), item(2, '우산 B'), item(3, '우산 C'), item(4, '우산 D')];
    const progress = vi.fn();
    const first = await compareCandidates([1, 0], candidates, undefined, deps, new AbortController().signal, progress);
    expect(first.results.map(r => r.item.serverId)).toEqual([2, 3, 1]);
    expect(first.failed).toBe(1);
    expect(progress).toHaveBeenLastCalledWith({ step: 'compare', done: 4, total: 4 });
    expect(deps.features).toHaveBeenCalledWith(expect.any(Blob), 'umbrella', expect.any(AbortSignal));
    await compareCandidates([0, 1], candidates.slice(0, 3), undefined, deps, new AbortController().signal);
    expect(deps.features).toHaveBeenCalledTimes(3);
  });
  it('stops when the search is cancelled', async () => {
    const controller = new AbortController();
    const deps = { download: vi.fn(async () => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); }), features: vi.fn() };
    await expect(compareCandidates([1, 0], [item(1, '우산')], undefined, deps, controller.signal)).rejects.toThrow();
  });
});

describe('photo handover to registration', () => {
  it('is taken once and expires after 30 minutes', () => {
    const file = new File(['x'], 'mine.jpg', { type: 'image/jpeg' });
    setPhotoHandover({ file, title: '검정 우산', category: '액세서리', color: '검정' }, 0);
    expect(takePhotoHandover(60_000)).toEqual({ file, title: '검정 우산', category: '액세서리', color: '검정' });
    expect(takePhotoHandover(60_000)).toBeNull();
    setPhotoHandover({ file, title: '', category: '기타', color: '' }, 0);
    expect(takePhotoHandover(31 * 60_000)).toBeNull();
  });
});
