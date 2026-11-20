import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export const names = { 1: 'Ethereum', 56: 'BNB Chain', 4663: 'Robinhood', 8453: 'Base', 42161: 'Arbitrum' };
export const money = value => value == null ? '—' : new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2
}).format(value);
export const number = (value, digits = 2) => value == null ? '—' : new Intl.NumberFormat('en-US', {
  maximumFractionDigits: digits
}).format(value);
export const bps = value => value == null ? '—' : (value > 0 ? '+' : '') + number(value) + ' bps';
export const timestamp = value => value == null ? '—' : new Intl.DateTimeFormat('en', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
}).format(value);

export function Brand() {
  return <Link className="brand" to="/" aria-label="Metric DepthDesk home">
    <img className="brand-icon" src="/mark.svg" width="38" height="38" alt="" />
    <span>Metric<span className="brand-accent"> DepthDesk</span></span>
  </Link>;
}

export function Status({ value }) {
  const label = ({ active: 'Measuring', completed: 'Completed', scheduled: 'Scheduled', open: 'Open',
    cancelled: 'Cancelled', live: 'Live', stale: 'Stale', unavailable: 'Unavailable', halted: 'Trading halt' })[value] ?? value;
  return <span className={'status status-' + value}>{label}</span>;
}

export function AssetMark({ symbol, logo }) {
  const [failed, setFailed] = useState(null);
  return <span className="asset-mark" aria-hidden="true">
    {logo && failed !== logo ?
      <img src={logo} className="asset-image" alt="" width="36" height="36" loading="lazy" decoding="async"
        referrerPolicy="no-referrer" onError={() => setFailed(logo)} /> :
      symbol?.slice(0, 2) || '?'}
  </span>;
}

export function PoolMark({ pool }) {
  if (!pool?.quote) return <AssetMark symbol={pool?.base} logo={pool?.baseLogo} />;
  return <span className="asset-pair" aria-hidden="true">
    <AssetMark symbol={pool.base} logo={pool.baseLogo} />
    <span className="quote-mark"><AssetMark symbol={pool.quote} logo={pool.quoteLogo} /></span>
  </span>;
}

export function Feedback({ loading, error, empty, retry, children }) {
  if (loading) return <div className="feedback" role="status">Loading…</div>;
  if (error) return <div className="feedback" role="alert"><span>{error}</span>
    {retry && <button className="button secondary compact" type="button" onClick={retry}>Try again</button>}</div>;
  if (empty) return <div className="feedback feedback-empty"><span>{empty}</span>{children}</div>;
  return children ?? null;
}

export function ErrorText({ error }) {
  return error ? <p className="error" role="alert">{error}</p> : null;
}

export function SignIn({ children = 'Sign in with ChatGPT' }) {
  const { pathname, search } = useLocation();
  return <a className="button primary" target="_top"
    href={'/signin-with-chatgpt?return_to=' + encodeURIComponent(pathname + search)}>{children}</a>;
}

export function PanelHeading({ title, trailing }) {
  return <div className="panel-heading">
    <h2>{title}</h2>{trailing}
  </div>;
}

export function SourceNote({ metric = true }) {
  return <p className="source-note">
    {metric ? <a href="https://docs.metric.xyz/reference/api" target="_blank" rel="noreferrer">Metric API</a> : null}
    {metric ? <span aria-hidden="true">·</span> : null}
    <a href="https://docs.robinhood.com/chain/stock-token-apis/" target="_blank" rel="noreferrer">Robinhood Stock Token API</a>
  </p>;
}
