import { ADDRESS, FeedError, feeds as liveFeeds, poolResearch, poolSummary, poolTokenIcons } from './feeds.js';
import { accept, cancel, createCampaign, detail, HttpError, integer, listCampaigns, propose } from './campaigns.js';
import { collectDepth, readDepthAudit } from './audit.js';

const CAMPAIGN_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_BODY = 16_384;
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (value, status = 200) => Response.json(value, { status, headers });

function requestActor(request, env) {
  if (env.authenticateWallet) return env.authenticateWallet(request);
  if (env.LOCAL_ACTOR) return env.LOCAL_ACTOR;
  // The Sites edge strips visitor-supplied identity headers before injecting authenticated identity.
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id) return null;
  let name = request.headers.get('oai-authenticated-user-full-name') ?? 'Member';
  if (request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { name = decodeURIComponent(name); } catch { name = 'Member'; }
  }
  return { id, name: name.trim().slice(0, 80) || 'Member' };
}

async function input(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new HttpError(415, 'Send a JSON request.');
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new HttpError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Request body is required.');
  let bytes = 0;
  const decoder = new TextDecoder();
  let value = '';
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    bytes += chunk.byteLength;
    if (bytes > MAX_BODY) {
      await reader.cancel();
      throw new HttpError(413, 'Request is too large.');
    }
    value += decoder.decode(chunk, { stream: true });
  }
  try {
    value = JSON.parse(value + decoder.decode());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new HttpError(400, 'Send a valid JSON object.');
  }
}

function permitWrite(actor, trustedOrigin) {
  if (!actor) throw new HttpError(401, 'Sign in to continue.');
  if (!trustedOrigin) throw new HttpError(403, 'This request must come from DepthDesk.');
}

function poolCoordinates(chainId, address) {
  const id = integer(Number(chainId), 'Chain ID', 1, Number.MAX_SAFE_INTEGER);
  if (!ADDRESS.test(address)) throw new HttpError(400, 'Enter a valid pool address.');
  return [id, address.toLowerCase()];
}

async function campaignPoolIcons(url, feeds) {
  const pools = url.searchParams.getAll('pool');
  if (pools.length > 100) throw new HttpError(400, 'Request at most 100 pool icons.');
  const groups = new Map();
  for (const item of pools) {
    const [chainValue, addressValue, extra] = item.split(':');
    if (extra !== undefined) throw new HttpError(400, 'Enter a valid pool identifier.');
    const [chain, address] = poolCoordinates(chainValue, addressValue);
    if (!groups.has(chain)) groups.set(chain, new Set());
    groups.get(chain).add(address);
  }
  if (groups.size > 6) throw new HttpError(400, 'Request pool icons from at most six chains.');
  const results = await Promise.allSettled([...groups].map(async ([chain, addresses]) => {
    const requested = [...addresses].sort();
    const { rows } = await feeds.pools(chain, { address: requested.join(','), count: requested.length });
    return rows.filter(row => addresses.has(row.poolAddress.toLowerCase()))
      .map(row => [chain + ':' + row.poolAddress.toLowerCase(), poolTokenIcons(row)]);
  }));
  return Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? result.value : []));
}

async function isJob(request, env) {
  const value = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!env.DEPTHDESK_JOB_TOKEN || !value || value.length > 512) return false;
  const hashes = await Promise.all([env.DEPTHDESK_JOB_TOKEN, value].map(async text =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))));
  let mismatch = 0;
  for (let i = 0; i < 32; i++) mismatch |= hashes[0][i] ^ hashes[1][i];
  return mismatch === 0;
}

export async function api(request, env, feeds = liveFeeds) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const sameOrigin = origin === url.origin;
  const allowedOrigins = (env.DEPTHDESK_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim().replace(/\/$/, ''));
  const crossOrigin = origin && origin !== 'null' && !sameOrigin && allowedOrigins.includes(origin);
  const requestedMethod = request.headers.get('access-control-request-method');
  const preflight = request.method === 'OPTIONS' && origin && requestedMethod;
  let response;
  if (preflight) {
    response = new Response(null, { status: crossOrigin && ['GET', 'POST'].includes(requestedMethod) ? 204 : 403 });
    response.headers.set('Vary', 'Origin, Access-Control-Request-Method');
    if (response.status === 204) {
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST');
      response.headers.set('Access-Control-Allow-Headers', env.authenticateWallet ? 'Content-Type, Authorization' : 'Content-Type');
    }
  } else {
    response = await handleApi(request, url, env, feeds, sameOrigin || crossOrigin);
    if (env.DEPTHDESK_ALLOWED_ORIGINS) response.headers.append('Vary', 'Origin');
  }
  if (crossOrigin && (!preflight || response.status === 204)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return response;
}

