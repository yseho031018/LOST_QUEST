/** Reading the return QR (`LOSTQUEST:RETURN:<request id>:<token>`) with the device camera. */

export type ScannedReturnQr = { ok: true; code: string } | { ok: false; message: string };

/** Accepts only this request's QR, so scanning another meeting's code gives a clear message instead of a server error. */
export function readReturnQr(text: string, requestId: string): ScannedReturnQr {
  const value = text.trim();
  const match = /^LOSTQUEST:RETURN:(\d+):(\S+)$/.exec(value);
  if (!match) return { ok: false, message: 'LOST QUEST 반환 QR이 아니에요. 요청자 화면의 QR을 비춰 주세요.' };
  if (match[1] !== requestId) return { ok: false, message: '다른 반환 요청의 QR이에요. 이 물건의 요청자 QR인지 확인해 주세요.' };
  return { ok: true, code: value };
}

/** Why the camera could not start, in words a visitor can act on. */
export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return '카메라 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 카메라를 허용한 뒤 다시 시도해 주세요.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '이 기기에서 사용할 수 있는 카메라를 찾지 못했어요. 인증 코드를 직접 입력해 주세요.';
  if (name === 'NotReadableError') return '다른 앱이 카메라를 쓰고 있어요. 그 앱을 닫고 다시 시도해 주세요.';
  return '카메라를 켜지 못했어요. 인증 코드를 직접 입력해 주세요.';
}

type Decoder = (frame: ImageData) => Promise<string | null>;

/** The browser's own QR reader when it has one (Android Chrome), otherwise jsQR loaded only when scanning starts. */
export async function createQrDecoder(): Promise<Decoder> {
  const Native = (globalThis as { BarcodeDetector?: new (options: { formats: string[] }) => { detect(source: ImageData): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (Native) {
    try {
      const detector = new Native({ formats: ['qr_code'] });
      return async frame => (await detector.detect(frame))[0]?.rawValue ?? null;
    } catch {
      // Some browsers expose the class but not the QR format; fall through to jsQR.
    }
  }
  const { default: jsQR } = await import('jsqr');
  return async frame => jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}
