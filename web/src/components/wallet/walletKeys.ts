/**
 * Wallet query keys — the single source of truth for the wallet cache
 * address. Every reader (`useWalletData`) and every writer (convert,
 * withdraw, top-up, Co-Own trade settlement) must derive its key here so
 * a mutation always lands on the same cache entry the surfaces read.
 */
export const walletKeys = {
  /** Root prefix — use for invalidations that should hit every wallet entry. */
  root: ['wallet'] as const,
  /** The per-user wallet snapshot + session ledger. */
  all: (userId?: string | null) => ['wallet', userId ?? 'guest'] as const,
  /** The per-user paginated transaction feed (live mode only). */
  transactions: (userId?: string | null) =>
    ['wallet', userId ?? 'guest', 'transactions'] as const,
  /** The per-user multi-currency pockets (live mode only). Nested under the
   *  root so `invalidateQueries({ queryKey: walletKeys.root })` — issued by
   *  convert/withdraw/exchange writes — refreshes the pocket list too. */
  currencyBalances: (userId?: string | null) =>
    ['wallet', userId ?? 'guest', 'currency-balances'] as const,
  /** The per-user beneficiary (payout recipient) list — nested under the
   *  root so transfer/beneficiary writes refresh it via root invalidation. */
  beneficiaries: (userId?: string | null) =>
    ['wallet', userId ?? 'guest', 'beneficiaries'] as const,
  /** The per-user outbound transfer feed (newest-first). */
  transfers: (userId?: string | null) =>
    ['wallet', userId ?? 'guest', 'transfers'] as const,
};
