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
  condition: 'New with tags' | 'Very good' | 'Good' | 'Satisfactory';
  price: number;
  originalPrice?: number;
  priceWithProtection?: number;
  images: string[];
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
  isSold?: boolean;
  status?: 'draft' | 'active' | 'paused' | 'reserved' | 'sold' | 'deleted' | 'removed' | 'unknown';
  sellerId: string;
  seller?: ListingSeller | null;
  category: string;
  subcategory?: string | null;
  description: string;
  createdAt?: string;
  shippingMethod?: string | null;
  shippingPayer?: string | null;
}