async function handleApi(request, url, env, feeds, trustedOrigin) {
  try {
    const parts = url.pathname.split('/').filter(Boolean).slice(1);
    const { method } = request;
    const [resource, id, action, extra] = parts;
    const actor = resource === 'requests' || resource === 'session' ? await requestActor(request, env) : null;
    if (method === 'GET' && !id && resource === 'health') {
      await env.DB.prepare('SELECT id FROM campaigns LIMIT 1').first();
      return json({ status: 'ok' });
    }
    if (method === 'GET' && !id && resource === 'session') return json({ user: actor ? { name: actor.name } : null });
    if (method === 'GET' && !id && resource === 'chains') return json({ chains: await feeds.chains() });
    if (method === 'GET' && resource === 'pools' && id === 'icons' && !action) {
      return json({ pools: await campaignPoolIcons(url, feeds) });
    }
    if (method === 'GET' && !id && resource === 'pools') {
      const chain = integer(Number(url.searchParams.get('chain')), 'Chain ID', 1, Number.MAX_SAFE_INTEGER);
      const offset = integer(Number(url.searchParams.get('offset') ?? 0), 'Offset', 0, 10_000);
      const [data, catalog] = await Promise.all([
        feeds.pools(chain, { offset, count: 100 }), chain === 4663 ? feeds.assets().catch(() => new Map()) : new Map()
      ]);
      return json({ pools: data.rows.map(row => poolSummary(row, feeds.equityPair(row, catalog))), nextOffset: data.nextOffset });
    }
    if (method === 'GET' && resource === 'pools' && id && action && !extra) {
      const [chain, address] = poolCoordinates(id, action);
      const [row, catalog] = await Promise.all([
        feeds.pool(chain, address), chain === 4663 ? feeds.assets().catch(() => new Map()) : new Map()
      ]);
      return json({ pool: poolSummary(row, feeds.equityPair(row, catalog)) });
    }
    if (method === 'GET' && resource === 'research' && id && action && !extra) {
      const [chain, address] = poolCoordinates(id, action);
      const size = integer(Number(url.searchParams.get('size') ?? 5000), 'Order size', 1, 10_000_000);
      const [row, snapshots, catalog] = await Promise.all([
        feeds.pool(chain, address), feeds.prices(chain, [address]).catch(() => new Map()),
        chain === 4663 ? feeds.assets().catch(() => new Map()) : new Map()
      ]);
      const sizes = [...new Set([1000, 5000, 10000, size])].sort((a, b) => a - b);
      return json(poolResearch(row, snapshots.get(address), feeds.equityPair(row, catalog), sizes));
    }
    if (method === 'GET' && resource === 'rwa' && id === 'quotes' && !action) {
      return json({ markets: await feeds.featured({ extraClosures: env.EXTRA_MARKET_CLOSURES }) });
    }
    if (method === 'GET' && resource === 'rwa' && id && action && !extra) {
      const [chain, address] = poolCoordinates(id, action);
      const size = integer(Number(url.searchParams.get('size') ?? 5000), 'Order size', 1, 10_000_000);
      const [row, snapshots, catalog] = await Promise.all([
        feeds.pool(chain, address), feeds.prices(chain, [address]).catch(() => new Map()), feeds.assets()
      ]);
      const equity = feeds.equityPair(row, catalog);
      if (!equity) throw new HttpError(404, 'This pool has no verified equity mapping.');
      return json({ ...poolSummary(row, equity), size, score: await feeds.readPool(row, snapshots.get(address), equity, size, { extraClosures: env.EXTRA_MARKET_CLOSURES }) });
    }
    if (method === 'GET' && resource === 'depth-audit' && !id) return json(await readDepthAudit(env.DB));
    if (method === 'POST' && resource === 'jobs' && id === 'sample' && !action) {
      if (!await isJob(request, env)) throw new HttpError(401, 'Collector authentication required.');
      return json(await collectDepth(env, feeds));
    }
    if (resource === 'requests' && !extra) {
      const db = env.DB;
      if (method === 'GET' && !id) {
        const before = integer(Number(url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER), 'Cursor', 1, Number.MAX_SAFE_INTEGER);
        return json(await listCampaigns(db, actor, before));
      }
      if (method === 'GET' && CAMPAIGN_ID.test(id) && !action) return json(await detail(db, actor, id));
      if (method === 'POST' && !id) {
        permitWrite(actor, trustedOrigin);
        return json(await createCampaign(db, actor, await input(request), feeds), 201);
      }
      if (method === 'POST' && CAMPAIGN_ID.test(id) && ['proposals', 'accept', 'cancel'].includes(action)) {
        permitWrite(actor, trustedOrigin);
        if (action === 'cancel') await cancel(db, actor, id);
        if (action === 'proposals') await propose(db, actor, id, await input(request));
        if (action === 'accept') await accept(db, actor, id, await input(request), env);
        return json(await detail(db, actor, id), action === 'proposals' ? 201 : 200);
      }
    }
    return json({ error: 'Route not found.' }, 404);
  } catch (error) {
    if (error instanceof HttpError || error instanceof FeedError) return json({ error: error.message }, error.status);
    console.error('DepthDesk request failed', error);
    return json({ error: 'DepthDesk is temporarily unavailable.' }, 503);
  }
}
