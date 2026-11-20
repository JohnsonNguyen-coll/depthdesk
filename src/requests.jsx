import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarDays, ClipboardList, Copy, Crosshair, Handshake, Plus, Search, Waves } from 'lucide-react';
import { read, useAction, useResource, write } from './api.js';
import { AssetMark, bps, ErrorText, Feedback, money, names, number, PanelHeading, SignIn, Status, timestamp } from './ui.jsx';

const filters = ['all', 'open', 'scheduled', 'active', 'completed', 'cancelled'];
const filtersLabel = { all: 'All requests', open: 'Open', scheduled: 'Scheduled', active: 'Measuring', completed: 'Completed', cancelled: 'Cancelled' };
const shortAddress = value => value.slice(0, 6) + '…' + value.slice(-4);
const usdCents = value => Math.round(Number(value) * 100);
const FIELD_HELP = 'Fill the target order size in both directions within the price tolerance.';

export function RequestBoard() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [earlier, setEarlier] = useState([]);
  const [cursor, setCursor] = useState(null);
  const { data, loading, error, reload } = useResource('/api/requests', 30_000);
  const next = cursor ?? data?.nextBefore;
  const pagination = useAction();
  const campaigns = [...(data?.campaigns ?? []), ...earlier];
  const visible = [...new Map(campaigns.map(item => [item.id, item])).values()].filter(item =>
    (filter === 'all' || filter === item.status) &&
    (item.title + ' ' + item.pair + ' ' + item.sponsor).toLowerCase().includes(search.trim().toLowerCase()));
  const loadEarlier = () => pagination.submit(async () => {
    const result = await read('/api/requests?before=' + next);
    setEarlier(items => [...items, ...result.campaigns]);
    setCursor(result.nextBefore ?? 0);
  });
  return <div className="wrap page">
    <div className="page-heading with-action">
      <div><span className="section-label"><Waves size={16} /> Liquidity desk</span><h1>Market requests</h1>
        <p>Find campaigns to curate, or commission liquidity for a Metric pool.</p></div>
      <Link className="button primary" to="/requests/new"><Plus size={18} />Create request</Link>
    </div>
    <section className="panel board" aria-label="Market requests">
      <div className="toolbar">
        <div className="segmented" aria-label="Request status">
          {filters.map(value => <button key={value} type="button" aria-pressed={value === filter}
            onClick={() => setFilter(value)}>{filtersLabel[value]}</button>)}
        </div>
        <label className="search-field"><Search size={17} /><input aria-label="Search requests" placeholder="Search requests" value={search} onChange={event => setSearch(event.target.value)} /></label>
      </div>
      <Feedback loading={loading} error={error} retry={reload}
        empty={!visible.length && (campaigns.length ? 'No requests match these filters.' : 'No liquidity requests have been posted yet.')}>
        {!visible.length ? (!campaigns.length && <Link className="button secondary" to="/requests/new">Create the first request</Link>) :
          <div className="table-scroll"><table className="list-table">
            <thead><tr><th>Request</th><th>Network</th><th>Order size</th><th>Budget</th><th>Status</th></tr></thead>
            <tbody>{visible.map(item => <tr key={item.id}>
              <th scope="row"><Link to={'/requests/' + item.id} className="table-link">
                <AssetMark symbol={item.base} /><span>{item.title}<small>{item.pair} · {item.sponsor}</small></span>
              </Link></th>
              <td>{names[item.chainId] ?? item.chainId}</td><td className="numeric">{number(item.size, 0)} {item.quote}</td>
              <td className="numeric">{money(item.budget)}</td><td><Status value={item.status} /></td>
            </tr>)}</tbody>
          </table></div>}
      </Feedback>
      <ErrorText error={pagination.error} />
      {Boolean(next) && <div className="panel-footer"><button type="button" onClick={loadEarlier}
        disabled={pagination.saving} className="button secondary">Load more requests</button></div>}
    </section>
  </div>;
}

