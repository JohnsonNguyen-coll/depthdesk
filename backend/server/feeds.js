import { differenceBps, midpoint, orderPreview, sidePrices } from './math.js';

const METRIC = 'https://api.metric.xyz/public/v1';
const ROBINHOOD = 'https://api.robinhood.com/rhj';
const ROBINHOOD_CHAIN = 4663;
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const FEATURED = ['NVDA', 'AAPL', 'TSLA', 'META', 'GOOGL', 'SPY'];
export const ADDRESS = /^0x[0-9a-f]{40}$/i;
const sameAddress = (a, b) => a?.toLowerCase() === b?.toLowerCase();
const MAX_REFERENCE_AGE = 60_000;
const MAX_POOL_AGE = 90_000;

export class FeedError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function makeFeeds(fetchRequest = fetch) {
  const cache = new Map();

  async function read(url, ttl, body) {
    const key = url + (body ? JSON.stringify(body) : '');
    const found = cache.get(key);
    if (found && found.expires > Date.now()) return found.pending;
    const pending = fetchRequest(url, {
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(9000)
    }).then(async response => {
      if (!response.ok) throw new FeedError('Market data source unavailable', response.status === 404 ? 404 : 502);
      return response.json();
    }).catch(error => {
      if (cache.get(key)?.pending === pending) cache.delete(key);
      throw error instanceof FeedError ? error : new FeedError('Market data source unavailable');
    });
    if (cache.size >= 512) cache.delete(cache.keys().next().value);
    cache.set(key, { expires: Date.now() + ttl, pending });
    return pending;
  }

  async function chains() {
    const payload = await read(METRIC + '/chains', 300_000);
    const rows = Array.isArray(payload) ? payload : payload.chains ?? payload.data;
    if (!Array.isArray(rows)) throw new FeedError('Metric returned an invalid chain catalog');
    return rows.flatMap(row => {
      const id = Number(row.chainId ?? row.id);
      return Number.isInteger(id) && id > 0 ? [{ id, name: row.name ?? row.chain ?? String(id) }] : [];
    });
  }

  async function pools(chain, { address, offset = 0, count = 100 } = {}) {
    const query = new URLSearchParams({ sortBy: 'tvl', offset, count });
    if (address) {
      query.set('addresses', address);
      query.set('minTvlFiat', '0');
    }
    const data = await read(METRIC + '/evm/' + chain + '/metadata?' + query, 60_000);
    if (!Array.isArray(data.data)) throw new FeedError('Metric returned an invalid pool catalog');
    return {
      rows: data.data.filter(pool => ADDRESS.test(pool.poolAddress)).map(pool => ({ ...pool, chainId: chain })),
      nextOffset: data.nextOffset ?? null
    };
  }

  async function pool(chain, address) {
    const match = (await pools(chain, { address, count: 1 })).rows.find(row => sameAddress(row.poolAddress, address));
    if (!match) throw new FeedError('Pool is unavailable in Metric’s catalog', 404);
    return match;
  }

  async function prices(chain, addresses) {
    const unique = [...new Set(addresses.map(address => address.toLowerCase()))].sort();
    if (unique.length === 0) return new Map();
    if (unique.length === 1) {
      const base = METRIC + '/evm/' + chain + '/' + unique[0];
      return new Map([[unique[0], await read(base + '/bid_ask?depth=true', 12_000)]]);
    }
    const data = await read(METRIC + '/evm/' + chain + '/bid_ask/batch', 12_000, { pools: unique, depth: true });
    if (!Array.isArray(data.results)) throw new FeedError('Metric returned an invalid batch');
    return new Map(data.results.filter(row => row.quote).map(row => [row.poolAddress.toLowerCase(), row.quote]));
  }

  async function assets() {
    const data = await read(ROBINHOOD + '/assets', 120_000);
    if (!Array.isArray(data.assets)) throw new FeedError('Robinhood returned an invalid asset catalog');
    const indexed = new Map();
    for (const asset of data.assets) {
      if (asset.status && asset.status !== 'ASSET_STATUS_ACTIVE') continue;
      for (const deployment of asset.deployments ?? []) {
        if (deployment.chainId === ROBINHOOD_CHAIN && ADDRESS.test(deployment.contractAddress)) {
          indexed.set(deployment.contractAddress.toLowerCase(), asset);
        }
      }
    }
    return indexed;
  }

  function equityPair(row, catalog) {
    if (row.chainId !== ROBINHOOD_CHAIN) return null;
    const inverted = sameAddress(row.token0, USDG);
    const quoteAddress = inverted ? row.token0 : row.token1;
    const baseAddress = inverted ? row.token1 : row.token0;
    if (!sameAddress(quoteAddress, USDG)) return null;
    const asset = catalog.get(baseAddress?.toLowerCase());
    return asset ? { asset, inverted, quoteUsd: Number(inverted ? row.token0FiatPrice : row.token1FiatPrice) } : null;
  }

