import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CampaignReport } from './campaign-report.jsx';
import { useAction, useApi, useResource } from './api.js';
import { ErrorText, Feedback, money, names, number, PanelHeading, PoolMark, SignIn, Status, timestamp } from './ui.jsx';

const filters = ['all', 'open', 'scheduled', 'active', 'completed', 'cancelled'];
const filtersLabel = { all: 'All requests', open: 'Open', scheduled: 'Scheduled', active: 'Measuring', completed: 'Completed', cancelled: 'Cancelled' };
const shortAddress = value => value.slice(0, 6) + '…' + value.slice(-4);
const usdCents = value => Math.round(Number(value) * 100);
const FIELD_HELP = 'Fill the target order size in both directions within the price tolerance.';

const campaignPoolId = item => item.chainId + ':' + item.address.toLowerCase();

function useCampaignIcons(items) {
  const params = new URLSearchParams();
  for (const id of [...new Set(items.map(campaignPoolId))].sort()) params.append('pool', id);
  const { data } = useResource(params.size ? '/api/pools/icons?' + params : null);
  return data?.pools ?? {};
}

function campaignWithIcons(item, icons) {
  const tokens = icons[campaignPoolId(item)] ?? [];
  const [base, quote] = tokens[0]?.symbol === item.base ? tokens : [...tokens].reverse();
  return { ...item, baseLogo: base?.logo, quoteLogo: quote?.logo };
}

function CampaignRows({ items }) {
  const icons = useCampaignIcons(items);
  return items.map(item => <tr key={item.id}>
    <th scope="row"><Link to={'/requests/' + item.id} className="table-link">
      <PoolMark pool={campaignWithIcons(item, icons)} /><span>{item.title}<small>{item.pair} · {item.sponsor}</small></span>
    </Link></th>
    <td>{names[item.chainId] ?? item.chainId}</td><td className="numeric">{number(item.size, 0)} {item.quote}</td>
    <td className="numeric">{money(item.budget)}</td><td><Status value={item.status} /></td>
  </tr>);
}

export function RequestBoard() {
  const { read } = useApi();
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
  const groups = [];
  for (let index = 0; index < visible.length; index += 100) groups.push(visible.slice(index, index + 100));
  const loadEarlier = () => pagination.submit(async () => {
    const result = await read('/api/requests?before=' + next);
    setEarlier(items => [...items, ...result.campaigns]);
    setCursor(result.nextBefore ?? 0);
  });
  return <div className="wrap page">
    <div className="page-heading with-action">
      <div><h1>Market requests</h1>
        <p>Find campaigns to curate, or commission liquidity for a Metric pool.</p></div>
      <Link className="button primary" to="/requests/new">Create request</Link>
    </div>
    <section className="panel board" aria-label="Market requests">
      <div className="audit-banner">
        <div><strong>Live depth audit</strong><p className="muted">See how a real Metric pool is measured at a fixed order size.</p></div>
        <Link className="text-link" to="/depth-audit">Open audit report</Link>
      </div>
      <div className="toolbar">
        <div className="segmented" aria-label="Request status">
          {filters.map(value => <button key={value} type="button" aria-pressed={value === filter}
            onClick={() => setFilter(value)}>{filtersLabel[value]}</button>)}
        </div>
        <label className="search-field"><input aria-label="Search requests" placeholder="Search requests" value={search} onChange={event => setSearch(event.target.value)} /></label>
      </div>
      <Feedback loading={loading} error={error} retry={reload}
        empty={!visible.length && (campaigns.length ? 'No requests match these filters.' : 'No liquidity requests have been posted yet.')}>
        {!visible.length ? (!campaigns.length && <Link className="button secondary" to="/requests/new">Create the first request</Link>) :
          <div className="table-scroll"><table className="list-table">
            <thead><tr><th>Request</th><th>Network</th><th>Order size</th><th>Budget</th><th>Status</th></tr></thead>
            <tbody>{groups.map(items => <CampaignRows key={items[0].id} items={items} />)}</tbody>
          </table></div>}
      </Feedback>
      <ErrorText error={pagination.error} />
      {Boolean(next) && <div className="panel-footer"><button type="button" onClick={loadEarlier}
        disabled={pagination.saving} className="button secondary">Load more requests</button></div>}
    </section>
  </div>;
}

