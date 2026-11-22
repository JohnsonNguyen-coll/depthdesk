import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { api } from '../server/handler.js';
import { createPrivyIdentity } from '../server/privy.js';
import { feeds } from '../server/feeds.js';
import { collectDepth } from '../server/audit.js';
import { openDatabase } from './sqlite.mjs';

const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT_ID);
const port = Number(onRailway ? process.env.PORT : (process.env.DEPTHDESK_PORT ?? 8787));
if (onRailway && (!Number.isInteger(port) || port < 1 || port > 65535)) {
  throw new Error('Railway PORT must be a valid TCP port.');
}
const host = onRailway ? '0.0.0.0' : '127.0.0.1';
const railwayOrigin = 'https://' + (process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost');
const database = process.env.DEPTHDESK_DB ?? '.local/depthdesk.db';
const serveFrontend = process.argv.includes('--with-frontend') && !process.argv.includes('--api-only');
await mkdir(dirname(database), { recursive: true });
const DB = openDatabase(database);
DB.migrate();

const authenticateWallet = await createPrivyIdentity(process.env.PRIVY_APP_ID?.trim(), process.env.PRIVY_VERIFICATION_KEY);
const env = {
  DB, authenticateWallet,
  LOCAL_ACTOR: onRailway ? undefined : { id: 'loopback-owner', name: 'Local workspace' },
  EXTRA_MARKET_CLOSURES: process.env.EXTRA_MARKET_CLOSURES,
  DEPTHDESK_ALLOWED_ORIGINS: process.env.DEPTHDESK_ALLOWED_ORIGINS
};
const handle = serveFrontend ? (await import('../../dist/server/index.js')).default.fetch : api;
const localHosts = new Set(['127.0.0.1:' + port, 'localhost:' + port, '127.0.0.1:5173', 'localhost:5173']);
const app = createServer(async (incoming, outgoing) => {
  try {
    if (!onRailway && !localHosts.has(incoming.headers.host)) {
      outgoing.writeHead(400).end('Invalid local host');
      return;
    }
    const origin = onRailway ? railwayOrigin : 'http://' + incoming.headers.host;
    const url = new URL(origin + incoming.url);
    if (!serveFrontend && !url.pathname.startsWith('/api/')) {
      outgoing.writeHead(404).end('Not found');
      return;
    }
    const headers = new Headers(incoming.headers);
    if (onRailway) {
      // Only the Sites gateway may provide these identity headers.
      for (const name of Object.keys(incoming.headers)) {
        if (name.startsWith('oai-authenticated-user-')) headers.delete(name);
      }
    }
    const withBody = !['GET', 'HEAD'].includes(incoming.method);
    const request = new Request(url, {
      method: incoming.method,
      headers,
      ...(withBody ? { body: Readable.toWeb(incoming), duplex: 'half' } : {})
    });
    const response = await handle(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    console.error('Local request failed', error.message);
    outgoing.writeHead(503).end('Service unavailable');
  }
});

let running = false;
const timer = setInterval(async () => {
  if (running) return;
  running = true;
  try { await collectDepth(env, feeds); } catch (error) { console.error('Collector failed', error.message); }
  finally { running = false; }
}, 15_000);

app.listen(port, host, () => console.log('DepthDesk listening at http://' + host + ':' + app.address().port));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(timer);
    app.close(() => process.exit(0));
  });
}
