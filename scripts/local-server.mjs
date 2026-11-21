import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { api } from '../server/handler.js';
import { feeds } from '../server/feeds.js';
import { sampleDue } from '../server/campaigns.js';
import { openDatabase } from './sqlite.mjs';

const port = Number(process.env.DEPTHDESK_PORT ?? 8787);
const database = process.env.DEPTHDESK_DB ?? '.local/depthdesk.db';
const apiOnly = process.argv.includes('--api-only');
await mkdir(dirname(database), { recursive: true });
const DB = openDatabase(database);
DB.migrate();

const env = {
  DB, LOCAL_ACTOR: { id: 'loopback-owner', name: 'Local workspace' },
  EXTRA_MARKET_CLOSURES: process.env.EXTRA_MARKET_CLOSURES,
  DEPTHDESK_ALLOWED_ORIGINS: process.env.DEPTHDESK_ALLOWED_ORIGINS
};
const handle = apiOnly ? api : (await import('../dist/server/index.js')).default.fetch;
const localHosts = new Set(['127.0.0.1:' + port, 'localhost:' + port, '127.0.0.1:5173', 'localhost:5173']);
const app = createServer(async (incoming, outgoing) => {
  try {
    if (!localHosts.has(incoming.headers.host)) {
      outgoing.writeHead(400).end('Invalid local host');
      return;
    }
    const url = new URL('http://' + incoming.headers.host + incoming.url);
    const withBody = !['GET', 'HEAD'].includes(incoming.method);
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers,
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
  try { await sampleDue(DB, feeds); } catch (error) { console.error('Collector failed', error.message); }
  finally { running = false; }
}, 15_000);

app.listen(port, '127.0.0.1', () => console.log('DepthDesk listening at http://127.0.0.1:' + port));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(timer);
    app.close(() => process.exit(0));
  });
}
