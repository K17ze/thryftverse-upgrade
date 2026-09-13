import type { HydratedLookTag } from '../look/LookHotspots';
import type { ProductReference } from '../../platform/product/openProductDetail';

/** Resolve a hydrated tag into a canonical ProductReference, or null when no
 *  id is available to navigate on. */
export function tagToReference(tag: HydratedLookTag, lookId: string): ProductReference | null {
  if (tag.assetId) {
    return { referenceKind: 'co_own', canonicalId: tag.assetId, sourceSurface: 'LookDetail', sourceItemId: lookId };
  }
  if (tag.listingId) {
    return { referenceKind: 'listing', canonicalId: tag.listingId, sourceSurface: 'LookDetail', sourceItemId: lookId };
  }
  return null;
}
