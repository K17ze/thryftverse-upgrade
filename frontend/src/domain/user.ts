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
}
