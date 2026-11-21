import { createContext } from 'react';

export const walletAppId = import.meta.env.VITE_PRIVY_APP_ID?.trim();
export const WalletContext = createContext(null);
