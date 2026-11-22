import { observeCampaign, sampleDue } from './campaigns.js';
import { SAMPLE_MS } from './schedule.js';

const MARKET = { chainId: 4663, address: '0x90cabda18279bbb3d935989af807b08b0e8cec61', pair: 'META/USDG', quote: 'USDG' };
const SIZE = 5000;
const MAX_BPS = 50;
const TARGET = 95;
const DAY = 24 * 60 * 60_000;
const slotOf = time => Math.floor(time / SAMPLE_MS) * SAMPLE_MS;

export async function sampleDepthAudit(db, feeds, extraClosures, clock = Date.now) {
  const slot = slotOf(clock());
  if (await db.prepare('SELECT slot_at FROM depth_audit_samples WHERE slot_at = ?').bind(slot).first()) return 0;
  const reading = await observeCampaign({
    chain_id: MARKET.chainId, pool_address: MARKET.address, order_size: SIZE, max_bps: MAX_BPS, benchmark: 'pool'
  }, feeds, extraClosures);
  const observedAt = clock();
  if (slotOf(observedAt) !== slot) return 0;
  const [stored] = await db.batch([
    db.prepare('INSERT OR IGNORE INTO depth_audit_samples (slot_at, observed_at, outcome, reading) VALUES (?, ?, ?, ?)')
      .bind(slot, observedAt, reading.outcome, JSON.stringify(reading)),
    db.prepare('DELETE FROM depth_audit_samples WHERE slot_at < ?').bind(slot - 2 * DAY)
  ]);
  return stored.meta.changes;
}

export async function collectDepth(env, feeds) {
  const campaigns = await sampleDue(env.DB, feeds, Date.now(), env.EXTRA_MARKET_CLOSURES);
  const auditRecorded = await sampleDepthAudit(env.DB, feeds, env.EXTRA_MARKET_CLOSURES);
  return { ...campaigns, auditRecorded };
}

export async function readDepthAudit(db, now = Date.now()) {
  const slot = slotOf(now);
  const from = slot - DAY + SAMPLE_MS;
  const [first, selected] = await Promise.all([
    db.prepare('SELECT MIN(slot_at) AS started_at FROM depth_audit_samples').first(),
    db.prepare('SELECT slot_at, observed_at, outcome, reading FROM depth_audit_samples WHERE slot_at BETWEEN ? AND ? ORDER BY slot_at DESC')
      .bind(from, slot).all()
  ]);
  const rows = selected.results;
  const start = Math.max(from, first.started_at ?? slot);
  const elapsed = Math.max(0, (slot - start) / SAMPLE_MS + Number(rows[0]?.slot_at === slot));
  const totals = { pass: 0, fail: 0, unavailable: 0 };
  for (const row of rows) totals[row.outcome] += 1;
  return {
    market: MARKET, size: SIZE, maxBps: MAX_BPS, target: TARGET, startedAt: first.started_at,
    report: {
      ...totals, elapsed, planned: elapsed, missing: Math.max(0, elapsed - rows.length),
      passRate: elapsed ? 100 * totals.pass / elapsed : null,
      samples: rows.slice(0, 36).map(row => ({
        ...JSON.parse(row.reading), slotAt: row.slot_at, observedAt: row.observed_at, outcome: row.outcome
      }))
    }
  };
}