export function RequestForm() {
  const { write } = useApi();
  const [params] = useSearchParams();
  const [chain, setChain] = useState(params.get('chain') ?? '4663');
  const [address, setAddress] = useState(params.get('pool') ?? '');
  const [schedule, setSchedule] = useState('continuous');
  const [selectedBenchmark, setBenchmark] = useState(null);
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
  const benchmark = chosen?.equity ? selectedBenchmark ?? 'equity' : 'pool';
  const marketOpen = chosen?.equity && (benchmark === 'equity' || schedule === 'market_open');
  const user = session.data?.user;

  function chooseNetwork(event) {
    setChain(event.target.value);
    setAddress('');
    setValidated('');
    setOffset(0);
    setSchedule('continuous');
    setBenchmark(null);
  }

  function setPool(value) {
    setAddress(value);
    setValidated(mode === 'catalog' ? value : '');
    setSchedule('continuous');
    setBenchmark(null);
  }

  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return action.submit(async () => {
      const created = await write('/api/requests', {
        title: form.get('title'), description: form.get('description'), chainId: Number(chain),
        address: chosen.address, benchmark, schedule: marketOpen ? 'market_open' : 'continuous',
        periods: Number(form.get('periods')), size: Number(form.get('size')), maxBps: Number(form.get('maxBps')),
        target: Number(form.get('target')), budgetCents: usdCents(form.get('budget'))
      });
      navigate('/requests/' + created.id);
    });
  }

  return <div className="wrap page">
    <Link className="back-link" to="/requests">Market requests</Link>
    <div className="page-heading">
      <h1>Create request</h1><p>Give curators a target they can price and a result you can measure.</p></div>
    <div className="detail-layout">
      <form className="panel form-panel" onSubmit={submit}>
        <PanelHeading title="Campaign terms" />
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
          <label className="field full">Benchmark<select value={benchmark} onChange={event => setBenchmark(event.target.value)}>
            {chosen?.equity && <option value="equity">Robinhood stock midpoint · independent price reference</option>}
            <option value="pool">Metric pool midpoint · depth and spread</option>
          </select></label>
          <label className="field">Measurement window<select value={marketOpen ? 'market_open' : 'continuous'} onChange={event => setSchedule(event.target.value)}>
            <option value="continuous" disabled={benchmark === 'equity'}>Continuous</option><option value="market_open" disabled={!chosen?.equity}>U.S. market open</option>
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
        <PanelHeading title="Measurement" />
        <div className="panel-body summary-content">
          <div className="summary-pair"><PoolMark pool={chosen} /><div><strong>{chosen?.pair ?? 'Select a pool'}</strong>
            <small>{chosen?.chain ?? names[chain] ?? 'Metric'}</small></div></div>
          <dl><div><dt>Benchmark</dt><dd>{benchmark === 'equity' ? 'Robinhood stock midpoint, adjusted for token units' : 'Metric pool midpoint measures depth relative to the pool’s own price'}</dd></div>
            <div><dt>Schedule</dt><dd>{marketOpen ? 'First 30 minutes of each U.S. equity session' : 'Every five minutes after acceptance'}</dd></div></dl>
          <p>{FIELD_HELP}</p>
          <p>The budget sets the maximum offer. The sponsor and curator arrange payment directly.</p>
        </div>
      </aside>
    </div>
  </div>;
}

export function RequestDetail() {
  const { write } = useApi();
  const { id } = useParams();
  const url = '/api/requests/' + encodeURIComponent(id);
  const { data, error, loading, reload } = useResource(url, 20_000);
  const icons = useCampaignIcons(data ? [data] : []);
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
          <div><span className="section-label"><PoolMark pool={campaignWithIcons(data, icons)} /> {data.pair} · {names[data.chainId] ?? data.chainId}</span>
            <h1>{data.title}</h1><p>Sponsored by {data.sponsor}</p></div>
          <div className="button-row"><Status value={data.status} />
            <button className="text-link" onClick={copyLink} type="button">Copy link</button></div>
        </div>
        {copied && <div className="toast" role="status" onClick={() => setCopied('')}>{copied}</div>}
        <div className="detail-layout">
          <div className="stack">
            <section className="panel"><PanelHeading title="Requirements" />
              <p className="panel-body body-copy">{data.description}</p></section>
            <CampaignReport report={data.report} target={data.target} benchmark={data.benchmark}
              showReference={data.benchmark === 'equity' || data.report.samples.some(sample => sample.referenceStatus)} />
            <section className="panel">
              <PanelHeading title={'Proposals (' + data.proposalCount + ')'} />
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
            <PanelHeading title="Campaign target" />
            <div className="panel-body summary-content">
              <div className="big-amount"><small>Sponsor budget</small><strong>{money(data.budget)}</strong></div>
              <dl>
                <div><dt>Order size per side</dt><dd>{number(data.size, 0)} {data.quote}</dd></div>
                <div><dt>Price tolerance</dt><dd>±{data.maxBps} bps</dd></div><div><dt>Target pass rate</dt><dd>{data.target}%</dd></div>
                <div><dt>Benchmark</dt><dd>{data.benchmark === 'equity' ? 'Adjusted Robinhood stock midpoint' : 'Metric pool midpoint · depth and spread'}</dd></div>
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
