import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from './api.js';
import { bps, Feedback, number, PoolMark, SourceNote, Status } from './ui.jsx';
import './overview.css';
import Lightning from './vendor/react-bits/Lightning.jsx';

function HeroLightning() {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setRunning(!motion.matches && !document.hidden);
    update();
    motion.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      motion.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  if (!running) return null;
  return <div className="hero-lightning" aria-hidden="true">
    <Lightning color="#76aaff" bolts={1} xOffset={0.22} branches={0.61}
      angle={-29} size={0.83} thickness={0.92} speed={0.45} intensity={0.98} glow={0.63}
      flicker={0.035} mouseInteraction={false} clickStrike={false} intro={false} dpr={1} />
  </div>;
}

function EquityMarket() {
  const result = useResource('/api/rwa/quotes', 20_000);
  const markets = result.data?.markets ?? [];
  return <section className="wrap overview-section" aria-labelledby="equity-market-title">
    <header className="overview-heading">
      <div><h2 id="equity-market-title">Tokenized equities</h2>
        <p>Metric quotes alongside the underlying Robinhood reference, adjusted to the same token units.</p>
      </div>
      <Link className="button secondary" to="/rwa">Open RWA Quotes</Link>
    </header>
    <Feedback loading={result.loading} error={result.error} retry={result.reload} empty={!markets.length && 'No equity pools are currently available.'}>
      <div className="table-scroll">
        <table className="market-mini equity-table">
          <thead><tr><th>Market</th><th>Metric bid</th><th>Metric ask</th><th>Stock ask</th><th>Ask difference</th><th>Reference</th></tr></thead>
          <tbody>
            {markets.map(item => <tr key={item.address}>
              <th scope="row"><Link to={'/rwa?pool=' + item.address}>
                <PoolMark pool={item} /><span>{item.base}<small>{item.name || item.pair}</small></span>
              </Link></th>
              <td>{number(item.score.metric.bid, 4)}</td>
              <td>{number(item.score.metric.ask, 4)}</td>
              <td>{number(item.score.reference?.ask, 4)}</td>
              <td className={item.score.buyBps == null ? 'muted' : 'data-accent'}>{bps(item.score.buyBps)}</td>
              <td><Status value={item.score.reference?.status ?? 'unavailable'} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Feedback>
    <div className="equity-source"><p>Prices in USDG per token.</p><SourceNote /></div>
  </section>;
}

function RecentRequests() {
  const result = useResource('/api/requests', 30_000);
  const campaigns = result.data?.campaigns?.slice(0, 3) ?? [];
  return <section className="wrap overview-section request-overview" aria-labelledby="overview-requests-title">
    <header className="overview-heading">
      <div><h2 id="overview-requests-title">Liquidity requests</h2>
        <p>Set an order size and price tolerance, select a curator, and measure the pool against your target.</p>
      </div>
      <Link className="button secondary" to="/requests">View all requests</Link>
    </header>
    <Feedback loading={result.loading} error={result.error} retry={result.reload} empty={!campaigns.length && 'No liquidity requests have been posted yet.'}>
      <ul className="overview-requests">
        {campaigns.map(campaign => <li key={campaign.id}>
          <Link to={'/requests/' + campaign.id}><strong>{campaign.title}</strong><span>{campaign.pair} · {number(campaign.size, 0)} {campaign.quote} per side</span></Link>
          <Status value={campaign.status} />
        </li>)}
      </ul>
    </Feedback>
  </section>;
}

export default function Landing() {
  return <>
    <section className="hero">
      <HeroLightning />
      <div className="wrap hero-content">
        <div className="hero-copy">
          <h1>Commission<br />liquidity.</h1>
          <p>Research quoted depth on Metric, set a liquidity target, and track how the pool performs.</p>
          <div className="button-row">
            <Link className="button primary" to="/depth-lab">Open Depth Lab</Link>
            <Link className="button secondary" to="/requests">Browse requests</Link>
          </div>
        </div>
      </div>
    </section>
    <div className="wrap overview-tools" id="pool-research">
      <section>
        <h2>Test a trade size</h2>
        <p>Compare buy and sell fills from the same pool snapshot and see which sizes meet your tolerance.</p>
        <Link className="button secondary" to="/depth-lab">Compare trade sizes</Link>
      </section>
      <section>
        <h2>Review live measurements</h2>
        <p>See five-minute depth observations for a real Metric pool, with independent stock comparisons during U.S. market hours.</p>
        <Link className="button secondary" to="/depth-audit">View the live audit</Link>
      </section>
    </div>
    <EquityMarket />
    <RecentRequests />
  </>;
}