export function RequestForm() {
  const [params] = useSearchParams();
  const [chain, setChain] = useState(params.get('chain') ?? '4663');
  const [address, setAddress] = useState(params.get('pool') ?? '');
  const [schedule, setSchedule] = useState('continuous');
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState(params.has('pool') ? 'address' : 'catalog');
  const [validated, setValidated] = useState(params.get('pool') ?? '');
  const chains = useResource('/api/chains');
  const pools = useResource(mode === 'catalog' ? '/api/pools?chain=' + chain + '&offset=' + offset : null);
  const pool = useResource(validated ? '/api/pools/' + chain + '/' + validated : null);
  const session = useResource('/api/session');
  const action = useAction();
  const navigate = useNavigate();
  const chosen = pool.data?.pool ?? pools.data?.pools?.find(item => item.address === address);
  const choices = chains.data?.chains ?? [];
  const marketOpen = schedule === 'market_open' && chosen?.equity;
  const user = session.data?.user;

  function chooseNetwork(event) {
    setChain(event.target.value);
    setAddress('');
    setValidated('');
    setOffset(0);
    setSchedule('continuous');
  }

  function setPool(value) {
    setAddress(value);
    setValidated(mode === 'catalog' ? value : '');
    setSchedule('continuous');
  }

  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return action.submit(async () => {
      const created = await write('/api/requests', {
        title: form.get('title'), description: form.get('description'), chainId: Number(chain),
        address: chosen.address, schedule: marketOpen ? 'market_open' : 'continuous',
        periods: Number(form.get('periods')), size: Number(form.get('size')), maxBps: Number(form.get('maxBps')),
        target: Number(form.get('target')), budgetCents: usdCents(form.get('budget'))
      });
      navigate('/requests/' + created.id);
    });
  }

  return <div className="wrap page">
    <Link className="back-link" to="/requests">Market requests</Link>
    <div className="page-heading"><span className="section-label"><ClipboardList size={16} /> Sponsor a pool</span>
      <h1>Create request</h1><p>Give curators a target they can price and a result you can measure.</p></div>
    <div className="detail-layout">
      <form className="panel form-panel" onSubmit={submit}>
        <PanelHeading icon={Crosshair} title="Campaign terms" />
        <div className="panel-body form-grid">
          <label className="field full">Request title<input name="title" minLength={6} maxLength={90} required placeholder="e.g. Two-sided liquidity for NVDA" /></label>
          <label className="field full">Requirements<textarea name="description" minLength={15} maxLength={2000} rows={4} required
            placeholder="What should the curator maintain? Include any execution or reporting requirements." /></label>
          <label className="field">Network<select value={chain} onChange={chooseNetwork}>
            {!choices.some(option => String(option.id) === chain) && <option value={chain}>{names[chain] ?? 'Chain ' + chain}</option>}
            {choices.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select></label>
          <div className="field">
            <div className="field-label"><label htmlFor="pool-picker">Metric pool</label><button type="button" className="text-link"
              onClick={() => { setMode(value => value === 'catalog' ? 'address' : 'catalog'); setAddress(''); setValidated(''); setOffset(0); }}>
              {mode === 'catalog' ? 'Enter address' : 'Browse pools'}
            </button></div>
            {mode === 'catalog' ?
              <select id="pool-picker" required value={address} onChange={event => setPool(event.target.value)}>
                <option value="">{pools.loading ? 'Loading pools…' : 'Select a pool'}</option>
                {pools.data?.pools?.map(item => <option key={item.address} value={item.address}>{item.pair} · {shortAddress(item.address)}</option>)}
              </select> :
              <div className="inline-field"><input id="pool-picker" required value={address} onChange={event => setPool(event.target.value)} placeholder="0x…" />
                <button type="button" className="button secondary compact" disabled={!/^0x[0-9a-f]{40}$/i.test(address) || pool.loading}
                  onClick={() => { setValidated(address); pool.reload(); }}>Verify</button></div>}
            {mode === 'catalog' && Boolean(pools.data?.nextOffset || offset) && <div className="pagination">
              {offset > 0 && <button type="button" className="text-link" onClick={() => { setOffset(Math.max(0, offset - 100)); setPool(''); }}>Previous pools</button>}
              {pools.data?.nextOffset && <button type="button" className="text-link" onClick={() => { setOffset(pools.data.nextOffset); setPool(''); }}>More pools</button>}
            </div>}
          </div>
          <ErrorText error={pool.error ?? pools.error} />
          <label className="field">Measurement window<select value={marketOpen ? 'market_open' : 'continuous'} onChange={event => setSchedule(event.target.value)}>
            <option value="continuous">Continuous</option><option value="market_open" disabled={!chosen?.equity}>U.S. market open</option>
          </select></label>
          <label className="field">Duration ({marketOpen ? 'sessions' : 'days'})<input name="periods" type="number" min="1" max="14" defaultValue="7" required /></label>
          <label className="field">Order size ({chosen?.quote ?? 'quote token'})<input name="size" type="number" min="1" max="10000000"
            defaultValue={params.get('size') ?? '5000'} required /></label>
          <label className="field">Price tolerance (bps)<input name="maxBps" type="number" min="1" max="2000" defaultValue="50" required /></label>
          <label className="field">Target pass rate (%)<input name="target" type="number" min="1" max="100" defaultValue="95" required /></label>
          <label className="field">Maximum budget (USD)<input name="budget" type="number" min="0.01" max="1000000" step="0.01" placeholder="0.00" required /></label>
        </div>
        <div className="panel-footer form-actions">
          <ErrorText error={action.error ?? session.error} />
          {user ? <button className="button primary" type="submit" disabled={!chosen || action.saving}>{action.saving ? 'Posting…' : 'Publish request'}</button>
            : !session.loading && !session.error && <SignIn>Sign in to publish</SignIn>}
        </div>
      </form>
      <aside className="panel summary-panel">
        <PanelHeading icon={CalendarDays} title="Measurement" />
        <div className="panel-body summary-content">
          <div className="summary-pair"><AssetMark symbol={chosen?.base} /><div><strong>{chosen?.pair ?? 'Select a pool'}</strong>
            <small>{chosen?.chain ?? names[chain] ?? 'Metric'}</small></div></div>
          <dl><div><dt>Benchmark</dt><dd>{chosen?.equity ? 'Robinhood stock quote, adjusted for token units' : 'Metric pool bid/ask midpoint'}</dd></div>
            <div><dt>Schedule</dt><dd>{marketOpen ? 'First 30 minutes of each U.S. equity session' : 'Every five minutes after acceptance'}</dd></div></dl>
          <p>{FIELD_HELP}</p>
          <p>The budget sets the maximum offer. The sponsor and curator arrange payment directly.</p>
        </div>
      </aside>
    </div>
  </div>;
}

