import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from './api.js';
import { Feedback, PoolMark, number, timestamp } from './ui.jsx';

const DEFAULT_CHAIN = 4663;
const DEFAULT_SIZE = 5000;
const ADDRESS = /^0x[a-f\d]{40}$/i;
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

function DepthCell({ side, base, buy = false }) {
  if (!side) return <td className="muted">—</td>;
  return <td>
    <div className="depth-cell">
      <span>{side.price == null ? '—' : number(side.price, 6)}</span>
      <span className={side.complete ? 'data-accent' : 'muted'}>{number(Math.floor(side.coverage), 0)}% covered</span>
    </div>
    <div className="depth-track" aria-hidden="true"><span style={{ width: side.coverage + '%' }} /></div>
    <small className="depth-quantity">{number(buy ? side.received : side.paid, 8)} {base} · {side.bins} {side.bins === 1 ? 'bin' : 'bins'}</small>
  </td>;
}

function DepthStudy({ chainId, address }) {
  const [draft, setDraft] = useState(String(DEFAULT_SIZE));
  const [size, setSize] = useState(DEFAULT_SIZE);
  const result = useResource('/api/research/' + chainId + '/' + address + '?size=' + size, 20_000);
  const { pool, quote, sizes } = result.data ?? {};
  const hasQuote = quote?.bid != null || quote?.ask != null;
  function applySize(event) {
    event.preventDefault();
    const amount = Number(draft);
    if (Number.isInteger(amount) && amount >= 1 && amount <= 10_000_000) setSize(amount);
  }
  return <Feedback loading={result.loading} error={result.error} retry={result.reload}>
    {pool && <article className="depth-study" aria-label={pool.pair + ' quoted depth'}>
      <header className="depth-study-head">
        <div className="summary-pair"><PoolMark pool={pool} /><div><h3>{pool.pair}</h3><small>{pool.chain ?? 'Chain ' + pool.chainId}</small></div></div>
        <a className="text-link" href={'https://app.metric.xyz/pool/' + chainId + '/' + address}
          target="_blank" rel="noreferrer">Open on Metric</a>
      </header>
      <dl className="depth-quote">
        <div><dt>Metric bid</dt><dd>{number(quote.bid, 6)}</dd></div>
        <div><dt>Metric ask</dt><dd>{number(quote.ask, 6)}</dd></div>
        <div><dt>Quoted spread</dt><dd>{quote.spreadBps == null ? '—' : number(quote.spreadBps) + ' bps'}</dd></div>
      </dl>
      <form className="depth-size" onSubmit={applySize}>
        <label className="field">Order size ({pool.quote})
          <input type="number" min="1" max="10000000" step="1" required value={draft} onChange={event => setDraft(event.target.value)} />
        </label>
        <button className="button secondary" type="submit">Apply size</button>
      </form>
      <div className="table-scroll">
        <table className="depth-table" aria-label="Buy and sell estimates by order size">
          <thead><tr><th>Size ({pool.quote})</th><th>Buy estimate</th><th>Sell estimate</th></tr></thead>
          <tbody>{sizes.map(item => <tr className={item.amount === size ? 'depth-current' : ''} key={item.amount}>
            <th scope="row">{number(item.amount, 0)}</th>
            <DepthCell side={item.buy} base={pool.base} buy />
            <DepthCell side={item.sell} base={pool.base} />
          </tr>)}</tbody>
        </table>
      </div>
      <p className="research-note">
        {hasQuote ? 'Prices in ' + pool.quote + ' per ' + pool.base + '. Sizes can share a price when they fit in the same bin.'
          : quote.status === 'stale' ? 'The latest Metric quote is stale.' : 'A current Metric quote is unavailable.'}
        {quote.asOf && <span>Snapshot {timestamp(quote.asOf)}</span>}
      </p>
      <div className="button-row depth-actions">
        <Link className="button primary compact" to={'/requests/new?chain=' + chainId + '&pool=' + address + '&size=' + size}>Request liquidity</Link>
        {pool.equity && <Link className="text-link" to={'/rwa?pool=' + address}>Compare stock quote</Link>}
      </div>
    </article>}
  </Feedback>;
}

export default function PoolResearch() {
  const [selectedChain, setSelectedChain] = useState(null);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [search, setSearch] = useState('');
  const [offsets, setOffsets] = useState([0]);
  const chainCatalog = useResource('/api/chains');
  const chains = chainCatalog.data?.chains ?? [];
  const chainId = selectedChain ?? chains.find(chain => chain.id === DEFAULT_CHAIN)?.id ?? chains[0]?.id;
  const offset = offsets.at(-1);
  const catalog = useResource(chainId ? '/api/pools?chain=' + chainId + '&offset=' + offset : null);
  const pools = catalog.data?.pools ?? [];
  const query = search.trim().toLowerCase();
  const visible = pools.filter(pool => (pool.pair + ' ' + pool.address).toLowerCase().includes(query));
  const address = ADDRESS.test(query) ? query : visible.find(pool => pool.address === selectedAddress)?.address ?? visible[0]?.address;
  const nextOffset = catalog.data?.nextOffset;
  function changeChain(event) {
    setSelectedChain(Number(event.target.value));
    setSelectedAddress(null);
    setSearch('');
    setOffsets([0]);
  }
  return <section className="wrap overview-section" id="pool-research" aria-labelledby="pool-research-title">
    <header className="overview-heading">
      <div><h2 id="pool-research-title">Pool research</h2>
        <p>Compare quoted depth at different order sizes before setting a liquidity target.</p>
      </div>
      <a className="text-link" href="https://docs.metric.xyz/" target="_blank" rel="noreferrer">Metric data source</a>
    </header>
    <Feedback loading={chainCatalog.loading} error={chainCatalog.error} retry={chainCatalog.reload}
      empty={!chains.length && 'The Metric chain catalog is empty.'}>
      <div className="research-layout">
        <div className="research-catalog">
          <div className="research-filters">
            <label className="field">Network
              <select value={chainId} onChange={changeChain}>{chains.map(chain => <option value={chain.id} key={chain.id}>{chain.name}</option>)}</select>
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
                <button type="button" className="research-pool" aria-pressed={address === pool.address.toLowerCase()}
                  onClick={() => setSelectedAddress(pool.address)}>
                  <PoolMark pool={pool} />
                  <span>{pool.pair}</span>
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
        </div>
        <div className="research-detail">
          {address ? <DepthStudy key={chainId + ':' + address} chainId={chainId} address={address} />
            : <Feedback loading={catalog.loading} empty="Choose a pool to inspect its quoted depth." />}
        </div>
      </div>
    </Feedback>
  </section>;
}
