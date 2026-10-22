import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { cameraErrorMessage, createQrDecoder } from '../services/qrScan';
import './QrScanner.css';

const SCAN_INTERVAL_MS = 250;
const MAX_FRAME_SIDE = 640;
const PREVIEW_SIDE = 480;

/** Rear-camera QR reader. Every frame stays on the device; only the decoded text is handed to `onScan`. */
export default function QrScanner({ onScan, onClose, notice }: { onScan: (text: string) => boolean | void; onClose: () => void; notice?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [error, setError] = useState('');
  const handlers = useRef({ onScan, onClose });
  handlers.current = { onScan, onClose };

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let paintFrame: number | undefined;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('no camera API', 'NotFoundError');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        const decode = await createQrDecoder();
        // Closed while the permission prompt was open: release the camera right away.
        if (stopped || !video.current || !context) { stream.getTracks().forEach(track => track.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play().catch(() => undefined);
        setStatus('scanning');
        // Some Android browsers show a camera <video> inside a rounded, clipped box as black even while frames arrive,
        // so the preview is painted onto a canvas (centre square, like the scan frame) on top of the video.
        const paint = () => {
          const el = video.current, out = preview.current, ctx = out?.getContext('2d');
          if (stopped) return;
          if (el && out && ctx && el.videoWidth && el.videoHeight) {
            const side = Math.min(el.videoWidth, el.videoHeight);
            if (out.width !== PREVIEW_SIDE) { out.width = PREVIEW_SIDE; out.height = PREVIEW_SIDE; }
            ctx.drawImage(el, (el.videoWidth - side) / 2, (el.videoHeight - side) / 2, side, side, 0, 0, PREVIEW_SIDE, PREVIEW_SIDE);
          }
          paintFrame = window.requestAnimationFrame(paint);
        };
        paint();
        const tick = async () => {
          const el = video.current;
          if (stopped || !el) return;
          if (el.videoWidth && el.videoHeight) {
            const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(el.videoWidth, el.videoHeight));
            canvas.width = Math.round(el.videoWidth * scale);
            canvas.height = Math.round(el.videoHeight * scale);
            context.drawImage(el, 0, 0, canvas.width, canvas.height);
            const text = await decode(context.getImageData(0, 0, canvas.width, canvas.height)).catch(() => null);
            // onScan returns false to keep scanning (e.g. another request's QR).
            if (!stopped && text && handlers.current.onScan(text) !== false) return;
          }
          if (!stopped) timer = window.setTimeout(() => { void tick(); }, SCAN_INTERVAL_MS);
        };
        void tick();
      } catch (cause) {
        if (stopped) return;
        setError(cameraErrorMessage(cause));
        setStatus('error');
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      if (paintFrame !== undefined) window.cancelAnimationFrame(paintFrame);
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  return <div className="qr-scanner" role="dialog" aria-modal="true" aria-label="QR 스캔">
    <div className="qr-scanner-panel">
      <div className="qr-scanner-head"><strong><Camera size={18} aria-hidden="true" /> 요청자 QR 스캔</strong>
        <button type="button" className="qr-scanner-close" onClick={() => handlers.current.onClose()} aria-label="스캔 닫기"><X size={20} /></button></div>
      {status !== 'error' && <div className="qr-scanner-view">
        <video ref={video} muted playsInline autoPlay aria-hidden="true" />
        <canvas ref={preview} className="qr-scanner-preview" aria-hidden="true" />
        <span className="qr-scanner-frame" aria-hidden="true" />
      </div>}
      <p className={status === 'error' ? 'qr-scanner-error' : 'qr-scanner-hint'} role={status === 'error' ? 'alert' : 'status'}>
        {status === 'error' ? error : status === 'starting' ? '카메라를 켜고 있어요…' : notice || '요청자 화면의 QR을 네모 안에 비춰 주세요.'}
      </p>
    </div>
  </div>;
}
