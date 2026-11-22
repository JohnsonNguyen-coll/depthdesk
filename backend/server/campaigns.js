import { ADDRESS, poolSummary } from './feeds.js';
import { differenceBps } from './math.js';
import { campaignWindows, SAMPLE_MS, slots } from './schedule.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function string(value, label, min, max) {
  const info = typeof value === 'string' ? value.trim() : '';
  if (info.length < min || info.length > max) throw new HttpError(400, label + ' must have ' + min + '–' + max + ' characters.');
  return info;
}

export function integer(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(400, label + ' must be a whole number from ' + min + ' to ' + max + '.');
  }
  return value;
}

function status(row, now = Date.now()) {
  if (row.status !== 'active') return row.status;
  if (row.ends_at <= now) return 'completed';
  return row.starts_at > now ? 'scheduled' : 'active';
}

function campaignView(row, actor) {
  return {
    id: row.id, title: row.title, description: row.description, sponsor: row.sponsor_name, pair: row.pair,
    chainId: row.chain_id, address: row.pool_address, base: row.base_symbol, quote: row.quote_symbol,
    schedule: row.schedule, benchmark: row.benchmark, periods: row.periods,
    size: row.order_size, maxBps: row.max_bps, target: row.target_pct, budget: row.budget_cents / 100,
    status: status(row), createdAt: row.created_at, startsAt: row.starts_at, endsAt: row.ends_at,
    mine: actor?.id === row.sponsor_id, proposalCount: row.proposal_count
  };
}

const SELECT = 'SELECT c.*, (SELECT count(*) FROM proposals p WHERE p.campaign_id = c.id) AS proposal_count FROM campaigns c';
const getCampaign = (db, id) => db.prepare(SELECT + ' WHERE c.id = ?').bind(id).first();

async function requiredCampaign(db, id) {
  const campaign = await getCampaign(db, id);
  if (!campaign) throw new HttpError(404, 'Request not found.');
  return campaign;
}

export async function listCampaigns(db, actor, before) {
  const query = db.prepare(SELECT + ' WHERE c.created_at < ? ORDER BY c.created_at DESC, c.id DESC LIMIT 101');
  const result = (await query.bind(before).all()).results;
  return {
    campaigns: result.slice(0, 100).map(row => campaignView(row, actor)),
    nextBefore: result.length > 100 ? result[99].created_at : null
  };
}

export async function createCampaign(db, actor, body, feeds) {
  const title = string(body.title, 'Title', 6, 90);
  const description = string(body.description, 'Requirements', 15, 2000);
  const chain = integer(body.chainId, 'Chain ID', 1, Number.MAX_SAFE_INTEGER);
  if (!ADDRESS.test(body.address)) throw new HttpError(400, 'Select a valid Metric pool.');
  const schedule = body.schedule;
  if (!['continuous', 'market_open'].includes(schedule)) throw new HttpError(400, 'Choose a measurement schedule.');
  const size = integer(body.size, 'Order size', 1, 10_000_000);
  const maxBps = integer(body.maxBps, 'Price tolerance', 1, 2000);
  const target = integer(body.target, 'Target pass rate', 1, 100);
  const periods = integer(body.periods, 'Duration', 1, 14);
  const budget = integer(body.budgetCents, 'Budget in cents', 1, 100_000_000);
  const row = await feeds.pool(chain, body.address);
  const catalog = chain === 4663 ? await feeds.assets() : new Map();
  const equity = feeds.equityPair(row, catalog);
  const benchmark = body.benchmark ?? (equity ? 'equity' : 'pool');
  if (!['equity', 'pool'].includes(benchmark)) throw new HttpError(400, 'Choose a supported benchmark.');
  if ((benchmark === 'equity' || schedule === 'market_open') && !equity) {
    throw new HttpError(400, 'The stock benchmark and market-open window require a verified Robinhood equity pool.');
  }
  if (benchmark === 'equity' && schedule !== 'market_open') {
    throw new HttpError(400, 'Use the market-open window with the independent stock benchmark.');
  }
  const pool = poolSummary(row, equity);
  const id = crypto.randomUUID();
  const result = await db.prepare(
    'INSERT INTO campaigns (id,sponsor_id,sponsor_name,title,description,chain_id,pool_address,pair,base_symbol,quote_symbol,benchmark,schedule,periods,order_size,max_bps,target_pct,budget_cents,created_at) ' +
    'SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM campaigns WHERE sponsor_id = ? AND status = ?) < 20'
  ).bind(id, actor.id, actor.name, title, description, chain, pool.address, pool.pair, pool.base, pool.quote,
    benchmark, schedule, periods, size, maxBps, target, budget, Date.now(), actor.id, 'open').run();
  if (!result.meta.changes) throw new HttpError(409, 'Close an open request before creating another.');
  return campaignView(await requiredCampaign(db, id), actor);
}

