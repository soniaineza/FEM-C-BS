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

export type TopupStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface WalletTopup {
  id: string;
  amount: number;
  phone: string;
  status: TopupStatus;
  state: string;
  provider: string | null;
  reference: string;
  createdAt: string;
  updatedAt: string;
}

// Deposits money into the wallet via mobile money — goes through the same
// real Paypack collect/refresh flow as a ride payment
// (server/src/routes/wallet.routes.js), never fakes a successful deposit.
export async function topUpWallet(params: { phone: string; amount: number }): Promise<WalletTopup> {
  const json = await apiClient.post<{ topup: WalletTopup }>('/wallet/topup', params);
  return json.topup;
}

export async function getWalletTopups(): Promise<WalletTopup[]> {
  const json = await apiClient.get<{ topups: WalletTopup[] }>('/wallet/topups');
  return json.topups;
}

export async function refreshWalletTopup(id: string): Promise<WalletTopup> {
  const json = await apiClient.post<{ topup: WalletTopup }>(`/wallet/topups/${id}/refresh`);
  return json.topup;
}
