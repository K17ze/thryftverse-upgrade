/**
 * Corporate action display helpers — shared between AssetDetailScreen
 * and AssetOwnershipSection.
 *
 * All helpers fail closed: null/missing values produce undefined or
 * em-dash labels, never fabricated values.
 */

import { formatCoOwnIze } from '../../../utils/currency';
import type { CoOwnCorporateAction } from '../../../services/marketApi';

/** Format an ISO date as "12 Mar" (en-GB). */
export function formatDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Format an ISO date as "12 Mar 2025" (en-GB). */
export function corporateActionDateLabel(action: CoOwnCorporateAction): string {
  const source = action.payableDate ?? action.recordDate ?? action.exDate ?? action.createdAt;
  return new Date(source).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Format the per-unit value as a signed GBP label, or undefined when not set. */
export function corporateActionAmountLabel(action: CoOwnCorporateAction): string | undefined {
  if (action.perUnitValueGbpMinor == null) return undefined;
  const major = action.perUnitValueGbpMinor / 100;
  return `${major >= 0 ? '+' : ''}${formatCoOwnIze(major)}`;
}