export async function detail(db, actor, id) {
  const row = await requiredCampaign(db, id);
  const [proposals, selected, schedule, observations] = await Promise.all([
    db.prepare('SELECT id,curator_id,curator_name,amount_cents,notes,created_at FROM proposals WHERE campaign_id = ? AND (curator_id = ? OR ? = ?) ORDER BY created_at DESC')
      .bind(id, actor?.id ?? '', actor?.id ?? '', row.sponsor_id).all(),
    row.selected_proposal
      ? db.prepare('SELECT curator_name, amount_cents FROM proposals WHERE campaign_id = ? AND id = ?').bind(id, row.selected_proposal).first()
      : null,
    db.prepare('SELECT starts_at AS "from", ends_at AS "to" FROM campaign_windows WHERE campaign_id = ? ORDER BY starts_at').bind(id).all(),
    db.prepare('SELECT outcome, count(*) AS count FROM samples WHERE campaign_id = ? GROUP BY outcome').bind(id).all()
  ]);
  const recent = await db.prepare('SELECT slot_at,observed_at,outcome,reading FROM samples WHERE campaign_id = ? ORDER BY slot_at DESC LIMIT 144').bind(id).all();
  const view = campaignView(row, actor);
  const buckets = Object.fromEntries(observations.results.map(({ outcome, count }) => [outcome, count]));
  const pass = buckets.pass ?? 0;
  const fail = buckets.fail ?? 0;
  const unavailable = buckets.unavailable ?? 0;
  const elapsed = slots(schedule.results, row.cancelled_at ?? Date.now());
  const missing = Math.max(0, elapsed - pass - fail - unavailable);
  return {
    ...view,
    curator: selected?.curator_name ?? null,
    acceptedBudget: selected ? selected.amount_cents / 100 : null,
    proposals: proposals.results.map(proposal => ({
      id: proposal.id, curator: proposal.curator_name, amount: proposal.amount_cents / 100,
      notes: proposal.notes, createdAt: proposal.created_at, selected: proposal.id === row.selected_proposal,
      mine: proposal.curator_id === actor?.id
    })),
    report: {
      windows: schedule.results,
      planned: slots(schedule.results), elapsed, pass, fail, unavailable, missing,
      passRate: elapsed ? 100 * pass / elapsed : null,
      samples: recent.results.map(sample => ({
        slotAt: sample.slot_at, observedAt: sample.observed_at, outcome: sample.outcome, ...JSON.parse(sample.reading)
      }))
    }
  };
}

export async function propose(db, actor, id, body) {
  const row = await requiredCampaign(db, id);
  const amount = integer(body.amountCents, 'Offer in cents', 1, row.budget_cents);
  const notes = string(body.notes, 'Proposal', 15, 2000);
  if (row.sponsor_id === actor.id) throw new HttpError(403, 'Sponsors cannot propose on their own request.');
  const result = await db.prepare(
    'INSERT OR IGNORE INTO proposals (id,campaign_id,curator_id,curator_name,amount_cents,notes,created_at) ' +
    "SELECT ?,id,?,?,?,?,? FROM campaigns WHERE id = ? AND status = 'open'"
  ).bind(crypto.randomUUID(), actor.id, actor.name, amount, notes, Date.now(), id).run();
  if (!result.meta.changes) throw new HttpError(409, 'This request is closed or you already submitted a proposal.');
}

export async function accept(db, actor, id, body, env) {
  const row = await requiredCampaign(db, id);
  if (row.sponsor_id !== actor.id) throw new HttpError(403, 'Only the sponsor can accept a proposal.');
  if (row.status !== 'open') throw new HttpError(409, 'This request is already closed.');
  const proposal = string(body.proposalId, 'Proposal ID', 36, 36);
  const windows = campaignWindows(row.schedule, row.periods, Date.now(), env.EXTRA_MARKET_CLOSURES);
  const started = windows[0].from;
  const statements = [db.prepare(
    "UPDATE campaigns SET status = 'active', selected_proposal = ?, starts_at = ?, ends_at = ? WHERE id = ? AND sponsor_id = ? AND status = 'open' " +
    'AND EXISTS (SELECT 1 FROM proposals WHERE campaign_id = ? AND id = ?)'
  ).bind(proposal, started, windows.at(-1).to, id, actor.id, id, proposal)];
  for (const window of windows) {
    statements.push(db.prepare(
      'INSERT OR IGNORE INTO campaign_windows (campaign_id,starts_at,ends_at) ' +
      "SELECT id,?,? FROM campaigns WHERE id = ? AND selected_proposal = ? AND starts_at = ? AND status = 'active'"
    ).bind(window.from, window.to, id, proposal, started));
  }
  const [result] = await db.batch(statements);
  if (!result.meta.changes) throw new HttpError(409, 'The proposal is unavailable or another proposal was already accepted.');
}

