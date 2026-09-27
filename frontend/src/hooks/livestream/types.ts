/**
 * Shared state types for the live stream viewer and seller domain hooks.
 */

// 'removed' — the host kicked this viewer (live.viewer.kicked). Terminal:
// the server also refuses fresh viewer tokens for kicked-and-muted users,
// so reconnecting is not offered.
export type ConnectionState = 'connecting' | 'live' | 'error' | 'ended' | 'scheduled' | 'removed';

/** Seller broadcast phases: setup → live → summary. */
export type SellerPhase = 'setup' | 'live' | 'summary';

export type BidOutcome = 'idle' | 'submitting' | 'accepted' | 'rejected' | 'unknown';

export interface SellerIdentity {
  name: string;
  avatar: string | null;
  verified: boolean;
}
