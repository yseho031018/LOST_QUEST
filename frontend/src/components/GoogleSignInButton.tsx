import { useEffect, useRef, useState } from 'react';
import { getGoogleClientId, loadGoogleIdentity } from '../services/googleIdentity';
import './GoogleSignInButton.css';

interface GoogleSignInButtonProps {
  mode: 'signin' | 'signup';
  /** Blocks clicks while another sign-in request is running. */
  disabled?: boolean;
  onCredential: (credential: string) => void;
}

/** Google's own sign-in button, drawn by GIS in a popup flow. Renders nothing when no client id is configured. */
export default function GoogleSignInButton({ mode, disabled = false, onCredential }: GoogleSignInButtonProps) {
  const clientId = getGoogleClientId();
  const slot = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  useEffect(() => { callback.current = onCredential; }, [onCredential]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setFailed(false);
    loadGoogleIdentity().then(api => {
      const element = slot.current;
      if (cancelled || !element) return;
      api.initialize({
        client_id: clientId,
        callback: response => { if (response.credential) callback.current(response.credential); },
        ux_mode: 'popup',
        auto_select: false,
        context: mode,
      });
      element.replaceChildren();
      api.renderButton(element, {
        type: 'standard', theme: 'outline', size: 'large', shape: 'pill', logo_alignment: 'center', locale: 'ko',
        text: mode === 'signup' ? 'signup_with' : 'signin_with',
        // GIS accepts 200-400px and does not follow the container afterwards.
        width: Math.min(400, Math.max(200, Math.round(element.clientWidth || 320))),
      });
    }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [clientId, mode]);

  if (!clientId) return null;
  return <div className="google-signin">
    <div className="google-signin-divider"><span>또는</span></div>
    <div ref={slot} className={`google-signin-slot${disabled ? ' is-disabled' : ''}`} aria-disabled={disabled || undefined} />
    {failed && <p className="field-error" role="status">구글 로그인 버튼을 불러오지 못했어요. 네트워크를 확인한 뒤 새로고침해 주세요.</p>}
    <p className="muted google-signin-note">구글로 처음 시작하면 구글 계정의 이메일과 이름이 닉네임으로 저장돼요.</p>
  </div>;
}
