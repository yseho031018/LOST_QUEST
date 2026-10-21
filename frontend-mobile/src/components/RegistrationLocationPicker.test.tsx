// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import Picker from './RegistrationLocationPicker';
import { searchRegistrationPlaces } from '../services/placeSearch';
vi.mock('../services/placeSearch', () => ({ searchRegistrationPlaces: vi.fn() }));
vi.mock('./RegistrationMapCanvas', () => ({ default: ({ onPick, onFail }: { onPick: (p: { latitude: number; longitude: number }) => void; onFail: () => void }) => <div><button type="button" onClick={() => onPick({ latitude: 37.5, longitude: 127 })}>핀 테스트</button><button type="button" onClick={onFail}>지도 실패 테스트</button></div> }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, container: HTMLDivElement;
const confirm = vi.fn(), clear = vi.fn();
const place = { id: '42', name: '서울숲역', address: '서울특별시 성동구 서울숲역', region: '서울특별시', latitude: 37.54, longitude: 127.04 };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(searchRegistrationPlaces).mockResolvedValue([place]); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function render(location = '', selected: null | typeof place & { location: string } = null) { await act(async () => root.render(<Picker location={location} selected={selected} onConfirm={confirm} onClear={clear} />)); }
async function click(text: string) { await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === text)!.click(); }); }
async function input(text: string) { await act(async () => { const el = container.querySelector('input')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,text); el.dispatchEvent(new Event('input',{bubbles:true})); }); }
async function open(location='') { await render(location); await click('지도에서 찾기'); }
it('does not search on render, open, or typing; searches only on the explicit button', async () => {
  await open(); await input('서울숲역'); expect(searchRegistrationPlaces).not.toHaveBeenCalled();
  await click('장소 검색'); expect(searchRegistrationPlaces).toHaveBeenCalledExactlyOnceWith('서울숲역');
  expect(container.querySelector('[aria-label="장소 검색 결과"]')?.textContent).toContain('서울숲역');
  expect(container.textContent).toContain('OpenStreetMap');
});
it('requires explicit result confirmation and normalizes the province', async () => {
  await open(); await input('서울숲역'); await click('장소 검색');
  await act(async () => { container.querySelector<HTMLButtonElement>('.registration-place-results button')!.click(); });
  expect(confirm).not.toHaveBeenCalled(); await click('이 장소 사용');
  expect(confirm).toHaveBeenCalledWith({ latitude:37.54, longitude:127.04, location:place.address, region:'서울' });
  expect(container.querySelector('section')).toBeNull(); expect(document.activeElement).toBe(container.querySelector('button'));
});
it('cancels a draft without changing the parent selection', async () => {
  await open('단대오거리역'); await click('핀 테스트'); await click('취소'); expect(confirm).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
});
it('supports a manually positioned pin with the entered place text', async () => {
  await open('단대오거리역'); await click('핀 테스트'); await click('이 장소 사용');
  expect(confirm).toHaveBeenCalledWith({latitude:37.5,longitude:127,location:'단대오거리역'});
});
it('prevents confirming a pin when there is no place text', async () => {
  await open(); await click('핀 테스트'); expect([...container.querySelectorAll('button')].find(b=>b.textContent==='이 장소 사용')?.disabled).toBe(true);
});
it('discards a delayed response after the query changes and avoids double submission', async () => {
  let resolve!: (value: typeof place[]) => void;
  vi.mocked(searchRegistrationPlaces).mockImplementation(() => new Promise(r => {resolve=r;}));
  await open(); await input('서울숲역'); await click('장소 검색');
  expect(searchRegistrationPlaces).toHaveBeenCalledTimes(1); await input('부산역');
  await act(async () => resolve([place])); expect(container.querySelector('.registration-place-results')).toBeNull();
});
it('shows empty and unavailable results while text registration remains possible', async () => {
  vi.mocked(searchRegistrationPlaces).mockResolvedValueOnce([]); await open(); await input('서울숲역'); await click('장소 검색'); expect(container.textContent).toContain('검색 결과가 없어요');
  vi.mocked(searchRegistrationPlaces).mockRejectedValueOnce(new Error('잠시 후 다시 검색해 주세요.')); await click('장소 검색'); expect(container.querySelector('[role="alert"]')?.textContent).toContain('잠시 후');
  await click('지도 실패 테스트'); expect(container.textContent).toContain('지도를 불러오지 못했어요'); await click('취소'); expect(confirm).not.toHaveBeenCalled();
});
it('clears only when explicitly requested and resets drafts after parent text changes', async () => {
  await render(place.address,{...place,location:place.address}); await click('지도에서 찾기'); await click('선택 해제'); expect(clear).toHaveBeenCalledOnce();
  await render('부산역'); expect(container.querySelector('.registration-map-draft')).toBeNull();
});
it('handles Enter as a search without submitting the registration form, and Escape closes', async () => {
  await open(); await input('서울숲역');
  await act(async () => { const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}); container.querySelector('input')!.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); });
  expect(searchRegistrationPlaces).toHaveBeenCalledOnce();
  await act(async () => { container.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); });
  expect(container.querySelector('section')).toBeNull();
});
