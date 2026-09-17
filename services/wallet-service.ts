import { apiClient } from './api-client';

// Response envelope verified against server/src/routes/wallet.routes.js.
export interface WalletTransaction {
  id: string;
  amount: number;
  type: 'credit' | 'debit';
  source: string;
  reference: string | null;
  createdAt: string;
}

export interface Wallet {
  balance: number;
  transactions: WalletTransaction[];
}

export async function getWallet(): Promise<Wallet> {
  const json = await apiClient.get<{ wallet: Wallet }>('/wallet');
  return json.wallet;
}
