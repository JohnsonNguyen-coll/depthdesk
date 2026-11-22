import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from './api.js';
import { bps, Feedback, number, PanelHeading, PoolMark, SourceNote, Status, timestamp } from './ui.jsx';

function QuoteEstimates({ preview, base, quote }) {
  const sides = [
    { name: 'Buy', item: preview?.buy, input: quote, output: base },
    { name: 'Sell', item: preview?.sell, input: base, output: quote }
  ];
  return <section className="quote-estimates" aria-label="Trade estimates">
    <p className="quote-unit">Estimated price · {quote} per {base}</p>
    <dl className="quote-prices">
      {sides.map(({ name, item }) => <div key={name}>
        <dt>{name}</dt>
        <dd><strong>{number(item?.price, item?.price > 0 && item.price < 0.01 ? 8 : 4)}</strong>
          {item && !item.complete && <small className="warning">Partial fill</small>}</dd>
      </div>)}
    </dl>
    {sides.some(({ item }) => item) && <details className="data-disclosure">
      <summary>Fill details</summary>
      <table className="fill-table">
        <thead><tr><th scope="col">Side</th><th scope="col">Input</th><th scope="col">Output</th><th scope="col">Bins</th></tr></thead>
        <tbody>{sides.map(({ name, item, input, output }) => <tr key={name}>
          <th scope="row">{name}</th>
          <td>{item ? `${number(item.paid, 8)} ${input}` : '—'}</td>
          <td>{item ? `${number(item.received, 8)} ${output}` : '—'}</td>
          <td>{item?.bins ?? '—'}</td>
        </tr>)}</tbody>
      </table>
    </details>}
  </section>;
}

function QuoteDetail({ item, size, setSize, visibleSize, setVisibleSize }) {
  const { data, error, loading, reload } = useResource('/api/rwa/' + item.chainId + '/' + item.address + '?size=' + size, 20_000);
  const display = data?.score ?? item.score;
  const benchmarkValue = display.reference?.multiplier;
  const status = display.reference?.status ?? 'unavailable';
  return <aside className="panel surface-panel quote-detail" aria-label="Selected pool order depth">
    <PanelHeading title="Order depth" trailing={<button type="button" className="button secondary"
      aria-label="Refresh order depth" onClick={reload} disabled={loading}>Refresh</button>} />
    <div className="panel-body summary-content">
      <div className="summary-pair"><PoolMark pool={item} /><div><strong>{item.pair}</strong><small>{item.chain}</small></div></div>
      <form className="quote-size" onSubmit={event => { event.preventDefault(); setSize(Number(visibleSize)); }}>
        <label className="field">Order size ({item.quote})<input type="number" value={visibleSize} min="1" max="10000000" required
          onChange={event => setVisibleSize(event.target.value)} /></label>
        <button className="button secondary" type="submit">Apply</button>
      </form>
      <div className="button-row quote-presets" role="group" aria-label="Preset order sizes">
        {[1000, 5000, 10000].map(amount => <button key={amount} type="button" className="button secondary compact"
          aria-pressed={amount === size} onClick={() => { setVisibleSize(String(amount)); setSize(amount); }}>
          {number(amount, 0)}
        </button>)}
      </div>
      <Feedback loading={loading} error={error} retry={reload}>
        <QuoteEstimates preview={data?.score.preview} base={item.base} quote={item.quote} />
      </Feedback>
      <div className="quote-reference"><span>Stock reference</span><Status value={status} /></div>
      <details className="data-disclosure">
        <summary>Reference and timestamps</summary>
        <dl className="source-data">
          <div><dt>Metric bid / ask</dt><dd>{number(display.metric?.bid, 4)} / {number(display.metric?.ask, 4)}</dd></div>
          <div><dt>Stock bid / ask</dt><dd>{number(display.reference?.bid, 4)} / {number(display.reference?.ask, 4)}</dd></div>
          <div><dt>Bid / ask gap</dt><dd>{bps(display.sellBps)} / {bps(display.buyBps)}</dd></div>
          <div><dt>Metric snapshot</dt><dd>{timestamp(display.metricAt)}</dd></div>
          <div><dt>Robinhood reference</dt><dd>{timestamp(display.reference?.asOf)}</dd></div>
          {benchmarkValue && <div><dt>Shares per token</dt><dd>{number(benchmarkValue, 10)}</dd></div>}
        </dl>
      </details>
      {status === 'closed' && <p>Stock comparisons resume during U.S. market hours.</p>}
      {status !== 'live' && status !== 'closed' && <p>Stock comparisons require a current reference quote.</p>}
      <div className="quote-actions">
        <Link className="button primary" to={'/depth-lab?chain=' + item.chainId + '&pool=' + item.address + '&size=' + size}>Compare sizes in Depth Lab</Link>
        <Link className="button secondary" to={'/requests/new?chain=' + item.chainId + '&pool=' + item.address + '&size=' + size}>Request liquidity</Link>
        <a className="button secondary" href={'https://app.metric.xyz/pool/' + item.chainId + '/' + item.address} target="_blank" rel="noreferrer">View on Metric</a>
      </div>
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
      <div><h1>RWA Quotes</h1>
        <p>Compare Metric’s buy and sell quotes with the underlying stock, in the same units.</p></div>
      <button className="button secondary" type="button" onClick={reload} disabled={loading}>Refresh quotes</button>
    </div>
    <div className="quote-layout">
      <section className="panel board surface-panel" aria-label="Tokenized equities">
        <div className="toolbar">
          <span className="network-label">Robinhood Chain</span>
          <label className="search-field"><input value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search equities" aria-label="Search equities" /></label>
        </div>
        <Feedback loading={loading} error={error} retry={reload}
          empty={!visible.length && (markets.length ? 'No equities match your search.' : 'No verified equity pools are currently available.')}>
          <div className="table-scroll">
            <table className="list-table quotes-table">
              <thead><tr><th scope="col">Pool</th><th scope="col">Metric bid / ask</th><th scope="col" className="quote-wide">Stock bid / ask</th><th scope="col" className="quote-wide">Bid / ask gap</th><th scope="col">Stock reference</th></tr></thead>
              <tbody>{visible.map(item => <tr key={item.address} className={selected?.address === item.address ? 'selected-row' : ''}>
                <th scope="row"><button className="table-link" aria-pressed={selected?.address === item.address}
                  type="button" onClick={() => setParams({ pool: item.address }, { replace: true })}>
                  <PoolMark pool={item} /><span>{item.base}<small>{item.quote}</small></span>
                </button></th>
                <td className="numeric"><div>{number(item.score.metric.bid, 4)}</div><div className="muted">{number(item.score.metric.ask, 4)}</div></td>
                <td className="numeric quote-wide"><div>{number(item.score.reference?.bid, 4)}</div><div className="muted">{number(item.score.reference?.ask, 4)}</div></td>
                <td className="numeric quote-wide"><div>{bps(item.score.sellBps)}</div><div className="muted">{bps(item.score.buyBps)}</div></td>
                <td><Status value={item.score.reference?.status ?? 'unavailable'} /></td>
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
