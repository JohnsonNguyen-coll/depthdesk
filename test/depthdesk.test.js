import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../server/handler.js';
import { openDatabase } from '../scripts/sqlite.mjs';
import { midpoint, orderPreview, sidePrices, toAtomic } from '../server/math.js';
import { campaignWindows, SAMPLE_MS } from '../server/schedule.js';
import { sampleDue, scoreObservation } from '../server/campaigns.js';

const address = '0x0000000000000000000000000000000000000012';
const pool = {
  poolAddress: address, chainId: 4663, pair: 'NVDA/USDG', token0Symbol: 'NVDA', token1Symbol: 'USDG',
  token0Decimals: 18, token1Decimals: 6
};
const campaignInput = {
  title: 'NVDA liquidity campaign', description: 'Maintain a two-sided market during the measurement window.',
  chainId: 4663, address, schedule: 'market_open', periods: 5, size: 5000, maxBps: 50, target: 95, budgetCents: 40000
};
const quote = {
  bidAdj: (99n << 64n).toString(), askAdj: (101n << 64n).toString(),
  depth: {
    bids: [{ cumulativeInputVolume: toAtomic(100, 18).toString(), cumulativeVolume: '9900000000' }],
    asks: [{ cumulativeInputVolume: '10100000000', cumulativeVolume: toAtomic(100, 18).toString() }]
  }
};

test('handles asymmetric depth, sentinel prices, and decimal scales', () => {
  assert.deepEqual(sidePrices(quote), { bid: 99, ask: 101 });
  assert.deepEqual(sidePrices({ ...quote, bidAdj: '0' }, true), { bid: 1 / 101, ask: null });
  assert.equal(midpoint(sidePrices(quote)), 100);
  const depth = orderPreview(pool, quote, 5000, 100);
  assert.equal(depth.buy.complete, true);
  assert.ok(Math.abs(depth.buy.price - 101) < 0.00001);
  assert.equal(depth.sell.price, 99);
  assert.equal(orderPreview(pool, quote, 30000, 100).sell.complete, false);
});

test('market-open windows follow New York DST and skip exchange holidays', () => {
  const windows = campaignWindows('market_open', 2, Date.parse('2026-11-25T17:00:00Z'));
  assert.deepEqual(windows.map(value => new Date(value.from).toISOString()), [
    '2026-11-27T14:30:00.000Z', '2026-11-30T14:30:00.000Z'
  ]);
  assert.equal(new Date(campaignWindows('market_open', 1, Date.parse('2026-07-02T18:00:00Z'))[0].from).toISOString(),
    '2026-07-06T13:30:00.000Z');
});

test('distinguishes unavailable observations from insufficient depth', () => {
  assert.equal(scoreObservation({ metricAt: Date.now(), metricStatus: 'healthy', reference: { status: 'stale' } }, 50).outcome, 'unavailable');
  const thin = scoreObservation({ metricAt: Date.now(), metricStatus: 'healthy', midpoint: 100,
    preview: { buy: { complete: true, price: 100 }, sell: { complete: false, price: 100 } } }, 50);
  assert.equal(thin.outcome, 'fail');
});

test('enforces ownership and origin, accepts an offer once, and retains observations', async () => {
  const DB = openDatabase();
  DB.migrate();
  const feeds = {
    pool: async () => pool, assets: async () => new Map(), equityPair: () => ({ inverted: false }),
    prices: async () => new Map([[address, quote]]),
    readPool: async () => ({
      metricAt: Date.now(), metricStatus: 'healthy', midpoint: 100, reference: { status: 'live' },
      preview: { buy: { price: 100.01, complete: true }, sell: { price: 99.99, complete: true } }
    })
  };
  const base = 'https://depthdesk.example';
  const act = (path, actor, body, origin = base) => api(new Request(base + '/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', origin, ...(actor ? { 'oai-authenticated-user-id': actor } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  }), { DB }, feeds);
  try {
    assert.equal((await act('/requests', null, campaignInput)).status, 401);
    assert.equal((await act('/requests', 'sponsor', campaignInput, 'https://wrong.example')).status, 403);
    const created = await act('/requests', 'sponsor', campaignInput);
    assert.equal(created.status, 201);
    const campaign = await created.json();
    const detail = '/requests/' + campaign.id;
    const offer = { amountCents: 36000, notes: 'We will maintain measurable two-sided liquidity.' };
    assert.equal((await act(detail + '/proposals', 'sponsor', offer)).status, 403);
    const submitted = await act(detail + '/proposals', 'curator', offer);
    assert.equal(submitted.status, 201);
    const proposalId = (await submitted.json()).proposals[0].id;
    assert.equal((await act(detail + '/proposals', 'curator', offer)).status, 409);
    assert.deepEqual((await (await act(detail, 'viewer')).json()).proposals, []);
    assert.equal((await act(detail + '/accept', 'curator', { proposalId })).status, 403);
    const race = await Promise.all([act(detail + '/accept', 'sponsor', { proposalId }), act(detail + '/accept', 'sponsor', { proposalId })]);
    assert.deepEqual(race.map(response => response.status).sort(), [200, 409]);
    const scheduled = await (await act(detail, 'viewer')).json();
    assert.equal(scheduled.status, 'scheduled');
    assert.equal(scheduled.report.planned, 30);
    const slot = Math.floor(Date.now() / SAMPLE_MS) * SAMPLE_MS;
    DB.prepare('DELETE FROM campaign_windows WHERE campaign_id = ?').bind(campaign.id).run();
    DB.prepare('INSERT INTO campaign_windows VALUES (?, ?, ?)').bind(campaign.id, slot, slot + SAMPLE_MS).run();
    assert.equal((await sampleDue(DB, feeds)).recorded, 1);
    assert.equal((await sampleDue(DB, feeds)).recorded, 0);
    const measured = await (await act(detail, 'viewer')).json();
    assert.equal(measured.report.pass, 1);
    assert.equal(measured.report.samples[0].outcome, 'pass');
    assert.equal((await act(detail + '/cancel', 'viewer', {})).status, 403);
    assert.equal((await act(detail + '/cancel', 'sponsor', {})).status, 200);
  } finally {
    DB.close();
  }
});
