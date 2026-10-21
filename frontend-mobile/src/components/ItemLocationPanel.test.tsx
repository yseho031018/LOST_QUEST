// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ItemLocationPanel from './ItemLocationPanel';
import { findApprovedPlace, kakaoMapSearchUrl } from '../data/approvedPlaces';
import type { Item } from '../types';

// The real map needs a browser canvas; this stand-in lets tests trigger the "no tile loaded" path or a crash.
const map = vi.hoisted(() => ({ mode: 'ok' as 'ok' | 'fail' | 'crash' }));
vi.mock('./LeafletMap', () => ({
  default: ({ place, onFail }: { place: { label: string }; onFail: () => void }) => {
    if (map.mode === 'crash') throw new Error('chunk failed');
    if (map.mode === 'fail') setTimeout(onFail, 0);
    return <div data-testid="leaflet-map">{place.label}</div>;
  },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PanelItem = Pick<Item, 'id' | 'type' | 'source' | 'region' | 'location'>;
const post = (over: Partial<PanelItem> = {}): PanelItem => ({ id: 'api-found-33', type: 'found', source: 'community', region: '서울', location: '송파구 잠실역 8번 출구', ...over });
let root: Root, container: HTMLDivElement;
beforeEach(() => { map.mode = 'ok'; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
async function render(item: PanelItem) {
  await act(async () => root.render(<ItemLocationPanel item={item} />));
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
}
const kakao = () => container.querySelector<HTMLAnchorElement>('a.detail-location-link');

describe('approved map positions', () => {
  it('needs the type, id and stored location text to all match', () => {
    expect(findApprovedPlace(post())).toEqual({ lat: 37.51322, lng: 127.10014, label: '잠실역' });
    expect(findApprovedPlace(post({ type: 'lost' }))).toBeNull();
    expect(findApprovedPlace(post({ id: 'api-lost-33', type: 'lost' }))).toBeNull();
    expect(findApprovedPlace(post({ location: '송파구 잠실역 9번 출구' }))).toBeNull();
    expect(findApprovedPlace(post({ id: 'api-found-999' }))).toBeNull();
    expect(findApprovedPlace(post({ source: 'public' }))).toBeNull();
    expect(findApprovedPlace(post({ id: 'api-lost-64', type: 'lost', location: '  송파구 잠실역 근처 ' }))).toMatchObject({ label: '잠실역' });
  });

  it('has no position for the posts left out on review', () => {
    for (const [id, type, location] of [['api-lost-65', 'lost', '서울 성동구 서울숲역'], ['api-found-31', 'found', '성남시 중원구 버스정류장'], ['api-found-40', 'found', '신촌역 버스정류장'],
      ['api-found-44', 'found', '광주송정역 2층 대합실'], ['api-found-56', 'found', '남포동 버스정류장']] as const) {
      expect(findApprovedPlace(post({ id, type, location }))).toBeNull();
    }
  });

  it('builds a Kakao Map search link without a key', () => {
    expect(kakaoMapSearchUrl('부산 남포동 버스정류장')).toBe('https://map.kakao.com/link/search/%EB%B6%80%EC%82%B0%20%EB%82%A8%ED%8F%AC%EB%8F%99%20%EB%B2%84%EC%8A%A4%EC%A0%95%EB%A5%98%EC%9E%A5');
  });
});

describe('location tab panel', () => {
  it('shows the map, the approximate-position notice and the stored text for an approved post', async () => {
    await render(post());
    expect(container.querySelector('[data-testid="leaflet-map"]')?.textContent).toBe('잠실역');
    expect(container.textContent).toContain('등록된 장소를 기준으로 한 대략적인 위치입니다');
    expect(container.textContent).toContain('서울 송파구 잠실역 8번 출구');
    expect(kakao()?.getAttribute('target')).toBe('_blank');
  });

  it('shows only the text and a Kakao Map link for a post without an approved position', async () => {
    await render(post({ id: 'api-found-56', region: '부산', location: '남포동 버스정류장' }));
    expect(container.querySelector('[data-testid="leaflet-map"]')).toBeNull();
    expect(container.querySelector('.detail-location-map')).toBeNull();
    expect(container.textContent).toContain('부산 남포동 버스정류장');
    expect(container.textContent).toContain('정확한 위치를 지도에 표시할 수 없는 장소예요.');
    expect(kakao()?.href).toBe(kakaoMapSearchUrl('부산 남포동 버스정류장'));
  });

  it('shows no map when the stored text no longer matches the approved one', async () => {
    await render(post({ location: '송파구 잠실역 2번 출구' }));
    expect(container.querySelector('.detail-location-map')).toBeNull();
    expect(kakao()).not.toBeNull();
  });

  it('falls back to the text and link when no map tile loads', async () => {
    map.mode = 'fail';
    await render(post());
    expect(container.querySelector('.detail-location-map')).toBeNull();
    expect(container.textContent).toContain('지도를 불러오지 못했어요');
    expect(container.textContent).toContain('서울 송파구 잠실역 8번 출구');
    expect(kakao()).not.toBeNull();
  });

  it('falls back to the text and link when the map code itself fails', async () => {
    map.mode = 'crash';
    await render(post());
    expect(container.querySelector('.detail-location-map')).toBeNull();
    expect(container.textContent).toContain('지도를 불러오지 못했어요');
    expect(kakao()).not.toBeNull();
  });
});
