import { afterEach, describe, expect, it, vi } from 'vitest';
import { cameraErrorMessage, createQrDecoder, readReturnQr } from './qrScan';

vi.mock('jsqr', () => ({ default: vi.fn(() => ({ data: 'LOSTQUEST:RETURN:11:from-jsqr' })) }));

afterEach(() => { vi.unstubAllGlobals(); });
const frame = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;

describe('return QR scanning', () => {
  it('accepts only this request\'s LOST QUEST QR', () => {
    expect(readReturnQr(' LOSTQUEST:RETURN:11:abc-DEF_1 ', '11')).toEqual({ ok: true, code: 'LOSTQUEST:RETURN:11:abc-DEF_1' });
    expect(readReturnQr('LOSTQUEST:RETURN:12:abc', '11')).toMatchObject({ ok: false, message: expect.stringContaining('다른 반환 요청') });
    expect(readReturnQr('https://example.com', '11')).toMatchObject({ ok: false, message: expect.stringContaining('반환 QR이 아니에요') });
  });

  it('explains camera failures a visitor can fix', () => {
    expect(cameraErrorMessage(new DOMException('x', 'NotAllowedError'))).toContain('카메라 권한');
    expect(cameraErrorMessage(new DOMException('x', 'NotFoundError'))).toContain('카메라를 찾지 못했어요');
    expect(cameraErrorMessage(new DOMException('x', 'NotReadableError'))).toContain('다른 앱');
    expect(cameraErrorMessage(new Error('?'))).toContain('직접 입력');
  });

  it('uses the browser QR reader when there is one, otherwise jsQR', async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: 'LOSTQUEST:RETURN:11:native' }]);
    vi.stubGlobal('BarcodeDetector', vi.fn(function BarcodeDetector() { return { detect }; }));
    expect(await (await createQrDecoder())(frame)).toBe('LOSTQUEST:RETURN:11:native');
    vi.unstubAllGlobals();
    expect(await (await createQrDecoder())(frame)).toBe('LOSTQUEST:RETURN:11:from-jsqr');
  });
});
