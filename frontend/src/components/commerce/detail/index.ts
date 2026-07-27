/**
 * Shared product-detail primitives.
 *
 * These primitives establish one media-led detail grammar across the
 * three listing families (direct, auction, Co-Own). They enforce the
 * shape system from `02_SHARED_DETAIL_ARCHITECTURE.md`:
 *
 *   - page background carries the layout (not nested cards);
 *   - hairline dividers and whitespace for ordinary grouping;
 *   - strong card radius only for the transaction surface, critical
 *     state, or a true contained interactive module;
 *   - no nested cards;
 *   - no pill proliferation;
 *   - theme colours via `useAppTheme().colors` (no static `Colors`);
 *   - 44pt minimum hit targets with quiet visible chrome;
 *   - tabular numerals for prices, bids, units, percentages, countdowns;
 *   - missing values use muted copy, not a display-size em dash;
 *   - no `+0.0%` when change is unavailable.
 *
 * Existing screens consume these primitives in place — no V2 screens.
 */

export { CommerceDetailHeader } from './CommerceDetailHeader';
export { CommerceDetailIdentity } from './CommerceDetailIdentity';
export { CommerceDetailTransactionSurface } from './CommerceDetailTransactionSurface';
export { CommerceDetailMetricRow } from './CommerceDetailMetricRow';
export { CommerceDetailDisclosureRow } from './CommerceDetailDisclosureRow';
export { CommerceDetailSection } from './CommerceDetailSection';
export { CommerceDetailSellerRow } from './CommerceDetailSellerRow';
export { CommerceDetailUnavailableInline } from './CommerceDetailUnavailableInline';
export { CommerceDetailStateDock } from './CommerceDetailStateDock';
export { CommerceDetailMediaRail } from './CommerceDetailMediaRail';
export type {
  CommerceDetailFamily,
  CommerceDetailSectionVariant,
  CommerceDetailIdentityDensity,
  CommerceDetailDockLayout,
} from './types';
