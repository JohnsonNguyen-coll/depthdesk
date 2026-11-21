import { useCallback, useEffect, useRef, useState } from 'react';
import { PrivyProvider, useLogin, usePrivy } from '@privy-io/react-auth';
import { WalletContext, walletAppId } from './wallet-state.js';

function WalletSession({ children }) {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  const [error, setError] = useState(null);
  const { login } = useLogin({
    onComplete: () => setError(null),
    onError: code => { if (code !== 'exited_auth_flow') setError('Wallet sign-in did not complete. Try again.'); }
  });
  const tokenGetter = useRef(getAccessToken);
  useEffect(() => { tokenGetter.current = getAccessToken; }, [getAccessToken]);
  const getToken = useCallback(() => tokenGetter.current(), []);
  const signIn = () => { setError(null); login(); };
  const signOut = () => {
    setError(null);
    logout().catch(() => setError('Unable to sign out. Try again.'));
  };
  return <WalletContext.Provider value={{
    ready, id: authenticated ? user?.id : null, address: user?.wallet?.address,
    getToken, signIn, signOut, error
  }}>{children}</WalletContext.Provider>;
}

const walletConfig = {
  appearance: { theme: 'dark', accentColor: '#76aaff', walletChainType: 'ethereum-only' },
  loginMethods: ['wallet'],
  embeddedWallets: { ethereum: { createOnLogin: 'off' } }
};

export default function WalletProvider({ children }) {
  return <PrivyProvider appId={walletAppId} config={walletConfig}>
    <WalletSession>{children}</WalletSession>
  </PrivyProvider>;
}
