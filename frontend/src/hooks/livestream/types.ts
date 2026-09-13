/**
 * Shared state types for the live stream viewer and seller domain hooks.
 */

export type ConnectionState = 'connecting' | 'live' | 'error' | 'ended';

/** Seller broadcast phases: setup → live → summary. */
export type SellerPhase = 'setup' | 'live' | 'summary';

export type BidOutcome = 'idle' | 'submitting' | 'accepted' | 'rejected' | 'unknown';

export interface SellerIdentity {
  name: string;
  avatar: string | null;
  verified: boolean;
}
