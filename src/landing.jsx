import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  if (!running) return null;
  return <div className="hero-lightning" aria-hidden="true">
    <Lightning color="#f7f7f7" bolts={1} xOffset={0.09} branches={0.5}
      angle={13} size={1.08} thickness={0.67} speed={0.42} intensity={0.92} glow={0.39}
      flicker={0.035} mouseInteraction={false} clickStrike={false} intro={false} dpr={1} />
  </div>;
}

function MarketStrip() {
  const { data, error, loading } = useResource('/api/rwa/quotes', 20_000);
  const markets = data?.markets?.slice(0, 3) ?? [];
  const hasLive = markets.some(item => item.score.metric.bid && item.score.metric.ask && item.score.reference?.status === 'live');
  return <section className="wrap market-strip" aria-label="Tokenized equity quotes">
    <PanelHeading title="RWA quotes"
      trailing={hasLive ? <span className="inline-state live">Live</span> : <span className="inline-state">Robinhood Chain</span>} />
    <Feedback loading={loading} error={error} empty={!markets.length && 'No equity pools are currently available.'}>
      <div className="table-scroll">
        <table className="market-mini">
          <thead><tr><th>Market</th><th>Metric ask</th><th>Stock ask</th><th>Difference</th></tr></thead>
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
    <p className="market-strip-note">Prices in USDG per token</p>
  </section>;
}

export default function Landing() {
  return <>
    <section className="hero">
      <HeroLightning />
      <div className="wrap hero-content">
        <div className="hero-copy">
          <h1>Commission<br />liquidity.</h1>
          <p>Set a liquidity target for a Metric pool, choose a curator, and track quoted depth during the campaign.</p>
          <div className="button-row">
            <Link className="button primary" to="/requests">Browse requests</Link>
            <Link className="text-link" to="/rwa">View RWA quotes</Link>
          </div>
        </div>
      </div>
    </section>
    <MarketStrip />
  </>;
}
