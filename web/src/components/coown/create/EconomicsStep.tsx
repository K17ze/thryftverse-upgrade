'use client';

/**
 * Step 2 — units and price. The issuance cap comes from the server's
 * /co-own/policy read (useCoOwnPolicy); the fallback constant only shows
 * when that read fails, and says so. The implied valuation and the 1ZE
 * conversion preview what the wire will carry.
 */

import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { SellField, INPUT_CLASS, INPUT_ERROR_CLASS } from '@/components/sell/SellField';
import { GBP_PER_USD, formatIze } from '@/components/wallet/convertViewModel';
import { unitPriceStableFor } from '@/lib/api/services/coownIssuance';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';
import {
  parseMoney,
  parseUnits,
  sanitizeDecimal,
  sanitizeInteger,
  type IssueDraft,
  type IssueFieldErrors,
} from './issueDraft';

interface EconomicsStepProps {
  draft: IssueDraft;
  listing: Listing;
  maxUnits: number;
  /** True when /co-own/policy failed and maxUnits is the fallback. */
  policyUnavailable: boolean;
  errors: IssueFieldErrors;
  onPatch: (patch: Partial<IssueDraft>) => void;
  clearError: (field: keyof IssueDraft) => void;
}

export function EconomicsStep({
  draft,
  listing,
  maxUnits,
  policyUnavailable,
  errors,
  onPatch,
  clearError,
}: EconomicsStepProps) {
  const units = parseUnits(draft.totalUnits);
  const unitPrice = parseMoney(draft.unitPriceGbp);
  const validUnits = Number.isFinite(units) && units >= 1;
  const validPrice = Number.isFinite(unitPrice) && unitPrice > 0;
  const impliedGbp = validUnits && validPrice ? units * unitPrice : null;
  const unitStable = validPrice ? unitPriceStableFor(unitPrice) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Backing listing context — the numbers stay anchored to the item. */}
      <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
        <AppImage
          src={getListingCoverUri(listing.images)}
          alt=""
          width={36}
          height={45}
          sizes="36px"
          className="h-[45px] w-9 shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <p className="clamp-1 text-body text-text-primary">{listing.title}</p>
          <p className="tnum text-caption text-text-muted">
            Listed at {formatPrice(listing.price)}
          </p>
        </div>
      </div>

      <SellField
        id="issue-units"
        label="Total units"
        required
        done={validUnits && units <= maxUnits}
        error={errors.totalUnits}
        hint={
          policyUnavailable
            ? `Up to ${maxUnits} units — showing the default cap; the live policy couldn't be loaded.`
            : `Up to ${maxUnits} units per issuance.`
        }
      >
        <input
          id="issue-units"
          value={draft.totalUnits}
          onChange={(e) => {
            onPatch({ totalUnits: sanitizeInteger(e.target.value) });
            clearError('totalUnits');
          }}
          inputMode="numeric"
          placeholder="10"
          aria-invalid={!!errors.totalUnits}
          className={`${INPUT_CLASS} tnum ${errors.totalUnits ? INPUT_ERROR_CLASS : ''}`}
        />
      </SellField>

      <SellField
        id="issue-unit-price"
        label="Unit price"
        required
        done={validPrice}
        error={errors.unitPriceGbp}
        hint={
          unitStable != null
            ? `≈ ${formatIze(unitStable)} 1ZE per unit — 1ZE is USD-par, priced at the indicative £${GBP_PER_USD.toFixed(2)} per $1.`
            : 'What one unit of the pool costs.'
        }
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
            £
          </span>
          <input
            id="issue-unit-price"
            value={draft.unitPriceGbp}
            onChange={(e) => {
              onPatch({ unitPriceGbp: sanitizeDecimal(e.target.value) });
              clearError('unitPriceGbp');
            }}
            inputMode="decimal"
            placeholder="0.00"
            aria-invalid={!!errors.unitPriceGbp}
            className={`${INPUT_CLASS} tnum pl-8 ${errors.unitPriceGbp ? INPUT_ERROR_CLASS : ''}`}
          />
        </div>
      </SellField>

      {impliedGbp != null ? (
        <p className="border-t border-border-subtle pt-4 text-body text-text-secondary">
          Implied valuation{' '}
          <span className="tnum font-semibold text-text-primary">
            {formatPrice(impliedGbp)}
          </span>{' '}
          <span className="text-text-muted">
            · {units} × {formatPrice(unitPrice)}
          </span>
        </p>
      ) : null}
    </div>
  );
}
