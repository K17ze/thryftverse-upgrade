import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

/**
 * Canonical product reference kinds. Every surface that surfaces a product
 * (listing, co-own asset, auction, look tag, editorial) must resolve through
 * this helper so the user lands on the correct detail screen.
 *
 * This prevents the truth defect where Co-Own assets were routed to ItemDetail
 * (a direct-listing surface) instead of AssetDetail (the co-own trading
 * surface). See productDetailViewModel.ts `ListingFamily` for the source-of-
 * truth family classification.
 */
export type ProductReferenceKind = 'listing' | 'co_own' | 'auction' | 'look_tag' | 'editorial';

export interface ProductReference {
  referenceKind: ProductReferenceKind;
  canonicalId: string;
  /** Surface the navigation originated from (for analytics / debugging). */
  sourceSurface?: string;
  /** Originating item id, when the reference was surfaced from another item. */
  sourceItemId?: string;
}

/**
 * Resolve a ProductReference into a route + params pair. The param names match
 * the RootStackParamList declarations exactly:
 *   - ItemDetail   → { itemId: string }
 *   - AssetDetail  → { assetId: string }
 *   - AuctionDetail → { auctionId: string }
 */
export function resolveProductDestination(ref: ProductReference): {
  route: keyof RootStackParamList;
  params: Record<string, string>;
} {
  switch (ref.referenceKind) {
    case 'co_own':
      return { route: 'AssetDetail', params: { assetId: ref.canonicalId } };
    case 'auction':
      return { route: 'AuctionDetail', params: { auctionId: ref.canonicalId } };
    case 'listing':
    case 'look_tag':
    case 'editorial':
    default:
      return { route: 'ItemDetail', params: { itemId: ref.canonicalId } };
  }
}

/**
 * Navigate to the correct product detail screen for a given reference.
 * Drop-in replacement for ad-hoc `navigation.navigate('ItemDetail', ...)`
 * calls that bypassed the canonical resolver.
 */
export function openProductDetail(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  ref: ProductReference,
): void {
  const dest = resolveProductDestination(ref);
  // The route name is resolved dynamically from the reference kind, so we cast
  // to `any` to satisfy the overloaded `navigate` signature — the param names
  // are verified against RootStackParamList in resolveProductDestination.
  (navigation.navigate as any)(dest.route, dest.params);
}
