// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, ReturnRequest } from '../types';
import ReturnPage from './ReturnPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const app = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const scan = vi.hoisted(() => ({ results: [] as (string | null)[] }));
vi.mock('../context/AppContext', () => ({ useApp: () => app.value }));
// The camera and decoder are stand-ins: each decoded frame takes the next queued result.
vi.mock('../services/qrScan', async importOriginal => ({
  ...await importOriginal<typeof import('../services/qrScan')>(),
  createQrDecoder: async () => async () => scan.results.shift() ?? null,
}));

const ITEM = { id: 'api-found-7', title: '검은색 지갑', type: 'found', category: '지갑', color: '검정', date: '2026-10-01', region: '서울',
  location: '서울역', description: '지갑', image: '/images/wallet.svg', source: 'community', status: 'open', createdBy: 'server', serverId: 7, ownerId: 2 } as Item;
const REQUEST: ReturnRequest = { id: '11', itemId: ITEM.id, status: 'approved', createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z', requesterId: 1, finderId: 2 };

let container: HTMLDivElement;
let root: Root;
let stopTrack: ReturnType<typeof vi.fn>;
let drawImage: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  scan.results = [];
  stopTrack = vi.fn();
  drawImage = vi.fn();
  app.value = { items: [ITEM], requests: [REQUEST], isLoggedIn: true, authUser: { id: 2, role: 'USER' }, activityLoading: false,
    verifyOwner: vi.fn(), verifyQr: vi.fn().mockResolvedValue(undefined), renewQr: vi.fn(), refreshData: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, getImageData: () => ({}) } as unknown as CanvasRenderingContext2D);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const render = async () => {
  await act(async () => { root.render(<MemoryRouter initialEntries={['/returns/11']}><Routes><Route path="/returns/:id" element={<ReturnPage />} /></Routes></MemoryRouter>); });
};
const button = (label: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(label))!;
const frames = async (count: number) => { for (let i = 0; i < count; i++) await act(async () => { await vi.advanceTimersByTimeAsync(300); }); };

describe('scanning the requester\'s QR with the camera', () => {
  it('verifies the scanned code right away and turns the camera off', async () => {
    scan.results = [null, 'LOSTQUEST:RETURN:11:token-abc'];
    await render();
    await act(async () => { button('카메라로 QR 스캔').click(); });
    await frames(3);
    expect(app.value.verifyQr).toHaveBeenCalledWith('11', 'LOSTQUEST:RETURN:11:token-abc');
    expect(container.querySelector('.qr-scanner')).toBeNull();
    expect(stopTrack).toHaveBeenCalled();
    expect(container.textContent).toContain('QR을 확인했어요');
  });

  it('paints the camera preview onto a canvas so it is never a black box', async () => {
    await render();
    await act(async () => { button('카메라로 QR 스캔').click(); });
    await frames(1);
    const preview = container.querySelector<HTMLCanvasElement>('.qr-scanner-preview')!;
    expect(preview.width).toBe(480);
    // Centre square of the 640x480 camera frame, scaled onto the 480px preview.
    expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLVideoElement), 80, 0, 480, 480, 0, 0, 480, 480);
  });

  it('keeps scanning and says why when another request\'s QR is shown', async () => {
    scan.results = ['LOSTQUEST:RETURN:99:other'];
    await render();
    await act(async () => { button('카메라로 QR 스캔').click(); });
    await frames(2);
    expect(app.value.verifyQr).not.toHaveBeenCalled();
    expect(container.querySelector('.qr-scanner')?.textContent).toContain('다른 반환 요청의 QR이에요');
    await act(async () => { container.querySelector<HTMLButtonElement>('.qr-scanner-close')!.click(); });
    expect(container.querySelector('.qr-scanner')).toBeNull();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('explains a blocked camera and leaves the typed code as the fallback', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    await render();
    await act(async () => { button('카메라로 QR 스캔').click(); });
    await frames(1);
    expect(container.querySelector('.qr-scanner [role="alert"]')?.textContent).toContain('카메라 권한이 꺼져 있어요');
    expect(container.querySelector('.qr-verify-form input')).not.toBeNull();
  });
});
