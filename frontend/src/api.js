import { useEffect, useState } from 'react';

const apiOrigin = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') ?? '';

export async function read(url, options) {
  const response = await fetch(apiOrigin + url, { credentials: apiOrigin ? 'include' : 'same-origin', ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error ?? 'The service is unavailable. Please try again.');
  return data;
}

export function write(url, payload = {}) {
  return read(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

export function useResource(url, interval = 0) {
  const [result, setResult] = useState({});
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!url) return;
    let pending;
    const update = () => {
      if (pending || document.visibilityState === 'hidden') return;
      const controller = new AbortController();
      pending = controller;
      read(url, { signal: controller.signal }).then(
        data => { if (!controller.signal.aborted) setResult({ url, generation, data }); },
        error => { if (!controller.signal.aborted) setResult({ url, generation, error: error.message }); }
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
  }, [url, interval, generation]);
  const current = result.url === url && result.generation === generation;
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
