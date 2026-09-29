/**
 * Wallet ledger service — the canonical money-movement ledger.
 * Mirrors native services/walletApi.ts getWalletLedger:
 * GET /wallet/1ze/:userId/ledger reads wallet_ledger — every 1ZE and fiat
 * leg (FX conversions, transfers, mint/burn, Co-Own settlements, sale and
 * purchase legs) — rather than the GBP accounting ledger behind
 * /users/:id/transactions, which never sees those movements.
 *
 * Wire contract (backend api route /wallet/1ze/:userId/ledger):
 *  - Query: asset=ALL|1ZE|FIAT, limit (clamped to ≤300). No offset/cursor —
 *    the endpoint returns newest-first up to limit.
 *  - Each item carries a signed integer `amount` (minor units for FIAT,
 *    1ZE units for 1ZE) and a display-ready signed major-unit
 *    `amountDisplay`, plus `balanceAfterDisplay` — a real running balance
 *    per pocket, not a client reconstruction.
 *  - `currency` is the leg's own code: '1ZE' for token legs, the per-leg
 *    ISO code for FIAT legs (an EUR FX credit carries EUR, never GBP).
 */

import { fetchJson } from '../http';

export type WalletLedgerAssetFilter = 'ALL' | '1ZE' | 'FIAT';

/** Server-side cap on the ledger read — the route clamps limit to 300. */
export const WALLET_LEDGER_MAX_LIMIT = 300;

export interface WalletLedgerItem {
  id: number | string;
  walletId: string;
  /** Shared transaction id across the legs of one movement — a real
   *  server reference (e.g. both legs of an FX conversion share it). */
  txId: string | null;
  asset: '1ZE' | 'FIAT' | string;
  /** Signed integer units — minor units for FIAT, 1ZE units for 1ZE. */
  amount: number;
  /** Signed major units, display-ready — never feed `amount` to a
   *  major-unit formatter (100× inflation on FIAT legs). */
  amountDisplay: number;
  balanceAfter: number;
  balanceAfterDisplay: number;
  /** '1ZE' for token legs, the leg's own ISO code for FIAT legs. */
  currency?: string;
  kind: string;
  refType: string | null;
  refId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface WalletLedgerResponse {
  ok: true;
  wallet: unknown;
  items: WalletLedgerItem[];
}

/** Newest-first page of the canonical wallet ledger. */
export async function fetchWalletLedger(
  userId: string,
  options: { asset?: WalletLedgerAssetFilter; limit?: number } = {},
  signal?: AbortSignal,
): Promise<WalletLedgerItem[]> {
  const params = new URLSearchParams();
  params.set('asset', options.asset ?? 'ALL');
  const limit = options.limit ?? 100;
  params.set('limit', String(Math.min(Math.max(1, limit), WALLET_LEDGER_MAX_LIMIT)));
  const payload = await fetchJson<WalletLedgerResponse>(
    `/wallet/1ze/${encodeURIComponent(userId)}/ledger?${params.toString()}`,
    undefined,
    { signal },
  );
  return payload.items ?? [];
}
