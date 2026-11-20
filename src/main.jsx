import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/space-grotesk/wght.css';
import './styles.css';
import Landing from './landing.jsx';
import { Brand } from './ui.jsx';
import { RequestBoard, RequestDetail, RequestForm } from './requests.jsx';
import QuoteMonitor from './quotes.jsx';

function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const section = pathname.startsWith('/rwa') ? 'RWA Quotes' : pathname.startsWith('/requests') ? 'Market Requests' : '';
    document.title = section ? section + ' | Metric DepthDesk' : 'Metric DepthDesk';
  }, [pathname]);
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="topbar"><div className="wrap topbar-inner">
      <Brand />
      <nav aria-label="Main navigation">
        <NavLink to="/" end>Overview</NavLink>
        <NavLink to="/requests">Requests</NavLink>
        <NavLink to="/rwa">RWA Quotes</NavLink>
      </nav>
      <Link className="button primary compact top-action" to="/requests/new"><Plus size={17} />New request</Link>
    </div></header>
    <main id="main" tabIndex="-1">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/requests" element={<RequestBoard />} />
        <Route path="/requests/new" element={<RequestForm />} />
        <Route path="/requests/:id" element={<RequestDetail />} />
        <Route path="/rwa" element={<QuoteMonitor />} />
        <Route path="*" element={<div className="wrap page"><h1>Page not found</h1><Link className="button primary" to="/">Home</Link></div>} />
      </Routes>
    </main>
    <footer className="footer"><div className="wrap footer-inner">
      <div><Brand /><p>Independent community software for Metric.</p></div>
      <div className="footer-links">
        <Link to="/requests">Market Requests</Link><Link to="/rwa">RWA Quotes</Link>
        <a href="https://docs.metric.xyz/" target="_blank" rel="noreferrer">Metric docs</a>
        <a href="/licenses/react-bits.txt" target="_blank" rel="noreferrer">React Bits license</a>
      </div>
    </div></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>);