function CampaignReport({ report, target }) {
  if (!report.planned) return null;
  return <section className="panel report">
    <PanelHeading icon={Crosshair} title="Campaign report" trailing={<span className="muted numeric">{report.elapsed} / {report.planned} scheduled checks</span>} />
    <div className="report-stats">
      <div><span>Pass rate</span><strong>{report.passRate == null ? '—' : number(report.passRate, 1) + '%'}</strong><small>Target {target}%</small></div>
      <div><span>Passed</span><strong className="data-accent">{report.pass}</strong></div>
      <div><span>Failed</span><strong>{report.fail}</strong></div>
      <div><span>Unavailable</span><strong>{report.unavailable + report.missing}</strong><small>{report.missing} missed checks</small></div>
    </div>
    {report.elapsed > 0 && <div className="report-progress" role="img"
      aria-label={report.pass + ' passed, ' + report.fail + ' failed, ' + (report.unavailable + report.missing) + ' unavailable'}>
      {[['pass', report.pass], ['fail', report.fail], ['missing', report.missing + report.unavailable]].map(([state, count]) =>
        <span key={state} className={'report-segment ' + state} style={{ width: count / report.elapsed * 100 + '%' }} />)}
    </div>}
    <p className="panel-note">Pass rate uses all elapsed checks. Each observation uses quoted depth for the requested size.</p>
    {report.samples.length > 0 && <div className="table-scroll">
      <table className="list-table sample-table"><thead><tr><th>Observed</th><th>Buy vs. mid</th><th>Sell vs. mid</th><th>Result</th></tr></thead>
        <tbody>{report.samples.map(sample => <tr key={sample.slotAt}><th scope="row">{timestamp(sample.observedAt)}</th>
          <td className="numeric">{bps(sample.buyBps)}</td><td className="numeric">{bps(sample.sellBps)}</td>
          <td className={sample.outcome === 'pass' ? 'data-accent' : 'muted'}>{sample.reason}</td></tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

export function RequestDetail() {
  const { id } = useParams();
  const url = '/api/requests/' + encodeURIComponent(id);
  const { data, error, loading, reload } = useResource(url, 20_000);
  const session = useResource('/api/session');
  const action = useAction();
  const [copied, setCopied] = useState('');
  const mutate = (operation, payload) => action.submit(async () => { await write(url + '/' + operation, payload); reload(); });
  const user = session.data?.user;

  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); setCopied('Link copied'); }
    catch { setCopied('Copy the address from your browser.'); }
  }

  return <div className="wrap page">
    <Link className="back-link" to="/requests">Market requests</Link>
    <Feedback loading={loading} error={error} retry={reload}>
      {data && <>
        <div className="page-heading with-action">
          <div><span className="section-label"><AssetMark symbol={data.base} /> {data.pair} · {names[data.chainId] ?? data.chainId}</span>
            <h1>{data.title}</h1><p>Sponsored by {data.sponsor}</p></div>
          <div className="button-row"><Status value={data.status} />
            <button className="button secondary compact" onClick={copyLink} type="button"><Copy size={16} />Copy link</button></div>
        </div>
        {copied && <div className="toast" role="status" onClick={() => setCopied('')}>{copied}</div>}
        <div className="detail-layout">
          <div className="stack">
            <section className="panel"><PanelHeading icon={ClipboardList} title="Requirements" />
              <p className="panel-body body-copy">{data.description}</p></section>
            <CampaignReport report={data.report} target={data.target} />
            <section className="panel">
              <PanelHeading icon={Handshake} title={'Proposals (' + data.proposalCount + ')'} />
              <div className="panel-body stack small-stack">
                <ErrorText error={action.error} />
                {data.proposals.map(offer => <article key={offer.id} className="proposal">
                  <div><strong>{offer.curator}</strong><strong className="numeric">{money(offer.amount)}</strong></div>
                  <p className="body-copy">{offer.notes}</p>
                  {offer.selected && <span className="data-accent">Accepted</span>}
                  {data.status === 'open' && data.mine && <button className="button primary compact" type="button"
                    disabled={action.saving} onClick={() => mutate('accept', { proposalId: offer.id })}>Accept proposal</button>}
                </article>)}
                {data.mine && !data.proposalCount && <p className="muted">Curator proposals will appear here.</p>}
                {data.curator && !data.proposals.some(offer => offer.selected) && <p>{data.curator} accepted at {money(data.acceptedBudget)}.</p>}
                {data.status === 'open' && !data.mine && !data.proposals.some(offer => offer.mine) && (
                  user ? <form className="form-grid offer-form" onSubmit={event => {
                    event.preventDefault();
                    const payload = new FormData(event.currentTarget);
                    mutate('proposals', { amountCents: usdCents(payload.get('amount')), notes: payload.get('notes') });
                  }}>
                    <label className="field">Offer (USD)<input name="amount" type="number" min="0.01" max={data.budget} step="0.01" required /></label>
                    <label className="field full">How will you meet the target?<textarea name="notes" rows={4} minLength={15} maxLength={2000} required /></label>
                    <button className="button primary" disabled={action.saving}>Submit proposal</button>
                  </form> : !session.loading && !session.error && <SignIn>Sign in to propose</SignIn>
                )}
              </div>
            </section>
          </div>
          <aside className="panel summary-panel">
            <PanelHeading icon={Crosshair} title="Campaign target" />
            <div className="panel-body summary-content">
              <div className="big-amount"><small>Sponsor budget</small><strong>{money(data.budget)}</strong></div>
              <dl>
                <div><dt>Order size per side</dt><dd>{number(data.size, 0)} {data.quote}</dd></div>
                <div><dt>Price tolerance</dt><dd>±{data.maxBps} bps</dd></div><div><dt>Target pass rate</dt><dd>{data.target}%</dd></div>
                <div><dt>Benchmark</dt><dd>{data.benchmark === 'equity' ? 'Adjusted Robinhood stock midpoint' : 'Metric pool midpoint'}</dd></div>
                <div><dt>Schedule</dt><dd>{data.periods} {data.schedule === 'market_open' ? 'market opens' : 'days'}</dd></div>
                {data.startsAt && <div><dt>First check</dt><dd>{timestamp(data.startsAt)}</dd></div>}
              </dl>
              <a className="text-link" href={'https://app.metric.xyz/pool/' + data.chainId + '/' + data.address} target="_blank" rel="noreferrer">View Metric pool</a>
              {data.mine && ['open', 'scheduled', 'active'].includes(data.status) &&
                <button className="button secondary danger compact" type="button" disabled={action.saving}
                  onClick={() => { if (window.confirm('Cancel this campaign?')) mutate('cancel'); }}>Cancel request</button>}
            </div>
          </aside>
        </div>
      </>}
    </Feedback>
  </div>;
}
