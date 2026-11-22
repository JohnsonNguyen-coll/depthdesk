import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from './api.js';
import { Feedback, PoolMark, names, number, timestamp } from './ui.jsx';

const DEFAULT_CHAIN = 4663;
const DEFAULT_SIZE = 5000;
const DEFAULT_BPS = 50;
const ADDRESS = /^0x[a-f\d]{40}$/i;
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const shortAddress = address => address.slice(0, 6) + '…' + address.slice(-4);

function bounded(value, max, fallback) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 && n <= max ? n : fallback;
}

function evaluateSize(row, mid, tolerance) {
  const buyBps = mid && row.buy?.price != null ? (row.buy.price / mid - 1) * 10000 : null;
  const sellBps = mid && row.sell?.price != null ? (1 - row.sell.price / mid) * 10000 : null;
  let status;
  if (!row.buy || !row.sell) status = 'Unavailable';
  else if (!row.buy.complete || !row.sell.complete) status = 'Partial fill';
  else if (buyBps == null || sellBps == null) status = 'Unavailable';
  else status = Math.max(Math.abs(buyBps), Math.abs(sellBps)) <= tolerance + 1e-9 ? 'Within tolerance' : 'Outside tolerance';
  return { ...row, buyBps, sellBps, status };
}

function exportScenarios(pool, quote, mid, tolerance, scenarios) {
  const rows = [
    ['Pool', 'Chain ID', 'Pool address', 'Snapshot UTC', 'Quote token', 'Pool midpoint', 'Order size', 'Tolerance (bps)',
      'Buy price', 'Buy cost (bps)', 'Buy fill (%)', 'Sell price', 'Sell cost (bps)', 'Sell fill (%)', 'Result'],
    ...scenarios.map(row => [pool.pair, pool.chainId, pool.address, new Date(quote.asOf).toISOString(), pool.quote, mid,
      row.amount, tolerance, row.buy?.price, row.buyBps, row.buy?.coverage, row.sell?.price, row.sellBps, row.sell?.coverage, row.status])
  ];
  const csv = rows.map(row => row.map(value => {
    if (value == null) return '';
    if (typeof value === 'number') return value;
    const safe = /^\s*[=+@\-]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'depthdesk-' + pool.chainId + '-' + pool.address.slice(0, 10) + '.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DepthCell({ side, impact }) {
  const price = side?.price;
  const coverage = fillCoverage(side);
  return <td className="numeric">
    <span>{number(price, price > 0 && price < 0.01 ? 8 : 4)}</span>
    {impact != null && <small>{number(impact) + ' bps'}</small>}
    {side && <div className={side.complete ? 'depth-meter' : 'depth-meter partial'} role="meter" aria-label="Order coverage"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={coverage} aria-valuetext={coverage + '% covered'}
      title={coverage + '% covered'}><span style={{ width: coverage + '%' }} /></div>}
  </td>;
}

function fillCoverage(side) {
  if (!side) return 0;
  return side.complete ? 100 : Math.min(99.9, Math.floor(side.coverage * 10) / 10);
}

function FillCell({ side, base, buy = false }) {
  if (!side) return <td className="muted">—</td>;
  return <td className="numeric">
    <span>{number(fillCoverage(side), 1)}% covered</span>
    <small>{number(buy ? side.received : side.paid, 8)} {base} · {side.bins} {side.bins === 1 ? 'bin' : 'bins'}</small>
  </td>;
}

function DepthStudy({ chainId, address, size, tolerance, update }) {
  const result = useResource('/api/research/' + chainId + '/' + address + '?size=' + size, 20_000);
  const { pool, quote, sizes } = result.data ?? {};
  const hasQuote = quote?.bid != null || quote?.ask != null;
  const mid = quote?.bid > 0 && quote.ask >= quote.bid ? (quote.ask + quote.bid) / 2 : null;
  const scenarios = sizes?.map(row => evaluateSize(row, mid, tolerance)) ?? [];
  const largest = scenarios.findLast(row => row.status === 'Within tolerance');
  const hasDepth = scenarios.some(row => row.buy || row.sell);
  function applySettings(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    update({ chain: chainId, pool: address, size: data.get('size'), bps: data.get('bps') });
  }
  return <Feedback loading={result.loading} error={result.error} retry={result.reload}>
    {pool && <article className="depth-study" aria-label={pool.pair + ' quoted depth'}>
      <header className="depth-study-head">
        <div className="summary-pair"><PoolMark pool={pool} /><div><h3>{pool.pair}</h3><small>{pool.chain ?? 'Chain ' + pool.chainId} · {shortAddress(pool.address)}</small></div></div>
        <a className="button secondary" href={'https://app.metric.xyz/pool/' + chainId + '/' + address}
          target="_blank" rel="noreferrer">Open on Metric</a>
      </header>
      <dl className="depth-quote">
        <div><dt>Metric bid</dt><dd>{number(quote.bid, 6)}</dd></div>
        <div><dt>Metric ask</dt><dd>{number(quote.ask, 6)}</dd></div>
        <div><dt>Quoted spread</dt><dd>{quote.spreadBps == null ? '—' : number(quote.spreadBps) + ' bps'}</dd></div>
      </dl>
      <form className="depth-size" onSubmit={applySettings} key={size + ':' + tolerance}>
        <label className="field">Order size ({pool.quote})
          <input name="size" type="number" min="1" max="10000000" step="1" required defaultValue={size} />
        </label>
        <label className="field">Tolerance (bps)
          <input name="bps" type="number" min="1" max="2000" step="1" required defaultValue={tolerance} />
        </label>
        <button className="button primary" type="submit">Apply</button>
      </form>
      <div className="depth-result" aria-live="polite">
        <div><span>Largest tested size within {tolerance} bps</span>
          <strong>{largest ? number(largest.amount, 0) + ' ' + pool.quote : hasDepth ? 'No passing size' : 'Depth unavailable'}</strong></div>
        <button className="button secondary" type="button" disabled={!hasDepth || !quote.asOf}
          onClick={() => exportScenarios(pool, quote, mid, tolerance, scenarios)}>Export CSV</button>
      </div>
      <div className="table-scroll">
        <table className="depth-table" aria-label="Buy and sell estimates by order size">
          <thead><tr><th scope="col">Size ({pool.quote})</th><th scope="col">Buy</th><th scope="col">Sell</th><th scope="col">Result</th></tr></thead>
          <tbody>{scenarios.map(item => <tr className={item.amount === size ? 'depth-current' : ''} key={item.amount}>
            <th scope="row">{number(item.amount, 0)}</th>
            <DepthCell side={item.buy} impact={item.buyBps} />
            <DepthCell side={item.sell} impact={item.sellBps} />
            <td className={item.status === 'Partial fill' || item.status === 'Outside tolerance' ? 'depth-caution' : 'muted'}>
              {item.status === 'Within tolerance' ? 'Pass' : item.status === 'Outside tolerance' ? 'Outside limit' : item.status}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      {hasDepth && <details className="data-disclosure depth-fill-details">
        <summary>Fill details</summary>
        <div className="table-scroll"><table className="depth-table depth-fill-table">
          <thead><tr><th scope="col">Size ({pool.quote})</th><th scope="col">Buy fill</th><th scope="col">Sell fill</th></tr></thead>
          <tbody>{scenarios.map(item => <tr key={item.amount}>
            <th scope="row">{number(item.amount, 0)}</th>
            <FillCell side={item.buy} base={pool.base} buy />
            <FillCell side={item.sell} base={pool.base} />
          </tr>)}</tbody>
        </table></div>
      </details>}
      <p className="research-note">
        {hasQuote ? pool.quote + ' per ' + pool.base + ' · bps from the pool midpoint. Both sides must fill within the limit to pass.'
          : quote.status === 'stale' ? 'The latest Metric quote is stale.' : 'A current Metric quote is unavailable.'}
        {quote.asOf && <span>Snapshot {timestamp(quote.asOf)}</span>}
      </p>
      <div className="button-row depth-actions">
        <Link className="button secondary" to={'/requests/new?chain=' + chainId + '&pool=' + address + '&size=' + size + '&bps=' + tolerance}>Request liquidity</Link>
        {pool.equity && <Link className="button secondary" to={'/rwa?pool=' + address}>Compare stock quote</Link>}
      </div>
    </article>}
  </Feedback>;
}

export default function DepthLab() {
  const [params, setParams] = useSearchParams();
  const selectedChain = bounded(params.get('chain'), Number.MAX_SAFE_INTEGER, null);
  const selectedAddress = params.get('pool');
  const size = bounded(params.get('size'), 10_000_000, DEFAULT_SIZE);
  const tolerance = bounded(params.get('bps'), 2000, DEFAULT_BPS);
  const [search, setSearch] = useState('');
  const [offsets, setOffsets] = useState([0]);
  const chainCatalog = useResource('/api/chains');
  const chains = chainCatalog.data?.chains ?? [];
  const chainId = chains.find(chain => chain.id === selectedChain)?.id
    ?? chains.find(chain => chain.id === DEFAULT_CHAIN)?.id ?? chains[0]?.id;
  const offset = offsets.at(-1);
  const catalog = useResource(chainId ? '/api/pools?chain=' + chainId + '&offset=' + offset : null);
  const pools = catalog.data?.pools ?? [];
  const query = search.trim().toLowerCase();
  const visible = pools.filter(pool => (pool.pair + ' ' + pool.address).toLowerCase().includes(query));
  const address = ADDRESS.test(query) ? query : ADDRESS.test(selectedAddress) ? selectedAddress : visible[0]?.address;
  const nextOffset = catalog.data?.nextOffset;
  function update(entries) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(entries)) {
      if (value == null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }
  function changeChain(event) {
    update({ chain: event.target.value, pool: null });
    setSearch('');
    setOffsets([0]);
  }
  return <div className="wrap page depth-lab" id="pool-research">
    <header className="page-heading with-action">
      <div><h1>Depth Lab</h1>
        <p>See how much a Metric pool can quote within your price tolerance. Buy and sell estimates use the same order-book snapshot.</p>
      </div>
      <Link className="button secondary" to="/depth-audit">Open live audit</Link>
    </header>
    <Feedback loading={chainCatalog.loading} error={chainCatalog.error} retry={chainCatalog.reload}
      empty={!chains.length && 'The Metric chain catalog is empty.'}>
      <div className="research-layout">
        <section className="research-catalog surface-panel" aria-label="Metric pool catalog">
          <div className="research-filters">
            <label className="field">Network
              <select value={chainId} onChange={changeChain}>{chains.map(chain => <option value={chain.id} key={chain.id}>{names[chain.id] ?? chain.name}</option>)}</select>
            </label>
            <label className="field">Find a pool
              <input type="search" placeholder="Pair or address" value={search} onChange={event => setSearch(event.target.value)} />
            </label>
          </div>
          <div className="research-columns"><span>Metric pool</span><span>24h volume</span></div>
          <Feedback loading={catalog.loading} error={catalog.error} retry={catalog.reload}
            empty={!visible.length && (ADDRESS.test(query) ? 'Looking up this address directly.' : 'No pools match this filter.')}>
            <ul className="research-pools">
              {visible.map(pool => <li key={pool.address}>
                <button type="button" className="research-pool" aria-pressed={address?.toLowerCase() === pool.address.toLowerCase()}
                  onClick={() => update({ chain: chainId, pool: pool.address })}>
                  <PoolMark pool={pool} />
                  <span>{pool.pair}<small className="research-address">{shortAddress(pool.address)}</small></span>
                  <span className="research-volume">{pool.volume24h == null ? '—' : compact.format(pool.volume24h)}</span>
                </button>
              </li>)}
            </ul>
          </Feedback>
          {!catalog.loading && (offsets.length > 1 || (Number.isInteger(nextOffset) && nextOffset > offset)) &&
            <div className="research-pagination">
              <button className="button secondary compact" type="button" disabled={offsets.length < 2}
                onClick={() => setOffsets(previous => previous.slice(0, -1))}>Previous</button>
              <button className="button secondary compact" type="button" disabled={!(Number.isInteger(nextOffset) && nextOffset > offset)}
                onClick={() => setOffsets(previous => [...previous, nextOffset])}>More pools</button>
            </div>}
          <p className="source-note"><a href="https://docs.metric.xyz/reference/api" target="_blank" rel="noreferrer">Metric API</a></p>
        </section>
        <div className="research-detail">
          {address ? <DepthStudy key={chainId + ':' + address} chainId={chainId} address={address} size={size} tolerance={tolerance} update={update} />
            : <Feedback loading={catalog.loading} empty="Choose a pool to inspect its quoted depth." />}
        </div>
      </div>
    </Feedback>
  </div>;
}
