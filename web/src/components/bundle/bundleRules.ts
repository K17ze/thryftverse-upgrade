/**
 * Builder semantics — mirrors the mobile BundleBagScreen: a bundle is 2+
 * items from one seller posting together as a single parcel. This is the
 * parcel/selection threshold only — the discount tier belongs to
 * BUNDLE_RULE (lib/data/fixtures, 3+ items for 10% off) and every surface
 * reads it through sellerGroups/bundleProgressFor, so the two numbers
 * can never drift apart.
 */
export const BUNDLE_MIN_ITEMS = 2;
