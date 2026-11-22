import React, { lazy, Suspense, useContext, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/space-grotesk/wght.css';
import './styles.css';
import Landing from './landing.jsx';
import { Brand } from './ui.jsx';
import { RequestBoard, RequestDetail, RequestForm } from './requests.jsx';
import QuoteMonitor from './quotes.jsx';
import DepthAudit from './depth-audit.jsx';
import DepthLab from './pool-research.jsx';
import AccountMenu from './account-menu.jsx';
import { WalletContext, walletAppId } from './wallet-state.js';

const WalletProvider = walletAppId ? lazy(() => import('./wallet.jsx')) : null;

function HeaderAction() {
  const wallet = useContext(WalletContext);
  if (!wallet) return <Link className="button secondary top-action" to="/requests/new">New request</Link>;
  return <div className="wallet-action">
    {wallet.id ? <AccountMenu key={wallet.id} wallet={wallet} />
      : <button className="button primary" type="button" disabled={!wallet.ready} onClick={wallet.signIn}>Connect wallet</button>}
    {wallet.error && <p role="alert" className="wallet-error error">{wallet.error}</p>}
  </div>;
}

function App() {
  const { pathname } = useLocation();
  const wallet = useContext(WalletContext);
  useEffect(() => {
    window.scrollTo(0, 0);
    const section = pathname === '/depth-audit' ? 'Live Depth Audit' : pathname === '/depth-lab' ? 'Depth Lab'
      : pathname.startsWith('/rwa') ? 'RWA Quotes' : pathname.startsWith('/requests') ? 'Market Requests' : '';
    document.title = section ? section + ' | DepthDesk' : 'DepthDesk';
  }, [pathname]);
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="topbar"><div className="wrap topbar-inner">
      <Brand />
      <nav aria-label="Main navigation">
        <NavLink to="/" end>Overview</NavLink>
        <NavLink to="/requests">Requests</NavLink>
        <NavLink to="/depth-lab">Depth Lab</NavLink>
        <NavLink to="/rwa">RWA Quotes</NavLink>
      </nav>
      <HeaderAction />
    </div></header>
    <main id="main" tabIndex="-1">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/requests" element={<RequestBoard key={wallet?.id ?? 'guest'} />} />
        <Route path="/requests/new" element={<RequestForm />} />
        <Route path="/requests/:id" element={<RequestDetail />} />
        <Route path="/rwa" element={<QuoteMonitor />} />
        <Route path="/depth-lab" element={<DepthLab />} />
        <Route path="/depth-audit" element={<DepthAudit />} />
        <Route path="*" element={<div className="wrap page"><h1>Page not found</h1><Link className="button primary" to="/">Home</Link></div>} />
      </Routes>
    </main>
    <footer className="footer"><div className="wrap footer-inner">
      <div><Brand /><p>Independent community software for Metric.</p></div>
      <div className="footer-links">
        <Link to="/requests">Market Requests</Link><Link to="/depth-lab">Depth Lab</Link><Link to="/rwa">RWA Quotes</Link>
        <a href="https://docs.metric.xyz/" target="_blank" rel="noreferrer">Metric docs</a>
      </div>
    </div></footer>
  </>;
}

const app = <BrowserRouter><App /></BrowserRouter>;
createRoot(document.getElementById('root')).render(WalletProvider
  ? <Suspense fallback={<main className="wrap page" role="status">Loading DepthDesk…</main>}><WalletProvider>{app}</WalletProvider></Suspense>
  : app);
