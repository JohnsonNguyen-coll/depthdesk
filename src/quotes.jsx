import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, BarChart3, CircleDot, RefreshCcw, Search } from 'lucide-react';
import { useResource } from './api.js';
import { AssetMark, bps, Feedback, number, PanelHeading, SourceNote, Status, timestamp } from './ui.jsx';

function quoteState(item) {
  const { metric, reference } = item.score;
  if (!metric.bid && !metric.ask) return item.score.metricStatus === 'stale' ? 'stale' : 'unavailable';
  return reference?.status ?? 'unavailable';
}

function Estimate({ name, item, base, quote }) {
  return <div className="estimate">
    <span>{name}</span>
    {item?.price ? <><strong>{number(item.price, 4)}</strong><small>{quote} per {base} · {item.bins} {item.bins === 1 ? 'bin' : 'bins'}</small>
      {!item.complete && <small className="warning">Partial depth</small>}</> : <strong>—</strong>}
  </div>;
}

function QuoteDetail({ item, size, setSize, visibleSize, setVisibleSize }) {
  const { data, error, loading, reload } = useResource('/api/rwa/' + item.chainId + '/' + item.address + '?size=' + size, 20_000);
  const display = data?.score ?? item.score;
  const benchmarkValue = display.reference?.multiplier;
  const status = display.reference?.status ?? 'unavailable';
  return <aside className="panel quote-detail">
    <PanelHeading icon={BarChart3} title="Inspect order depth" trailing={<button type="button" className="icon-button"
      title="Refresh order depth" aria-label="Refresh order depth" onClick={reload}><RefreshCcw size={17} /></button>} />
    <div className="panel-body summary-content">
      <div className="summary-pair"><AssetMark symbol={item.base} /><div><strong>{item.pair}</strong><small>{item.chain}</small></div></div>
      <form className="quote-size" onSubmit={event => { event.preventDefault(); setSize(Number(visibleSize)); }}>
        <label className="field">Order size ({item.quote})<input type="number" value={visibleSize} min="1" max="10000000" required
          onChange={event => setVisibleSize(event.target.value)} /></label>
        <button className="button secondary" type="submit">Apply</button>
      </form>
      <Feedback loading={loading} error={error} retry={reload}>
        <div className="estimates">
          <Estimate name="Buy estimate" item={data?.score.preview?.buy} base={item.base} quote={item.quote} />
          <Estimate name="Sell estimate" item={data?.score.preview?.sell} base={item.base} quote={item.quote} />
        </div>
      </Feedback>
      <dl className="source-data">
        <div><dt>Metric snapshot</dt><dd>{timestamp(display.metricAt)}</dd></div>
        <div><dt>Robinhood reference</dt><dd>{timestamp(display.reference?.asOf)}</dd></div>
        {benchmarkValue && <div><dt>Shares per token</dt><dd>{number(benchmarkValue, 10)}</dd></div>}
        <div><dt>Reference status</dt><dd><Status value={status} /></dd></div>
      </dl>
      {status !== 'live' && <p>Reference comparison is unavailable until a current stock quote is published.</p>}
      <Link className="button primary full-width" to={'/requests/new?chain=' + item.chainId + '&pool=' + item.address + '&size=' + size}>Request liquidity for this pool</Link>
      <a className="text-link" href={'https://app.metric.xyz/pool/' + item.chainId + '/' + item.address} target="_blank" rel="noreferrer">View on Metric</a>
    </div>
  </aside>;
}

export default function QuoteMonitor() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [size, setSize] = useState(5000);
  const [visibleSize, setVisibleSize] = useState('5000');
  const { data, loading, error, reload } = useResource('/api/rwa/quotes', 20_000);
  const markets = data?.markets ?? [];
  const visible = markets.filter(item => (item.pair + ' ' + item.name).toLowerCase().includes(search.trim().toLowerCase()));
  const selected = visible.find(item => item.address.toLowerCase() === params.get('pool')?.toLowerCase()) ?? visible[0];
  return <div className="wrap page">
    <div className="page-heading with-action">
      <div><span className="section-label"><Activity size={16} /> Tokenized equities</span><h1>RWA Quotes</h1>
        <p>Compare Metric’s buy and sell quotes with the underlying stock, in the same units.</p></div>
      <button className="button secondary" type="button" onClick={reload}><RefreshCcw size={17} />Refresh quotes</button>
    </div>
    <div className="quote-layout">
      <section className="panel board">
        <div className="toolbar">
          <span className="network-label"><CircleDot size={15} />Robinhood Chain</span>
          <label className="search-field"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search equities" aria-label="Search equities" /></label>
        </div>
        <Feedback loading={loading} error={error} retry={reload}
          empty={!visible.length && (markets.length ? 'No equities match your search.' : 'No verified equity pools are currently available.')}>
          <div className="table-scroll">
            <table className="list-table quotes-table">
              <thead><tr><th scope="col">Pool</th><th scope="col">Metric bid / ask</th><th scope="col">Stock bid / ask</th><th scope="col">Bid / ask gap</th><th scope="col">Status</th></tr></thead>
              <tbody>{visible.map(item => <tr key={item.address} className={selected?.address === item.address ? 'selected-row' : ''}>
                <th scope="row"><button className="table-link" aria-pressed={selected?.address === item.address}
                  type="button" onClick={() => setParams({ pool: item.address }, { replace: true })}>
                  <AssetMark symbol={item.base} /><span>{item.base}<small>{item.quote}</small></span>
                </button></th>
                <td className="numeric"><div>{number(item.score.metric.bid, 4)}</div><div className="muted">{number(item.score.metric.ask, 4)}</div></td>
                <td className="numeric"><div>{number(item.score.reference?.bid, 4)}</div><div className="muted">{number(item.score.reference?.ask, 4)}</div></td>
                <td className="numeric"><div>{bps(item.score.sellBps)}</div><div className="muted">{bps(item.score.buyBps)}</div></td>
                <td><Status value={quoteState(item)} /></td>
              </tr>)}</tbody>
            </table>
          </div>
        </Feedback>
        <div className="panel-footer quote-foot"><span>Prices in USDG per token. Stock quotes are adjusted for token units.</span><SourceNote /></div>
      </section>
      {selected && <QuoteDetail key={selected.address} item={selected} size={size} setSize={setSize} visibleSize={visibleSize} setVisibleSize={setVisibleSize} />}
    </div>
  </div>;
}
