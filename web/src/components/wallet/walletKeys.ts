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
};
