import { Activity, CircleAlert, CloudOff, Layers3, Radio, RefreshCcw } from 'lucide-react';
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
  return <span className={'status status-' + value}><i aria-hidden="true" />{label}</span>;
}

export const assetColors = { NVDA: '#beed70', AAPL: '#dce0e3', TSLA: '#ff8787', META: '#83b4ff', GOOGL: '#ffce71', SPY: '#9dd6cd' };
export function AssetMark({ symbol }) {
  return <span className="asset-mark" style={{ '--asset': assetColors[symbol] ?? '#b1c7bd' }} aria-hidden="true">
    {symbol?.slice(0, 2) || '?'}
  </span>;
}

export function Feedback({ loading, error, empty, retry, children }) {
  if (loading) return <div className="feedback" role="status"><RefreshCcw className="spinner" size={20} />Loading…</div>;
  if (error) return <div className="feedback" role="alert"><CloudOff size={22} /><span>{error}</span>
    {retry && <button className="button secondary compact" type="button" onClick={retry}>Try again</button>}</div>;
  if (empty) return <div className="feedback feedback-empty"><Layers3 size={24} /><span>{empty}</span>{children}</div>;
  return children ?? null;
}

export function ErrorText({ error }) {
  return error ? <p className="error" role="alert"><CircleAlert size={18} />{error}</p> : null;
}

export function SignIn({ children = 'Sign in with ChatGPT' }) {
  const { pathname, search } = useLocation();
  return <a className="button primary" target="_top"
    href={'/signin-with-chatgpt?return_to=' + encodeURIComponent(pathname + search)}>{children}</a>;
}

export function PanelHeading({ icon: Icon = Activity, title, trailing }) {
  return <div className="panel-heading">
    <h2><Icon size={18} strokeWidth={1.8} />{title}</h2>{trailing}
  </div>;
}

export function SourceNote({ metric = true }) {
  return <p className="source-note"><Radio size={15} />
    {metric ? <a href="https://docs.metric.xyz/reference/api" target="_blank" rel="noreferrer">Metric API</a> : null}
    {metric ? <span aria-hidden="true">·</span> : null}
    <a href="https://docs.robinhood.com/chain/stock-token-apis/" target="_blank" rel="noreferrer">Robinhood Stock Token API</a>
  </p>;
}
