import { useCallback, useContext, useEffect, useState } from 'react';
import { WalletContext } from './wallet-state.js';

const apiOrigin = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') ?? '';

async function readJson(url, options) {
  const response = await fetch(apiOrigin + url, { credentials: apiOrigin ? 'include' : 'same-origin', ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error ?? 'The service is unavailable. Please try again.');
  return data;
}

const usesSession = url => /^\/api\/(?:session|requests)(?:[/?]|$)/.test(url ?? '');

export function useApi() {
  const wallet = useContext(WalletContext);
  const userId = wallet?.id ?? null;
  const getToken = wallet?.getToken;
  const read = useCallback(async (url, options) => {
    if (!userId || !usesSession(url)) return readJson(url, options);
    const token = await getToken();
    if (!token) throw new Error('Wallet session expired. Sign in again.');
    const headers = new Headers(options?.headers);
    headers.set('Authorization', 'Bearer ' + token);
    return readJson(url, { ...options, headers });
  }, [userId, getToken]);
  return {
    read, userId, ready: wallet?.ready ?? true,
    write: (url, payload = {}) => read(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    })
  };
}

export function useResource(url, interval = 0) {
  const [result, setResult] = useState({});
  const [generation, setGeneration] = useState(0);
  const api = useApi();
  const session = usesSession(url);
  const read = session ? api.read : readJson;
  const scope = session ? api.userId : null;
  const ready = !session || api.ready;
  useEffect(() => {
    if (!url || !ready) return;
    let pending;
    const update = () => {
      if (pending || document.visibilityState === 'hidden') return;
      const controller = new AbortController();
      pending = controller;
      read(url, { signal: controller.signal }).then(
        data => { if (!controller.signal.aborted) setResult({ url, generation, scope, data }); },
        error => { if (!controller.signal.aborted) setResult({ url, generation, scope, error: error.message }); }
      ).finally(() => { if (pending === controller) pending = null; });
    };
    update();
    const timer = interval ? setInterval(update, interval) : null;
    document.addEventListener('visibilitychange', update);
    return () => {
      pending?.abort();
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [url, interval, generation, read, scope, ready]);
  const current = ready && result.url === url && result.generation === generation && result.scope === scope;
  return { ...(current ? result : { loading: Boolean(url) }), reload: () => setGeneration(value => value + 1) };
}

export function useAction() {
  const [state, setState] = useState({ saving: false, error: null });
  async function submit(callback) {
    if (state.saving) return;
    setState({ saving: true, error: null });
    try { await callback(); setState({ saving: false, error: null }); }
    catch (error) { setState({ saving: false, error: error.message }); }
  }
  return { ...state, submit };
}
