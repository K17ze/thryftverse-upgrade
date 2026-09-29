'use client';

/**
 * Step 5 — the issuance summary. Every row reads straight from the draft
 * as it will serialise on the wire (blank optionals show '—', never a
 * fabricated default beyond the server's own naming/fallbacks), and the
 * 1ZE rate is stated honestly — USD-par at the indicative GBP rate.
 */

import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { GBP_PER_USD, formatIze } from '@/components/wallet/convertViewModel';
import { unitPriceStableFor } from '@/lib/api/services/coownIssuance';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';
import {
  LEGAL_VEHICLE_LABELS,
  parseMoney,
  parseUnits,
  type IssueDraft,
} from './issueDraft';

interface ReviewStepProps {
  draft: IssueDraft;
  listing: Listing;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border-subtle py-2.5 last:border-b-0">
      <span className="shrink-0 text-caption text-text-muted">{label}</span>
      <span className="min-w-0 text-right text-body text-text-primary">{value}</span>
    </div>
  );
}

export function ReviewStep({ draft, listing }: ReviewStepProps) {
  const units = parseUnits(draft.totalUnits);
  const unitPrice = parseMoney(draft.unitPriceGbp);
  const implied = Number.isFinite(units) && Number.isFinite(unitPrice)
    ? units * unitPrice
    : null;
  const unitStable = unitPriceStableFor(unitPrice);
  const poolTitle = draft.title.trim() || `${listing.title} Fraction Pool`;

  const vehicleBits = [
    LEGAL_VEHICLE_LABELS[draft.legalVehicleType] ?? draft.legalVehicleType,
    draft.legalVehicleType !== 'none' ? draft.legalVehicleName.trim() || null : null,
    draft.legalVehicleType !== 'none' ? draft.legalVehicleJurisdiction.trim() || null : null,
  ].filter(Boolean);

  const custodian = [
    draft.custodianName.trim() || null,
    draft.custodianLocation.trim() || null,
  ].filter(Boolean);

  const insurance = draft.custodyInsured
    ? [
        draft.custodyInsurer.trim() || 'Insurer unnamed',
        draft.custodyPolicyRef.trim() ? `ref ${draft.custodyPolicyRef.trim()}` : null,
        draft.custodyCoverageGbp.trim()
          ? `${formatPrice(parseMoney(draft.custodyCoverageGbp))} cover`
          : null,
      ].filter(Boolean)
    : null;

  const appraisal = [
    draft.appraisalValueGbp.trim()
      ? formatPrice(parseMoney(draft.appraisalValueGbp))
      : null,
    draft.appraisalValuedAt
      ? new Date(draft.appraisalValuedAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : null,
    draft.appraisalValuer.trim() || null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-5">
      {/* Issued asset preview */}
      <div className="flex items-center gap-3 border-b border-border-subtle pb-5">
        <AppImage
          src={getListingCoverUri(listing.images)}
          alt=""
          width={48}
          height={60}
          sizes="48px"
          className="h-[60px] w-12 shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <p className="clamp-1 text-body-emphasis font-medium text-text-primary">
            {poolTitle}
          </p>
          <p className="mt-0.5 text-caption text-text-muted">Co-Own issuance</p>
        </div>
      </div>

      <div>
        <Row label="Backing listing" value={listing.title} />
        <Row
          label="Units"
          value={
            Number.isFinite(units) ? (
              <span className="tnum">{units}</span>
            ) : (
              '—'
            )
          }
        />
        <Row
          label="Unit price"
          value={
            Number.isFinite(unitPrice) && unitPrice > 0 ? (
              <>
                <span className="tnum">{formatPrice(unitPrice)}</span>
                {unitStable > 0 ? (
                  <span className="text-text-muted"> · {formatIze(unitStable)} 1ZE</span>
                ) : null}
              </>
            ) : (
              '—'
            )
          }
        />
        <Row
          label="Implied valuation"
          value={
            implied != null ? (
              <span className="tnum font-semibold">{formatPrice(implied)}</span>
            ) : (
              '—'
            )
          }
        />
        <Row label="Settlement" value="1ZE · ONEZE" />
        <Row label="Legal vehicle" value={vehicleBits.join(' · ') || '—'} />
        <Row
          label="Your jurisdiction"
          value={draft.issuerJurisdiction.trim() || '—'}
        />
        <Row label="Custodian" value={custodian.join(' · ') || '—'} />
        <Row
          label="Custody insurance"
          value={insurance ? insurance.join(' · ') : 'Not declared'}
        />
        <Row
          label="Authenticity"
          value={[
            draft.authenticityStatus === 'pending' ? 'Pending review' : 'Unverified',
            draft.authenticityMethod.trim() || null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        <Row label="Condition" value={draft.conditionGrade.trim() || '—'} />
        <Row label="Appraisal" value={appraisal.join(' · ') || '—'} />
        <Row
          label="Buyer protection"
          value={
            draft.buyerProtection
              ? draft.buyerProtectionTermsUrl.trim()
                ? 'Declared · terms linked'
                : 'Declared'
              : 'Not declared'
          }
        />
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-4">
        <p className="text-caption text-text-secondary">
          Issuing pauses the listing while the pool is open — the item can&apos;t sell
          twice. Units trade against the 1ZE balance, quoted at 1 1ZE = $
          1 (indicative £{GBP_PER_USD.toFixed(2)} per $1).
        </p>
        <p className="text-meta text-text-muted">
          Verified authenticity is awarded by platform review after issuance.
        </p>
      </div>
    </div>
  );
}