export async function cancel(db, actor, id) {
  const row = await requiredCampaign(db, id);
  if (row.sponsor_id !== actor.id) throw new HttpError(403, 'Only the sponsor can cancel this request.');
  const now = Date.now();
  const result = await db.prepare(
    "UPDATE campaigns SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND (status = 'open' OR (status = 'active' AND ends_at > ?))"
  ).bind(now, id, now).run();
  if (!result.meta.changes) throw new HttpError(409, 'This request is already closed.');
}

export function scoreObservation(snapshot, limit) {
  const { preview, midpoint: mid, metricStatus, reference } = snapshot;
  const benchmark = snapshot.benchmark ?? (reference ? 'equity' : 'pool');
  const comparable = benchmark === 'pool' || reference?.status === 'live';
  const buyBps = differenceBps(preview?.buy?.price, mid);
  const sellBps = differenceBps(preview?.sell?.price, mid);
  let outcome = 'unavailable';
  let reason = benchmark === 'equity' && reference?.status === 'closed' ? 'U.S. regular session closed' : 'Benchmark or quote unavailable';
  if (snapshot.metricAt && mid && preview && !['stale', 'unavailable'].includes(metricStatus) && comparable) {
    if (!preview?.buy?.complete || !preview?.sell?.complete) {
      outcome = 'fail';
      reason = 'Insufficient quoted depth';
    } else if (buyBps !== null && sellBps !== null) {
      outcome = Math.max(Math.abs(buyBps), Math.abs(sellBps)) <= limit ? 'pass' : 'fail';
      reason = outcome === 'pass' ? 'Both sides meet target' : 'Price tolerance exceeded';
    }
  }
  return {
    outcome, reason, buyBps, sellBps, benchmarkPrice: mid,
    buyPrice: preview?.buy?.price ?? null, sellPrice: preview?.sell?.price ?? null,
    referenceMidBps: snapshot.referenceMidBps ?? null, referenceStatus: reference?.status ?? null
  };
}

export async function sampleDue(db, feeds, now = Date.now(), extraClosures) {
  const slotAt = Math.floor(now / SAMPLE_MS) * SAMPLE_MS;
  const pending = (await db.prepare(
    "SELECT c.* FROM campaigns c JOIN campaign_windows w ON w.campaign_id = c.id WHERE c.status = 'active' AND w.starts_at <= ? AND w.ends_at > ? " +
    'AND NOT EXISTS (SELECT 1 FROM samples s WHERE s.campaign_id = c.id AND s.slot_at = ?) ORDER BY c.created_at LIMIT 20'
  ).bind(slotAt, now, slotAt).all()).results;
  let recorded = 0;
  for (let index = 0; index < pending.length; index += 2) {
    const group = await Promise.all(pending.slice(index, index + 2).map(async row => {
      const reading = await observeCampaign(row, feeds, extraClosures);
      const observed = Date.now();
      if (observed >= slotAt + SAMPLE_MS) return 0;
      const result = await db.prepare(
        'INSERT OR IGNORE INTO samples (campaign_id,slot_at,observed_at,outcome,reading) SELECT id,?,?,?,? FROM campaigns ' +
        "WHERE id = ? AND status = 'active'"
      ).bind(slotAt, observed, reading.outcome, JSON.stringify(reading), row.id).run();
      return result.meta.changes;
    }));
    recorded += group.reduce((sum, count) => sum + count, 0);
  }
  return { slotAt, recorded };
}

export async function observeCampaign(row, feeds, extraClosures) {
  try {
    const [pool, quotes, catalog] = await Promise.all([
      feeds.pool(row.chain_id, row.pool_address), feeds.prices(row.chain_id, [row.pool_address]),
      row.chain_id === 4663 ? feeds.assets().catch(() => new Map()) : new Map()
    ]);
    const equity = feeds.equityPair(pool, catalog);
    if (row.benchmark === 'equity' && !equity) return { outcome: 'unavailable', reason: 'Token mapping unavailable' };
    const snapshot = await feeds.readPool(pool, quotes.get(row.pool_address.toLowerCase()), equity, row.order_size,
      { benchmark: row.benchmark, extraClosures });
    return scoreObservation(snapshot, row.max_bps);
  } catch {
    return { outcome: 'unavailable', reason: 'Unable to read market data' };
  }
}
