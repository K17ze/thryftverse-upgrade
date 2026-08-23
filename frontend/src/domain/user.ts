export interface User {
  id: string;
  username: string;
  avatar: string;
  coverPhoto?: string;
  rating: number;
  reviewCount: number;
  location: string;
  followers: number;
  following: number;
  isVerified: boolean;
  badges: string[];
  lastSeen: string;
  listingCount: number;
  bio?: string;
  website?: string;
  /** Identity/KYC verification — separate from email verification. */
  identityVerified?: boolean;
  /** Seller standards verification — separate from email/identity. */
  sellerVerified?: boolean;
  /** Computed trust level from backend — drives trust badges. */
  trustLevel?: 'none' | 'email' | 'identity' | 'seller';
}
