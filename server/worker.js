import { api } from './handler.js';
import { sampleDue } from './campaigns.js';
import { feeds } from './feeds.js';
import { assets } from './built-assets.js';

const contentTypes = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml', woff2: 'font/woff2', woff: 'font/woff', txt: 'text/plain; charset=utf-8'
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return api(request, env);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    const file = assets[pathname] ?? (!pathname.split('/').at(-1).includes('.') ? assets['/index.html'] : null);
    if (!file) return new Response('Not found', { status: 404 });
    const [type, encoded] = file;
    const body = request.method === 'HEAD' ? null : Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    return new Response(body, { headers: {
      'content-type': contentTypes[type] ?? 'application/octet-stream',
      'cache-control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'self'",
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff'
    } });
  },
  async scheduled(_event, env) {
    return sampleDue(env.DB, feeds);
  }
};
