'use client';

import Link from 'next/link';
import type { CoOwnRecourse } from '@/lib/contracts/coown';
import { formatDate } from '@/lib/utils/format';
import { gbp } from '../../format';
import { RuleHead } from './diligenceTypes';
import { VerificationDemandForm } from './VerificationDemandForm';

interface RecourseLiabilityAccordionProps {
  assetId: string;
  recourse: CoOwnRecourse | null;
  isLoading: boolean;
  isOpen: boolean;
  onToggle: () => void;
  isHolder: boolean;
}

export function RecourseLiabilityAccordion({
  assetId,
  recourse,
  isLoading,
  isOpen,
  onToggle,
  isHolder,
}: RecourseLiabilityAccordionProps) {
  return (
    <div>
      <RuleHead
        label="Recourse & liability"
        meta={
          recourse?.agreement
            ? `v${recourse.agreement.version} · ${recourse.agreement.status}`
            : isLoading
              ? 'Loading…'
              : 'No agreement on file'
        }
        open={isOpen}
        onToggle={onToggle}
      />
      {isOpen ? (
        <>
          <RecourseBody recourse={recourse} loading={isLoading} />
          {isHolder ? <VerificationDemandForm assetId={assetId} /> : null}
        </>
      ) : null}
    </div>
  );
}

function RecourseBody({
  recourse,
  loading,
}: {
  recourse: CoOwnRecourse | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-1.5 pb-4" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="skeleton h-9 rounded-sm" />
        ))}
      </div>
    );
  }
  if (!recourse) {
    // Guests (401) and failed reads land here — the record exists behind
    // auth, so say so rather than implying none exists.
    return (
      <p className="pb-4 text-body text-text-secondary">
        The recourse record is account-bound —{' '}
        <Link href="/auth" className="font-medium text-text-primary underline underline-offset-4">
          sign in
        </Link>{' '}
        to view the agreement, liability profile and demand history.
      </p>
    );
  }

  const { agreement, sellerLiability, verificationDemands, events } = recourse;
  const openDemands = verificationDemands.filter((d) => d.status === 'pending');

  return (
    <dl className="divide-y divide-border-subtle pb-4">
      {agreement ? (
        <>
          <div className="flex items-baseline justify-between gap-6 py-2">
            <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">
              Agreement
            </dt>
            <dd className="text-right text-body text-text-primary">
              v{agreement.version} · {agreement.status}
              <span className="text-text-secondary">
                {' '}· signed {formatDate(agreement.signedAt)}
              </span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-6 py-2">
            <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">
              Max liability
            </dt>
            <dd className="text-right text-body text-text-primary tnum">
              {gbp(agreement.maxLiabilityGbp)}
              {agreement.personalGuarantee ? (
                <span className="text-text-secondary"> · personal guarantee</span>
              ) : null}
            </dd>
          </div>
          {agreement.status !== 'active' && agreement.triggeredReason ? (
            <div className="flex items-baseline justify-between gap-6 py-2">
              <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">
                Triggered
              </dt>
              <dd className="text-right text-body text-text-primary">
                {agreement.triggeredReason}
                {agreement.triggeredAt ? (
                  <span className="text-text-secondary"> · {formatDate(agreement.triggeredAt)}</span>
                ) : null}
              </dd>
            </div>
          ) : null}
          {agreement.settledAmountGbp != null ? (
            <div className="flex items-baseline justify-between gap-6 py-2">
              <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">
                Settled
              </dt>
              <dd className="text-right text-body text-text-primary tnum">
                {gbp(agreement.settledAmountGbp)}
                {agreement.settledAt ? (
                  <span className="text-text-secondary"> · {formatDate(agreement.settledAt)}</span>
                ) : null}
              </dd>
            </div>
          ) : null}
        </>
      ) : (
        <div className="py-2">
          <dd className="text-body text-text-secondary">
            No recourse agreement on file for this asset.
          </dd>
        </div>
      )}
      {sellerLiability ? (
        <div className="flex items-baseline justify-between gap-6 py-2">
          <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">
            Seller profile
          </dt>
          <dd className="text-right text-body text-text-primary">
            {sellerLiability.riskTier} risk
            <span className="text-text-secondary">
              {' '}· background check {sellerLiability.backgroundCheckStatus}
            </span>
          </dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-6 py-2">
        <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">
          Verification demands
        </dt>
        <dd className="text-right text-body text-text-primary">
          {verificationDemands.length === 0
            ? 'None'
            : `${openDemands.length} open · ${verificationDemands.length} total`}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-6 py-2">
        <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">
          Recourse events
        </dt>
        <dd className="text-right text-body text-text-primary">
          {events.length === 0 ? 'None on record' : `${events.length} on record`}
        </dd>
      </div>
    </dl>
  );
}
