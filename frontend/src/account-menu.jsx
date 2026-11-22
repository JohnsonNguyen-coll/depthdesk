import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export default function AccountMenu({ wallet }) {
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const panelId = useId();
  const account = wallet.address ? wallet.address.slice(0, 6) + '…' + wallet.address.slice(-4) : 'Account';

  useEffect(() => {
    if (!open) return;
    function dismiss(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopyStatus('Address copied.');
    } catch {
      setCopyStatus('Select the address above to copy it.');
    }
  }

  async function signOut() {
    setSigningOut(true);
    try { await wallet.signOut(); }
    finally { setSigningOut(false); }
  }

  return <div className="account-menu" ref={root} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (open && event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
  }}>
    <button className="button secondary account-trigger" type="button" ref={trigger} aria-label={'Wallet account ' + account}
      aria-expanded={open} aria-controls={panelId} onClick={() => { setCopyStatus(''); setOpen(value => !value); }}>
      <span className="account-dot" aria-hidden="true" />{account}<span className="chevron" aria-hidden="true" />
    </button>
    <div className="account-panel" id={panelId} hidden={!open}>
      <div className="account-info"><strong>Connected wallet</strong>{wallet.address && <p>{wallet.address}</p>}</div>
      {wallet.address && <button className="account-option" type="button" onClick={copyAddress}>Copy address</button>}
      <p className="account-feedback" role="status">{copyStatus}</p>
      <Link className="account-option" to="/requests?scope=mine" onClick={() => setOpen(false)}>My requests</Link>
      <button className="account-option account-signout" type="button" onClick={signOut} disabled={signingOut}>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  </div>;
}
