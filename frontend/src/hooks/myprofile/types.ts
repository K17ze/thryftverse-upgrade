// Shared type vocabulary for the owner-profile (MyProfile) surface.

import type { CoOwnSettlementMode } from '../../services/marketApi';

export type MyProfileTab = 'listings' | 'looks' | 'about' | 'reviews';

/** Follow-count fetch lifecycle — distinguishes loading/error from a real
 *  zero so the UI never displays an unknown count as a factual "0 followers"
 *  (M2 — truthful UI). */
export type FollowCountsStatus = 'loading' | 'error' | 'loaded';

export interface FollowCounts {
  followerCount: number;
  followingCount: number;
}

/** Co-Own holding merged with its market asset — the About-tab portfolio
 *  preview reads the preview fields; the rest rides along for the rail. */
export interface MyProfileCoOwnHolding {
  id: string;
  title: string;
  image: string;
  totalUnits: number;
  availableUnits: number;
  unitPriceGBP: number;
  unitPriceStable: number;
  settlementMode: CoOwnSettlementMode;
  issuerId: string;
  marketMovePct24h: number | null;
  holders: number;
  volume24hGBP: number | null;
  isOpen: boolean;
  yourUnits: number;
  avgEntryPriceGBP?: number;
  realizedProfitGBP?: number;
}

/** First missing identity facet → EditProfile focus target. */
export type CompletionFocus = 'avatar' | 'cover';
