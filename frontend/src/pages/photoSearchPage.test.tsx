// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { photoFeatures } from '../features/imageAnalysis/appearance';
import { takePhotoHandover } from '../features/photoSearch/handover';
import { clearCandidateCache } from '../features/photoSearch/photoSearch';
import { listServerItems } from '../services/itemApi';
import type { Item } from '../types';
import PhotoSearchPage from './PhotoSearchPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../features/imageAnalysis/appearance', () => ({ photoFeatures: vi.fn(), releaseAppearanceResources: vi.fn() }));
vi.mock('../services/itemApi', async original => ({ ...await original<typeof import('../services/itemApi')>(), listServerItems: vi.fn() }));
vi.mock('../features/photoSearch/photoSearch', async original => ({
  ...await original<typeof import('../features/photoSearch/photoSearch')>(),
  downloadPhoto: vi.fn(async (url: string) => new Blob([url.match(/images\/(\d{8})/)![1]], { type: 'image/jpeg' })),
}));

const image = (n: number) => `http://localhost:8081/api/images/${String(n).padStart(8, '0')}-0000-0000-0000-000000000000.jpg`;
const found = (id: number, title: string, color = '검정'): Item => ({ id: `api-found-${id}`, serverId: id, title, type: 'found', category: '액세서리', color,
  date: '2026-10-01', createdAt: `2026-10-${String(id).padStart(2, '0')}T00:00:00Z`, region: '서울', location: '잠실역', description: '', image: image(id),
  source: 'community', status: 'open', createdBy: 'server' });
const ITEMS = [found(1, '검정 장우산'), found(2, '남색 접이식 우산', '남색'), found(3, '검정 가죽 지갑')];
const VECTORS: Record<number, number[]> = { 1: [0.8, 0.6], 2: [1, 0], 3: [0, 1] };
const auto = (id: string, confident: boolean) => ({ id, label: id, score: confident ? .9 : .3, margin: confident ? .4 : .05, confident, source: 'auto' as const });

let container: HTMLDivElement;
let root: Root;
function Where() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
beforeEach(() => {
  vi.clearAllMocks(); clearCandidateCache();
  vi.mocked(listServerItems).mockResolvedValue(ITEMS);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

async function mount() {
  await act(async () => root.render(<MemoryRouter initialEntries={['/photo-search']}><Routes>
    <Route path="/photo-search" element={<PhotoSearchPage />} /><Route path="/register" element={<Where />} />
  </Routes></MemoryRouter>));
}
async function settle() { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); }
async function pickPhoto() {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="앨범에서 사진 고르기"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['mine'], 'mine.jpg', { type: 'image/jpeg' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
async function click(element: HTMLElement) { await act(async () => element.click()); await settle(); }
const results = () => [...container.querySelectorAll('.photo-search-list li')].map(li => `${li.querySelector('strong')?.textContent} ${li.querySelector('b')?.textContent}`);

describe('PhotoSearchPage', () => {
  it('recognises the kind, compares only that family and ranks by appearance', async () => {
    vi.mocked(photoFeatures).mockImplementation(async (photo, categoryId) => photo instanceof File
      ? { vector: [1, 0], category: auto('umbrella', true) }
      : { vector: VECTORS[Number(await photo.text())], category: { ...auto(categoryId, true), source: 'manual' } });
    await mount(); await settle();
    expect(container.textContent).toContain('사진이 있는 주운 물건 3개 중에서 찾아요');
    expect(button('비슷한 물건 찾기').disabled).toBe(true);
    await pickPhoto();
    await click(button('비슷한 물건 찾기'));
    expect(container.querySelector('#photo-search-results-title')?.textContent).toBe('우산 중 닮은 순서');
    expect(container.textContent).toContain('AI가 사진 속 물건을 우산(으)로 알아봤어요');
    expect(results()).toEqual(['남색 접이식 우산 100.0%', '검정 장우산 80.0%']);
    expect(vi.mocked(photoFeatures).mock.calls.filter(([photo]) => !(photo instanceof File)).map(([, type]) => type)).toEqual(['umbrella', 'umbrella']);
    expect(container.querySelector('a[href="/items/api-found-2"]')).not.toBeNull();
  });
  it('asks for the kind when the photo is unclear, suggests the best guess and offers an any-kind comparison', async () => {
    vi.mocked(photoFeatures).mockImplementation(async (photo, categoryId) => photo instanceof File
      ? { vector: [0, 1], category: auto('suitcase', false) }
      : { vector: VECTORS[Number(await photo.text())], category: { ...auto(categoryId, true), source: 'manual' } });
    await mount(); await settle(); await pickPhoto();
    await click(button('비슷한 물건 찾기'));
    expect(container.querySelector('#photo-search-kind')).not.toBeNull();
    expect(container.textContent).toContain('가방일 수도 있어요');
    expect(container.querySelector('.photo-search-kind-chips .suggested')?.textContent).toBe('가방');
    await click(button('가방'));
    expect(container.textContent).toContain('아직 등록된 가방 사진이 없어요');
    await click(button('종류 상관없이 최근 사진과 비교하기'));
    expect(container.querySelector('#photo-search-results-title')?.textContent).toBe('최근 주운 물건과 비교한 결과');
    expect(results()[0]).toBe('검정 가죽 지갑 100.0%');
  });
  it('uses a picked kind and colour without the classifier and hands the photo over to registration', async () => {
    vi.mocked(photoFeatures).mockImplementation(async (photo, categoryId) => ({ vector: photo instanceof File ? [1, 0] : VECTORS[Number(await photo.text())], category: { ...auto(categoryId, true), source: 'manual' } }));
    await mount(); await settle(); await pickPhoto();
    const [kind, color] = container.querySelectorAll<HTMLSelectElement>('.photo-search-options select');
    await act(async () => { kind.value = 'umbrella'; kind.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { color.value = '검정'; color.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(button('비슷한 물건 찾기'));
    expect(vi.mocked(photoFeatures).mock.calls[0][1]).toBe('umbrella');
    expect(container.textContent).toContain('고른 종류 우산의 물건과 비교했어요');
    expect(results()).toEqual(['남색 접이식 우산 85.0%', '검정 장우산 83.0%']);
    await click(button('내 물건 찾기로 등록하기'));
    expect(container.querySelector('output')?.textContent).toBe('/register?type=lost');
    expect(takePhotoHandover()).toMatchObject({ title: '검정 우산', category: '액세서리', color: '검정', file: expect.any(File) });
  });
  it('shows a recoverable error when the model cannot load', async () => {
    vi.mocked(photoFeatures).mockRejectedValue(new Error('AI 모델을 불러오지 못했어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.'));
    await mount(); await settle(); await pickPhoto();
    await click(button('비슷한 물건 찾기'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('인터넷 연결');
    expect(button('다시 시도')).toBeDefined();
  });
});