  async function reference(pair) {
    if (!pair || !(pair.quoteUsd > 0)) return { status: 'unavailable' };
    const { asset, quoteUsd } = pair;
    const data = await read(ROBINHOOD + '/prices/' + encodeURIComponent(asset.tokenSymbol), 15_000);
    const snapshot = data.quotes?.find(item => item.tokenSymbol === asset.tokenSymbol);
    if (!snapshot || snapshot.currency !== 'USD') return { status: 'unavailable' };
    const asOf = Date.parse(snapshot.generatedAt);
    let multiplier = Number(asset.currentMultiplier);
    if (asset.pendingMultiplierEffectiveTime && Date.parse(asset.pendingMultiplierEffectiveTime) <= asOf) {
      multiplier = Number(asset.pendingMultiplier);
    }
    const base = { asOf: Number.isFinite(asOf) ? asOf : null, multiplier: multiplier > 0 ? multiplier : null, quoteUsd };
    if (snapshot.isTradingHalt) return { ...base, status: 'halted' };
    if (!(asOf > 0 && Math.abs(Date.now() - asOf) <= MAX_REFERENCE_AGE)) return { ...base, status: 'stale' };
    const stock = { bid: Number(snapshot.bid), ask: Number(snapshot.ask) };
    if (!(multiplier > 0) || !midpoint(stock)) return { ...base, status: 'unavailable' };
    return {
      ...base, status: 'live',
      bid: stock.bid * multiplier / quoteUsd, ask: stock.ask * multiplier / quoteUsd,
      stockBid: stock.bid, stockAsk: stock.ask
    };
  }

  async function readPool(row, quote, pair, size = null) {
    const inverted = pair?.inverted ?? false;
    const metricAt = Number(quote?.serverTs) * 1000;
    const metricLive = Number.isFinite(metricAt) && Math.abs(Date.now() - metricAt) <= MAX_POOL_AGE;
    const metric = metricLive ? sidePrices(quote, inverted) : { bid: null, ask: null };
    const ref = pair ? await reference(pair).catch(() => ({ status: 'unavailable' })) : null;
    const benchmark = pair ? (ref.status === 'live' ? ref : null) : metric;
    const mid = benchmark ? midpoint(benchmark) : null;
    const preview = size && metricLive ? orderPreview(row, quote, size, mid, inverted) : null;
    return {
      metric, reference: ref, midpoint: mid, preview,
      metricAt: Number.isFinite(metricAt) ? metricAt : null,
      metricStatus: metricLive ? quote.priceProviderStatus ?? 'unknown' : quote ? 'stale' : 'unavailable',
      buyBps: ref?.status === 'live' ? differenceBps(metric.ask, ref.ask) : null,
      sellBps: ref?.status === 'live' ? differenceBps(metric.bid, ref.bid) : null
    };
  }

  async function featured() {
    const [catalog, inventory] = await Promise.all([assets(), pools(ROBINHOOD_CHAIN)]);
    const matches = FEATURED.flatMap(symbol => {
      const row = inventory.rows.find(item => equityPair(item, catalog)?.asset.tokenSymbol === symbol);
      return row ? [row] : [];
    });
    const latest = await prices(ROBINHOOD_CHAIN, matches.map(row => row.poolAddress)).catch(() => new Map());
    // Limit simultaneous upstream connections within the Worker.
    const results = [];
    for (let index = 0; index < matches.length; index += 3) {
      results.push(...await Promise.all(matches.slice(index, index + 3).map(async row => {
        const pair = equityPair(row, catalog);
        return {
          ...poolSummary(row, pair),
          name: pair.asset.tokenName,
          score: await readPool(row, latest.get(row.poolAddress.toLowerCase()), pair)
        };
      })));
    }
    return results;
  }

  return { assets, chains, equityPair, featured, pool, pools, prices, readPool };
}

function tokenLogo(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.origin === 'https://cdn.metric.xyz' && url.pathname.startsWith('/tokens/')) return url.href;
    if (url.origin === 'https://cdn.robinhood.com' && url.pathname.startsWith('/ncw_assets/logos/')) return url.href;
  } catch {
    return null;
  }
  return null;
}

export function poolTokenIcons(row) {
  return [
    { symbol: row.token0Symbol, logo: tokenLogo(row.token0LogoUrl) },
    { symbol: row.token1Symbol, logo: tokenLogo(row.token1LogoUrl) }
  ];
}

export function poolSummary(row, equity) {
  const inverted = equity?.inverted ?? false;
  const icons = poolTokenIcons(row);
  const [base, quote] = inverted ? [icons[1], icons[0]] : icons;
  return {
    chainId: row.chainId, chain: row.chain,
    address: row.poolAddress,
    pair: inverted ? base.symbol + '/' + quote.symbol : row.pair,
    base: base.symbol, quote: quote.symbol,
    baseLogo: base.logo ?? tokenLogo(equity?.asset?.logoUrl),
    quoteLogo: quote.logo,
    equity: Boolean(equity),
    tier: row.tierQualification ?? null
  };
}

export const feeds = makeFeeds();
