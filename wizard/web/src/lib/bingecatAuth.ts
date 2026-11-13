// Browser side of the BingeCat OAuth popup flow.
// The popup returns to this wizard page (?code&state). main.tsx calls relayBingecatCallback() BEFORE React starts:
// it hands code + state to the opener over a same-origin BroadcastChannel (window.opener may be cut by COOP) and closes.
// Only code and state cross windows; the PKCE verifier and the token stay in the opener's memory.

export const BINGECAT_CHANNEL = 'bingecat-oauth';

export interface BingecatCallback {
  state: string;
  code?: string;
  error?: string;
}

/** The wizard page itself (origin + folder), as registered with BingeCat. */
export function bingecatRedirectUri(): string {
  const url = new URL('./', window.location.href);
  return url.origin + url.pathname;
}

/** True when this window is the OAuth callback popup (nothing else should render). */
export function relayBingecatCallback(): boolean {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state') ?? '';
  if (!state.startsWith('bingecat-') || !(params.has('code') || params.has('error'))) return false;

  // Remove code and state from the address bar before anything else can read or log them.
  window.history.replaceState(null, '', window.location.pathname);
  const message: BingecatCallback = { state, code: params.get('code') ?? undefined, error: params.get('error') ?? undefined };
  const channel = new BroadcastChannel(BINGECAT_CHANNEL);
  channel.postMessage(message);
  channel.close();

  const root = document.getElementById('root');
  if (root) {
    root.textContent = message.code
      ? 'BingeCat is connected. You can close this window and return to the wizard.'
      : 'BingeCat access was not granted. You can close this window and return to the wizard.';
  }
  window.close(); // works when the browser still treats this as a script-opened window; otherwise the text above stays
  return true;
}

/** Opener side: calls back for every relayed callback. Returns the cleanup function. */
export function listenForBingecatCallback(onMessage: (message: BingecatCallback) => void): () => void {
  const channel = new BroadcastChannel(BINGECAT_CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as Partial<BingecatCallback> | null;
    if (data && typeof data.state === 'string') onMessage(data as BingecatCallback);
  };
  return () => channel.close();
}
