/**
 * Google Identity Services (GIS) for the Google sign-in button. VITE_GOOGLE_CLIENT_ID is public: Google's
 * button posts it to Google, and the API server checks that the returned ID token was issued for it.
 * The ID token ("credential") is sent to the API once and never stored in the browser.
 */
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export interface GoogleCredentialResponse {
  credential?: string;
}

export interface GoogleButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
  locale?: string;
}

export interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    context?: 'signin' | 'signup' | 'use';
  }): void;
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

/** Empty when Google login is not set up for this build; the button is then hidden. */
export function getGoogleClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
}

let loading: Promise<GoogleAccountsId> | null = null;

/** Adds the GIS script once per page. A failed load is forgotten so the next attempt can retry. */
export function loadGoogleIdentity(doc: Document = document, timeoutMs = 10_000): Promise<GoogleAccountsId> {
  const loaded = window.google?.accounts?.id;
  if (loaded) return Promise.resolve(loaded);
  if (loading) return loading;
  loading = new Promise<GoogleAccountsId>((resolve, reject) => {
    const script = doc.createElement('script');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      loading = null;
      reject(new Error('Google Identity Services could not be loaded.'));
    };
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      const api = window.google?.accounts?.id;
      if (api) resolve(api); else fail();
    };
    script.onerror = fail;
    timer = setTimeout(fail, timeoutMs);
    doc.head.appendChild(script);
  });
  return loading;
}

/** Test helper. */
export function resetGoogleIdentityLoader(): void {
  loading = null;
}
