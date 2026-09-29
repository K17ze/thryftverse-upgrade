'use client';

/**
 * DueDiligenceSection — the market rules collectors check before buying,
 * as a quiet accordion: issuer, custody & condition, fees & settlement,
 * and the filed documents. Every line comes from the asset record or the
 * diligence profile — absent data fails closed, it is never dressed up.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import type {
  CoOwnAsset,
  CoOwnAssetRights,
  CoOwnRecourse,
  CoOwnRiskDisclosures,
  DueDiligenceProfile,
  DiligenceDocKind,
} from '@/lib/contracts/coown';
import { CO_OWN_FEE_RATE } from '@/lib/utils/trade';
import { DATA_MODE } from '@/lib/api/client';
import { useCoOwnRecourse } from '@/lib/hooks/coown-queries';
import { formatDate } from '@/lib/utils/format';
import { gbp, verificationLabel } from '../format';

const DOC_KIND: Record<DiligenceDocKind, string> = {
  authentication: 'Authentication',
  condition: 'Condition report',
  custody: 'Custody',
  insurance: 'Insurance',
  appraisal: 'Appraisal',
};

type RuleKey = 'issuer' | 'custody' | 'fees' | 'rights' | 'risks' | 'documents' | 'recourse';

const RISK_ROWS: { key: keyof Omit<CoOwnRiskDisclosures, 'publishedAt'>; label: string }[] = [
  { key: 'marketRisk', label: 'Market' },
  { key: 'liquidityRisk', label: 'Liquidity' },
  { key: 'custodyRisk', label: 'Custody' },
  { key: 'regulatoryRisk', label: 'Regulatory' },
  { key: 'counterpartyRisk', label: 'Counterparty' },
  { key: 'otherRisks', label: 'Other' },
];

const RIGHTS_ROWS: { key: keyof CoOwnAssetRights; label: string }[] = [
  { key: 'economicRights', label: 'Economic' },
  { key: 'votingRights', label: 'Voting' },
  { key: 'exitRights', label: 'Exit' },
  { key: 'feeRights', label: 'Fees' },
];

function DossierRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2">
      <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="text-right text-body text-text-primary">{value}</dd>
    </div>
  );
}

function DossierText({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2">
      <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-1 text-body text-text-primary">{value}</dd>
    </div>
  );
}

function RuleHead({
  label,
  meta,
  open,
  onToggle,
}: {
  label: string;
  meta: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="pressable flex min-h-[52px] w-full items-center gap-3 py-3 text-left"
    >
      <span className="flex-1 text-body-emphasis font-semibold text-text-primary">{label}</span>
      {meta ? <span className="truncate text-meta text-text-secondary">{meta}</span> : null}
      <Icon
        name="chevronDown"
        size={16}
        className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

export function DueDiligenceSection({
  asset,
  diligence,
}: {
  asset: CoOwnAsset;
  diligence: DueDiligenceProfile | null | undefined;
}) {
  const tierLabel = verificationLabel(asset.issuer.verificationTier);
  // Issuer open by default — identity is the first thing to verify.
  const [open, setOpen] = useState<RuleKey | null>('issuer');
  const toggle = (key: RuleKey) => setOpen((cur) => (cur === key ? null : key));
  // Recourse is an authenticated record — the query no-ops for guests
  // and in fixture mode, where nothing is rendered in its place.
  const recourseQ = useCoOwnRecourse(asset.id);
  const showRecourse = DATA_MODE === 'live';
  const recourse = recourseQ.data ?? null;
  // Detail-endpoint dossier — custody/authenticity/appraisal rows.
  const dossier = diligence?.dossier ?? null;
  // Published rights sheet + per-asset risk narrative — absent fields
  // stay absent; a section only renders when there's something to say.
  const rights = asset.rights ?? null;
  const risks = asset.riskDisclosures ?? null;
  const riskRows = risks ? RISK_ROWS.filter((r) => risks[r.key] != null) : [];

  const docs = diligence?.documents ?? [];
  const custodyMeta = asset.custodyNote ? asset.custodyNote.split('.')[0] : null;
  const feePct = `${Math.round(CO_OWN_FEE_RATE * 100)}%`;

  return (
    <section aria-labelledby="diligence-heading" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          id="diligence-heading"
          className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
        >
          Market rules
        </h3>
        {tierLabel ? (
          <Badge variant="trust" icon="verified">
            Issuer · {tierLabel}
          </Badge>
        ) : (
          <span className="text-meta text-text-muted">Issuer unverified</span>
        )}
      </div>

      {diligence === undefined ? (
        <div className="mt-3 space-y-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-11 rounded-sm" />
          ))}
        </div>
      ) : (
        <div className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
          {/* Issuer */}
          <div>
            <RuleHead
              label="Issuer"
              meta={`@${asset.issuer.username}`}
              open={open === 'issuer'}
              onToggle={() => toggle('issuer')}
            />
            {open === 'issuer' ? (
              <dl className="divide-y divide-border-subtle pb-4">
                <div className="flex items-baseline justify-between gap-6 py-2">
                  <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">Name</dt>
                  <dd className="text-right text-body text-text-primary">
                    {asset.issuer.displayName ?? `@${asset.issuer.username}`}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-6 py-2">
                  <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">Verification</dt>
                  <dd className="text-right text-body text-text-primary">
                    {tierLabel ?? 'Unverified — diligence file pending'}
                  </dd>
                </div>
                {asset.issuer.location ? (
                  <div className="flex items-baseline justify-between gap-6 py-2">
                    <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">Location</dt>
                    <dd className="text-right text-body text-text-primary">{asset.issuer.location}</dd>
                  </div>
                ) : null}
                {asset.issuerJurisdiction ? (
                  <div className="flex items-baseline justify-between gap-6 py-2">
                    <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">Jurisdiction</dt>
                    <dd className="text-right text-body text-text-primary">{asset.issuerJurisdiction}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>

          {/* Custody & condition */}
          <div>
            <RuleHead
              label="Custody & condition"
              meta={custodyMeta}
              open={open === 'custody'}
              onToggle={() => toggle('custody')}
            />
            {open === 'custody' ? (
              <dl className="divide-y divide-border-subtle pb-4">
                {asset.custodyNote ? (
                  <DossierText label="Custody" value={asset.custodyNote} />
                ) : null}
                <div className="py-2">
                  <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">Authentication</dt>
                  <dd className="mt-1 text-body text-text-primary">
                    {dossier?.authenticityStatus === 'verified' ? (
                      <>
                        Verified
                        {dossier.authenticityMethod ? (
                          <span className="text-text-secondary"> · {dossier.authenticityMethod}</span>
                        ) : null}
                        {diligence?.authenticatedAt ? (
                          <span className="text-text-secondary"> · {formatDate(diligence.authenticatedAt)}</span>
                        ) : null}
                      </>
                    ) : diligence?.authenticatedBy ? (
                      <>
                        {diligence.authenticatedBy}
                        {diligence.authenticatedAt ? (
                          <span className="text-text-secondary"> · {formatDate(diligence.authenticatedAt)}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-text-secondary">
                        <Icon name="clock" size={14} />
                        {dossier?.authenticityStatus === 'unverified'
                          ? 'Not yet authenticated'
                          : 'Authentication in progress'}
                      </span>
                    )}
                  </dd>
                </div>
                {diligence?.conditionSummary ? (
                  <DossierText
                    label={`Condition${diligence.conditionGrade ? ` · ${diligence.conditionGrade}` : ''}`}
                    value={diligence.conditionSummary}
                  />
                ) : null}
                {dossier?.custodianName ? (
                  <DossierRow
                    label="Custodian"
                    value={
                      dossier.custodianName +
                      (dossier.custodianLocation ? ` · ${dossier.custodianLocation}` : '')
                    }
                  />
                ) : null}
                {dossier?.custodyInsured ? (
                  <DossierRow
                    label="Insurance"
                    value={
                      (dossier.custodyInsurer ?? 'Insured custody') +
                      (dossier.custodyCoverageGbp != null
                        ? ` · ${gbp(dossier.custodyCoverageGbp)} cover`
                        : '')
                    }
                  />
                ) : null}
                {dossier?.appraisalValueGbp != null ? (
                  <DossierRow
                    label="Appraisal"
                    value={
                      gbp(dossier.appraisalValueGbp) +
                      (dossier.appraisalValuer ? ` · ${dossier.appraisalValuer}` : '') +
                      (dossier.appraisalValuedAt ? ` · ${formatDate(dossier.appraisalValuedAt)}` : '')
                    }
                  />
                ) : null}
                {dossier?.legalVehicleName ? (
                  <DossierRow
                    label="Legal vehicle"
                    value={
                      dossier.legalVehicleName +
                      (dossier.legalVehicleType ? ` · ${dossier.legalVehicleType}` : '')
                    }
                  />
                ) : null}
                {dossier?.escrowPartner ? (
                  <DossierRow label="Escrow" value={dossier.escrowPartner} />
                ) : null}
                {dossier?.safeguardingPartner ? (
                  <DossierRow label="Safeguarding" value={dossier.safeguardingPartner} />
                ) : null}
                {dossier?.buyerProtection ? (
                  <DossierText label="Buyer protection" value={dossier.buyerProtection} />
                ) : null}
              </dl>
            ) : null}
          </div>

          {/* Fees & settlement */}
          <div>
            <RuleHead
              label="Fees & settlement"
              meta={`${feePct} trading fee`}
              open={open === 'fees'}
              onToggle={() => toggle('fees')}
            />
            {open === 'fees' ? (
              <dl className="divide-y divide-border-subtle pb-4">
                <div className="flex items-baseline justify-between gap-6 py-2">
                  <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">Trading fee</dt>
                  <dd className="text-right text-body text-text-primary">
                    <span className="tnum">{feePct}</span>
                    <span className="text-text-secondary"> — added to buys, deducted from sale proceeds</span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-6 py-2">
                  <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">Settlement</dt>
                  <dd className="text-right text-body text-text-primary">1ZE — single-price clearing</dd>
                </div>
              </dl>
            ) : null}
          </div>

          {/* Rights — the published holder-rights sheet. */}
          {rights ? (
            <div>
              <RuleHead
                label="Your rights"
                meta={`${rights.rightsType} · v${rights.version}`}
                open={open === 'rights'}
                onToggle={() => toggle('rights')}
              />
              {open === 'rights' ? (
                <dl className="divide-y divide-border-subtle pb-4">
                  <DossierText label="Terms" value={rights.summaryTerms} />
                  {RIGHTS_ROWS.filter((r) => rights[r.key] != null).map((r) => (
                    <DossierText
                      key={r.key}
                      label={`${r.label} rights`}
                      value={rights[r.key] as string}
                    />
                  ))}
                  <DossierRow
                    label="Transferable"
                    value={
                      rights.transferable
                        ? `Yes${rights.minHoldingUnits > 0 ? ` · min ${rights.minHoldingUnits} units` : ''}`
                        : 'No'
                    }
                  />
                  <DossierRow
                    label="Governing law"
                    value={
                      rights.governingLaw ?? rights.jurisdiction
                    }
                  />
                </dl>
              ) : null}
            </div>
          ) : null}

          {/* Risks — the asset's own published risk narrative (distinct
              from the platform risk document the trade review gates on). */}
          {riskRows.length > 0 ? (
            <div>
              <RuleHead
                label="Risks"
                meta={`${riskRows.length} disclosed`}
                open={open === 'risks'}
                onToggle={() => toggle('risks')}
              />
              {open === 'risks' ? (
                <dl className="divide-y divide-border-subtle pb-4">
                  {riskRows.map((r) => (
                    <DossierText
                      key={r.key}
                      label={`${r.label} risk`}
                      value={risks![r.key] as string}
                    />
                  ))}
                </dl>
              ) : null}
            </div>
          ) : null}

          {/* Documents — flat rows, verified mark fails closed */}
          <div>
            <RuleHead
              label="Documents"
              meta={docs.length > 0 ? `${docs.length} on file` : 'None filed yet'}
              open={open === 'documents'}
              onToggle={() => toggle('documents')}
            />
            {open === 'documents' ? (
              docs.length > 0 ? (
                <ul className="divide-y divide-border-subtle pb-4">
                  {docs.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                      <Icon name="document" size={17} className="shrink-0 text-text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="clamp-1 text-body text-text-primary">{doc.title}</p>
                        <p className="mt-0.5 text-meta text-text-muted">
                          {DOC_KIND[doc.kind]} · {doc.issuer} · {formatDate(doc.issuedAt)}
                        </p>
                      </div>
                      {doc.verified ? (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 text-meta font-semibold text-commerce-trust"
                          title="Record verified"
                        >
                          <Icon name="verified" filled size={14} />
                          Verified
                        </span>
                      ) : (
                        <span className="shrink-0 text-meta text-text-muted">On file</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pb-4 text-body text-text-secondary">
                  No documents filed yet — the diligence file publishes before allocation.
                </p>
              )
            ) : null}
          </div>

          {/* Recourse — the seller's liability agreement and the demand/
              event trail. Live-only record: absent for guests it fails
              closed with a sign-in line, never with invented terms. */}
          {showRecourse ? (
            <div>
              <RuleHead
                label="Recourse & liability"
                meta={
                  recourse?.agreement
                    ? `v${recourse.agreement.version} · ${recourse.agreement.status}`
                    : recourseQ.isLoading
                      ? 'Loading…'
                      : 'No agreement on file'
                }
                open={open === 'recourse'}
                onToggle={() => toggle('recourse')}
              />
              {open === 'recourse' ? (
                <RecourseBody recourse={recourse} loading={recourseQ.isLoading} />
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
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
