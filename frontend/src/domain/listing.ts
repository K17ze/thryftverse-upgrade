import type { ListingCondition } from '../contracts/taxonomy';
import type { ListingMediaRecord } from '../contracts/listingMedia';

export interface ListingSeller {
  id: string;
  username: string | null;
  avatar: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  location?: string | null;
  verified?: boolean | null;
}

export interface Listing {
  id: string;
  title: string;
  brand: string | null;
  size: string | null;
  condition: ListingCondition;
  price: number;
  originalPrice?: number;
  priceWithProtection?: number;
  images: string[];
  /** Canonical media records (derivatives, blurhash/LQIP, focal point,
   *  poster). Present when the source endpoint serves the media contract —
   *  prefer over `images` for placeholders and sized renditions. */
  media?: ListingMediaRecord[];
  /**
   * Width divided by height for the primary media asset. Backends should
   * provide this when known so discovery grids can reserve the final frame
   * before the image downloads and avoid visible layout shifts.
   */
  mediaAspectRatio?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  likes: number;
  views?: number;
  isBumped?: boolean;
  /**
   * Paid-placement marker — true only when the backend stamped this listing
   * as a promoted ("Sponsored") slot. The client never infers sponsorship.
   */
  promoted?: boolean;
  /**
   * Server-generated disclosure label (e.g. "Sponsored"). Rendered verbatim
   * only when present — never synthesised from `promoted` or `isBumped`.
   */
  disclosure?: string | null;
  /**
   * Promotion id on promoted units only — posted to /promotions/:id/click on
   * tap-through so seller stats count real taps. Never present organically.
   */
  promotionId?: string | null;
  isSold?: boolean;
  status?: 'draft' | 'active' | 'paused' | 'reserved' | 'sold' | 'deleted' | 'removed' | 'unknown';
  sellerId: string;
  seller?: ListingSeller | null;
  category: string;
  subcategory?: string | null;
  description: string;
  createdAt?: string;
  /** Live-auction end timestamp when the listing has one — server-sourced,
   *  drives truthful 'Ending soon' ordering. Null/absent otherwise. */
  auctionEndsAt?: string | null;
  shippingMethod?: string | null;
  shippingPayer?: string | null;
  /** Pinned/featured listing — shown first in the Shop grid when true. */
  featured?: boolean | null;
  /** Backend-computed sustainability grade (A/B/C/D). Null when no impact data available (fail-closed). */
  sustainabilityGrade?: 'A' | 'B' | 'C' | 'D' | null;
  /** Material composition (e.g. "cotton") — drives impact calculations when present. */
  materialComposition?: string | null;
  /** Item weight in kg — drives impact calculations when present. */
  weightKg?: number | null;
}
