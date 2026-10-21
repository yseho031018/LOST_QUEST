// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage';
import { createServerItem, fromServerItem } from '../services/itemApi';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../context/AppContext', () => ({ useApp: () => ({ isLoggedIn: true, logout: vi.fn() }) }));
vi.mock('../context/MatchNotificationContext', () => ({ useMatchNotifications: () => ({ runRefresh: vi.fn() }) }));
vi.mock('../services/itemApi', async importOriginal => ({
  ...await importOriginal<typeof import('../services/itemApi')>(), createServerItem: vi.fn(),
}));

const warning = '선택한 지역과 입력한 장소가 다른 것 같아요. 위치를 다시 확인해 주세요.';
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
async function render(type = 'lost') {
  await act(async () => root.render(<MemoryRouter initialEntries={['/register?type=' + type]}><RegisterPage /></MemoryRouter>));
}
async function enter(id: string, value: string) {
  const element = container.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)!;
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

it.each(['lost', 'found'])('starts with an empty required place and a placeholder for %s registration', async type => {
  await render(type);
  const input = container.querySelector<HTMLInputElement>('#item-location')!;
  expect(input.value).toBe('');
  expect(input.placeholder).toBe('예: 성남시 단대오거리역 2번 출구 앞');
  expect(input.required).toBe(true);
  expect(input.validity.valueMissing).toBe(true);
  expect(input.getAttribute('aria-describedby')).toBe('item-location-help');
  expect(container.querySelector('#item-location-warning')).toBeNull();
  input.focus(); expect(document.activeElement).toBe(input);
});

it.each(['', '   '])('keeps the first step and prevents an API call for blank place %j', async place => {
  await render(); await enter('item-location', place); await submit();
  expect(container.querySelector('#item-location')).not.toBeNull();
  expect(container.querySelector('#item-description')).toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('상세 장소를 모두 입력');
  expect(createServerItem).not.toHaveBeenCalled();
});

it('shows an advisory, reevaluates region and place changes, and describes both fields accessibly', async () => {
  await render();
  await enter('item-region', '경북'); await enter('item-location', '서울 성동구 서울숲역');
  expect(container.querySelector('#item-location-warning')?.textContent).toBe(warning);
  expect(container.querySelector('#item-location-warning')?.getAttribute('role')).toBe('status');
  expect(container.querySelector('#item-location')?.getAttribute('aria-describedby')).toContain('item-location-warning');
  expect(container.querySelector('#item-region')?.getAttribute('aria-describedby')).toBe('item-location-warning');
  expect(container.querySelector('#item-location')?.getAttribute('aria-invalid')).toBeNull();
  await enter('item-region', '서울'); expect(container.querySelector('#item-location-warning')).toBeNull();
  await enter('item-region', '경북'); expect(container.querySelector('#item-location-warning')).not.toBeNull();
  await enter('item-location', '단대오거리역'); expect(container.querySelector('#item-location-warning')).toBeNull();
  await enter('item-location', '서울특별시 성동구 서울숲역'); expect(container.querySelector('#item-location-warning')).not.toBeNull();
  await enter('item-location', ''); expect(container.querySelector('#item-location-warning')).toBeNull();
});

it.each(['lost', 'found'] as const)('allows a mismatch and preserves the %s location in the existing API payload', async type => {
  vi.mocked(createServerItem).mockResolvedValue(fromServerItem(type, {
    id: 12, userId: 99, title: '검은색 가죽 지갑', category: '지갑', color: '검정', description: '검은색 가죽 지갑입니다.',
    lostDate: '2026-10-01', foundDate: '2026-10-01', region: '경북', location: '서울 성동구 서울숲역',
    status: type === 'lost' ? 'LOST' : 'STORED',
  }));
  await render(type); await enter('item-region', '경북'); await enter('item-location', '서울 성동구 서울숲역');
  expect(container.querySelector('#item-location-warning')).not.toBeNull();
  await submit();
  expect(container.querySelector('#item-description')).not.toBeNull();
  expect(container.querySelector('.register-review')?.textContent).toContain('경북 · 서울 성동구 서울숲역');
  if (type === 'found') { await enter('ownership-question', '안쪽 색상은?'); await enter('ownership-answer', '파랑'); }
  await submit();
  expect(createServerItem).toHaveBeenCalledExactlyOnceWith(type, expect.objectContaining({ region: '경북', location: '서울 성동구 서울숲역' }), { image: null });
  const payload = vi.mocked(createServerItem).mock.calls[0][1];
  expect(payload).not.toHaveProperty('latitude'); expect(payload).not.toHaveProperty('longitude');
  expect(container.querySelector('.register-success')).not.toBeNull();
});

it('accepts a landmark without guessing its province and keeps it when returning to step one', async () => {
  await render(); await enter('item-location', '단대오거리역'); await submit();
  expect(container.querySelector('#item-description')).not.toBeNull();
  await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent?.includes('이전 단계'))!.click(); });
  expect(container.querySelector<HTMLInputElement>('#item-location')?.value).toBe('단대오거리역');
  expect(container.querySelector('#item-location-warning')).toBeNull();
});
