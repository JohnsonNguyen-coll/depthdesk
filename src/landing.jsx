import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CircleDot, ClipboardList, LineChart, Radar, Waves } from 'lucide-react';
import { useResource } from './api.js';
import { bps, Feedback, number, PanelHeading, PoolMark } from './ui.jsx';
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
  return <div className="hero-visual" aria-hidden="true">
    <div className="hero-grid" />
    <div className="storm">
      {running && <Lightning color="#78bbff" bolts={2} xOffset={0.06} spread={0.72} branches={0.76}
        angle={19} size={1.06} thickness={0.82} speed={0.56} intensity={0.83} glow={0.86}
        flicker={0.08} mouseInteraction={false} clickStrike={false} intro={false} dpr={1} />}
    </div>
    <div className="hero-scrim" />
  </div>;
}

function MarketStrip() {
  const { data, error, loading } = useResource('/api/rwa/quotes', 20_000);
  const markets = data?.markets?.slice(0, 3) ?? [];
  const hasLive = markets.some(item => item.score.metric.bid && item.score.metric.ask && item.score.reference?.status === 'live');
  return <section className="market-strip" aria-label="Tokenized equity quotes">
    <PanelHeading icon={Activity} title="RWA market quotes"
      trailing={hasLive ? <span className="inline-state live"><CircleDot size={13} />Live</span> : <span className="inline-state">Robinhood Chain</span>} />
    <Feedback loading={loading} error={error} empty={!markets.length && 'No equity pools are currently available.'}>
      <div className="table-scroll">
        <table className="market-mini">
          <thead><tr><th>Market</th><th>Metric ask</th><th>Reference ask</th><th>Difference</th></tr></thead>
          <tbody>
            {markets.map(item => <tr key={item.address}>
              <th scope="row"><Link to={'/rwa?pool=' + item.address}><PoolMark pool={item} /><span>{item.base}<small>{item.quote}</small></span></Link></th>
              <td>{number(item.score.metric.ask)}</td><td>{number(item.score.reference?.ask)}</td>
              <td className={item.score.buyBps == null ? 'muted' : 'data-accent'}>{bps(item.score.buyBps)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Feedback>
    <div className="market-strip-footer"><span>Prices in USDG per token</span><Link to="/rwa">Open quote monitor</Link></div>
  </section>;
}

export default function Landing() {
  return <>
    <section className="hero">
      <HeroLightning />
      <div className="wrap hero-content">
        <div className="hero-copy">
          <div className="hero-kicker"><span /> A community tool for Metric</div>
          <h1>Liquidity,<br /><em>on demand.</em></h1>
          <p>Commission liquidity for a Metric pool, pick a curator, and measure the result. Track tokenized equity quotes alongside their stock prices.</p>
          <div className="button-row">
            <Link className="button primary" to="/requests"><Waves size={19} />Explore requests</Link>
            <Link className="button secondary hero-secondary" to="/rwa">View RWA quotes</Link>
          </div>
        </div>
        <MarketStrip />
      </div>
    </section>
    <section className="wrap workflow" aria-labelledby="workflow-title">
      <div className="workflow-heading">
        <h2 id="workflow-title">From request to results</h2>
        <Link className="text-link" to="/requests/new">Create a request</Link>
      </div>
      <div className="workflow-grid">
        <article><ClipboardList size={23} /><h3>Set the target</h3><p>Choose a pool, order size, price tolerance, and budget.</p></article>
        <article><Radar size={23} /><h3>Select a curator</h3><p>Review proposals and pick the curator who will run the campaign.</p></article>
        <article><LineChart size={23} /><h3>Check the quote history</h3><p>See when the pool met your target on both sides of the market.</p></article>
      </div>
    </section>
  </>;
}
