'use client';

/**
 * DueDiligenceSection — the market rules collectors check before buying,
 * as a quiet accordion: custody & condition, fees & settlement, and the
 * filed documents. Every line comes from the asset record or the
 * diligence profile — absent data fails closed, it is never dressed up.
 * Issuer identity renders once on this surface (the Ownership tab's rich
 * card) plus the header's compact row — it is not restated here.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
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
import type { CoOwnVerificationDemandType } from '@/lib/api/services/coown';
import {
  useCoOwnPositions,
  useCoOwnRecourse,
  useCoOwnTrustActions,
} from '@/lib/hooks/coown-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { formatDate } from '@/lib/utils/format';
import { gbp, verificationLabel } from '../format';

const DOC_KIND: Record<DiligenceDocKind, string> = {
  authentication: 'Authentication',
  condition: 'Condition report',
  custody: 'Custody',
  insurance: 'Insurance',
  appraisal: 'Appraisal',
};

type RuleKey =
  | 'custody'
  | 'fees'
  | 'rights'
  | 'risks'
  | 'documents'
  | 'audit'
  | 'recourse';

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

/** Filed document links on the detail wire — the only "documents" a live
 *  asset can carry (the lab-doc rows are fixture-authored). Null means
 *  nothing filed; the row simply doesn't render. */
const DOSSIER_DOC_LINKS: {
  key: 'escrowTermsUrl' | 'safeguardingTermsUrl' | 'safeguardingEvidenceUrl' | 'buyerProtectionTermsUrl';
  label: string;
}[] = [
  { key: 'escrowTermsUrl', label: 'Escrow terms' },
  { key: 'safeguardingTermsUrl', label: 'Safeguarding terms' },
  { key: 'safeguardingEvidenceUrl', label: 'Safeguarding evidence' },
  { key: 'buyerProtectionTermsUrl', label: 'Buyer protection terms' },
];



/** 'buyout_offer_created' → 'Buyout offer created'. */
function humaniseEventType(eventType: string): string {
  const words = eventType.replace(/[_.\-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

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
  // Custody open by default — authentication is the first thing to verify.
  const [open, setOpen] = useState<RuleKey | null>('custody');
  const toggle = (key: RuleKey) => setOpen((cur) => (cur === key ? null : key));
  // Recourse is an authenticated record — the query no-ops for guests
  // and in fixture mode, where nothing is rendered in its place.
  const recourseQ = useCoOwnRecourse(asset.id);
  const showRecourse = DATA_MODE === 'live';
  const recourse = recourseQ.data ?? null;
  // Actionable trust affordances — live wire only, and only on the side
  // the server enforces: the issuer refreshes the appraisal, a holder
  // (units > 0, never the issuer) demands verification. Fixture mode has
  // no write path, so both stay hidden.
  const { user } = useSession();
  const { data: positions } = useCoOwnPositions();
  const isIssuer =
    DATA_MODE === 'live' && user != null && user.id === asset.issuer.id;
  const isHolder =
    DATA_MODE === 'live' &&
    !isIssuer &&
    (positions?.find((p) => p.assetId === asset.id)?.units ?? 0) > 0;
  // Detail-endpoint dossier — custody/authenticity/appraisal rows.
  const dossier = diligence?.dossier ?? null;
  // Published rights sheet + per-asset risk narrative — absent fields
  // stay absent; a section only renders when there's something to say.
  const rights = asset.rights ?? null;
  const risks = asset.riskDisclosures ?? null;
  const riskRows = risks ? RISK_ROWS.filter((r) => risks[r.key] != null) : [];

  const docs = diligence?.documents ?? [];
  const custodyMeta = asset.custodyNote ? asset.custodyNote.split('.')[0] : null;
  // Platform trading fee — the detail wire's own rate where it exists;
  // the fixture constant stays because fixture orders really charge it.
  const feeRate = dossier?.tradingFeeRate ?? CO_OWN_FEE_RATE;
  const feePct = `${Number((feeRate * 100).toFixed(2))}%`;
  // Issuer-filed fee schedule — every field nullable; absent stays absent.
  const feeScheduleRows = (
    dossier?.feeSchedule
      ? [
          { label: 'Management fee', value: dossier.feeSchedule.managementFeePct, fmt: 'pct' },
          { label: 'Performance fee', value: dossier.feeSchedule.performanceFeePct, fmt: 'pct' },
          { label: 'Platform fee', value: dossier.feeSchedule.platformFeePct, fmt: 'pct' },
          { label: 'Sourcing fee', value: dossier.feeSchedule.sourcingFeeGbp, fmt: 'gbp' },
        ]
      : []
  ).filter(
    (r): r is { label: string; value: number; fmt: 'pct' | 'gbp' } => r.value != null,
  );
  // Filed terms links (live wire only — fixtures file lab docs instead).
  const docLinks = DOSSIER_DOC_LINKS.flatMap((l) =>
    dossier?.[l.key] ? [{ href: dossier[l.key] as string, label: l.label }] : [],
  );
  const docCount = docs.length + docLinks.length;
  // Trust + public market audit events — one merged, newest-first trail.
  const auditEvents = [
    ...(dossier?.trustAuditEvents ?? []).map((e) => ({
      eventType: e.eventType,
      createdAt: e.createdAt,
      changedByLabel: e.changedByLabel ?? null,
    })),
    ...(dossier?.marketAuditEvents ?? []).map((e) => ({
      eventType: e.eventType,
      createdAt: e.createdAt,
      changedByLabel: null as string | null,
    })),
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 12);

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
          {/* Custody & condition */}
          <div>
            <RuleHead
              label="Custody & condition"
              meta={custodyMeta}
              open={open === 'custody'}
              onToggle={() => toggle('custody')}
            />
            {open === 'custody' ? (
              <>
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
                {dossier?.buyerProtection != null ? (
                  <DossierRow
                    label="Buyer protection"
                    value={dossier.buyerProtection ? 'Covered' : 'Not covered'}
                  />
                ) : null}
                </dl>
                {isIssuer ? (
                  <RefreshAppraisalAffordance
                    assetId={asset.id}
                    currentValuer={dossier?.appraisalValuer ?? null}
                  />
                ) : null}
              </>
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
                {feeScheduleRows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-6 py-2">
                    <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">
                      {row.label}
                    </dt>
                    <dd className="text-right text-body text-text-primary tnum">
                      {row.fmt === 'pct' ? `${row.value}%` : gbp(row.value)}
                    </dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-6 py-2">
                  <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">Settlement</dt>
                  <dd className="text-right text-body text-text-primary">
                    1ZE — single-price clearing
                    {dossier?.settlementEtaHours != null ? (
                      <span className="text-text-secondary"> · ~{dossier.settlementEtaHours}h</span>
                    ) : null}
                  </dd>
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
                  {rights.tbcReason || rights.tbcEtaDate ? (
                    <div className="py-2">
                      <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">
                        To be confirmed
                      </dt>
                      <dd className="mt-1 text-body text-text-secondary">
                        {[
                          rights.tbcReason,
                          rights.tbcEtaDate ? `expected ${formatDate(rights.tbcEtaDate)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </dd>
                    </div>
                  ) : null}
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

          {/* Documents — fixture lab-doc rows plus the filed terms links
              the live wire carries (escrow / safeguarding / buyer
              protection). Verified mark fails closed. */}
          <div>
            <RuleHead
              label="Documents"
              meta={docCount > 0 ? `${docCount} on file` : 'None filed yet'}
              open={open === 'documents'}
              onToggle={() => toggle('documents')}
            />
            {open === 'documents' ? (
              docCount > 0 ? (
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
                  {docLinks.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pressable flex items-center gap-3 py-2.5 first:pt-0"
                      >
                        <Icon name="document" size={17} className="shrink-0 text-text-muted" />
                        <div className="min-w-0 flex-1">
                          <p className="clamp-1 text-body text-text-primary">{link.label}</p>
                          <p className="mt-0.5 text-meta text-text-muted">
                            Filed terms — opens externally
                          </p>
                        </div>
                        <Icon name="forward" size={15} className="shrink-0 text-text-muted" />
                      </a>
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

          {/* Audit trail — trust-dossier changes and public market audit
              events merged newest-first. Omitted entirely when the wire
              carries no events. */}
          {auditEvents.length > 0 ? (
            <div>
              <RuleHead
                label="Audit trail"
                meta={`${auditEvents.length} ${auditEvents.length === 1 ? 'event' : 'events'}`}
                open={open === 'audit'}
                onToggle={() => toggle('audit')}
              />
              {open === 'audit' ? (
                <ul className="divide-y divide-border-subtle pb-4">
                  {auditEvents.map((e, i) => (
                    <li
                      key={`${e.eventType}-${e.createdAt}-${i}`}
                      className="flex items-baseline justify-between gap-6 py-2"
                    >
                      <span className="text-body text-text-primary">
                        {humaniseEventType(e.eventType)}
                        {e.changedByLabel ? (
                          <span className="text-text-secondary"> · {e.changedByLabel}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-meta text-text-muted">
                        {formatDate(e.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

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
                <>
                  <RecourseBody recourse={recourse} loading={recourseQ.isLoading} />
                  {isHolder ? (
                    <VerificationDemandAffordance assetId={asset.id} />
                  ) : null}
                </>
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

// ── Trust affordances — live-only, role-gated by the caller ────────────
// The role checks upstream are display-only: both endpoints re-enforce
// issuer/holder on the wire, and a refusal renders verbatim.

const FIELD_CLASS =
  'mt-1.5 h-11 w-full rounded-lg bg-input px-3 text-body-emphasis text-input-text outline-none focus:ring-2 focus:ring-text-primary';
const LABEL_CLASS =
  'text-meta font-semibold uppercase tracking-wide text-text-muted';

/** Issuer-only: file a fresh third-party appraisal — the response
 *  replaces the dossier figures on the invalidated asset/diligence reads
 *  and writes a public audit event. */
function RefreshAppraisalAffordance({
  assetId,
  currentValuer,
}: {
  assetId: string;
  currentValuer: string | null;
}) {
  const { refreshAppraisal } = useCoOwnTrustActions(assetId);
  const [open, setOpen] = useState(false);
  const [valuer, setValuer] = useState('');
  const [valueText, setValueText] = useState('');
  const [notes, setNotes] = useState('');

  const value = Number(valueText);
  const canSubmit =
    valuer.trim().length >= 2 &&
    valueText !== '' &&
    Number.isFinite(value) &&
    value >= 0 &&
    !refreshAppraisal.isPending;
  const error = refreshAppraisal.isError
    ? refreshAppraisal.error instanceof Error
      ? refreshAppraisal.error.message
      : 'Could not record the appraisal'
    : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    refreshAppraisal.mutate(
      {
        appraisalValueGbp: Math.round(value * 100) / 100,
        appraisalValuer: valuer.trim(),
        appraisalNotes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setValueText('');
          setNotes('');
        },
      },
    );
  };

  if (!open) {
    return (
      <div className="pb-4">
        <Button
          size="sm"
          variant="outline"
          icon="refresh"
          onClick={() => setOpen(true)}
        >
          Refresh appraisal
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Refresh appraisal"
      className="space-y-3 border-t border-border-subtle pb-4 pt-3"
    >
      <div>
        <label htmlFor="appraisal-valuer" className={LABEL_CLASS}>
          Valuer
        </label>
        <input
          id="appraisal-valuer"
          value={valuer}
          onChange={(e) => setValuer(e.target.value)}
          placeholder={currentValuer ?? 'Appraisal firm or valuer'}
          maxLength={180}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label htmlFor="appraisal-value" className={LABEL_CLASS}>
          Appraised value · GBP
        </label>
        <input
          id="appraisal-value"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={valueText}
          onChange={(e) => setValueText(e.target.value)}
          className={`${FIELD_CLASS} tnum`}
        />
      </div>
      <div>
        <label htmlFor="appraisal-note" className={LABEL_CLASS}>
          Note <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          id="appraisal-note"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={4000}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {refreshAppraisal.isPending ? 'Recording…' : 'Record appraisal'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="quiet"
          onClick={() => setOpen(false)}
          disabled={refreshAppraisal.isPending}
        >
          Cancel
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-meta text-danger-text">
          {error}
        </p>
      ) : null}
    </form>
  );
}

const DEMAND_TYPES: { value: CoOwnVerificationDemandType; label: string }[] = [
  { value: 'authenticity', label: 'Authenticity' },
  { value: 'possession', label: 'Possession' },
  { value: 'condition', label: 'Condition' },
  { value: 'inspection', label: 'Inspection' },
];

/** Holder-only: demand the custodian prove the asset. The seller is
 *  notified and the deadline (server default 14 days) starts on post —
 *  the recourse query invalidation lands the demand on the dossier. */
function VerificationDemandAffordance({ assetId }: { assetId: string }) {
  const { demandVerification } = useCoOwnTrustActions(assetId);
  const [open, setOpen] = useState(false);
  const [demandType, setDemandType] =
    useState<CoOwnVerificationDemandType>('authenticity');
  const [notes, setNotes] = useState('');
  const sent = demandVerification.isSuccess;

  const error = demandVerification.isError
    ? demandVerification.error instanceof Error
      ? demandVerification.error.message
      : 'Could not send the demand'
    : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (demandVerification.isPending) return;
    demandVerification.mutate(
      { demandType, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setNotes('');
        },
      },
    );
  };

  if (!open) {
    return (
      <div className="border-t border-border-subtle pb-4 pt-3">
        <Button
          size="sm"
          variant="outline"
          icon="scan"
          onClick={() => setOpen(true)}
        >
          Request verification
        </Button>
        {sent ? (
          <p className="mt-2 text-meta text-text-secondary">
            Demand sent — the deadline is on record.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Request verification"
      className="space-y-3 border-t border-border-subtle pb-4 pt-3"
    >
      <div>
        <span className={LABEL_CLASS}>Demand type</span>
        <div className="mt-1.5">
          <SegmentedControl
            options={DEMAND_TYPES}
            value={demandType}
            onChange={setDemandType}
            className="flex-wrap gap-y-1"
          />
        </div>
      </div>
      <div>
        <label htmlFor="demand-note" className={LABEL_CLASS}>
          Note <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          id="demand-note"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={4000}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>
      <p className="text-meta text-text-muted">
        The seller is notified and has 14 days to respond — an unanswered
        demand can trigger recourse.
      </p>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={demandVerification.isPending}>
          {demandVerification.isPending ? 'Sending…' : 'Send demand'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="quiet"
          onClick={() => setOpen(false)}
          disabled={demandVerification.isPending}
        >
          Cancel
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-meta text-danger-text">
          {error}
        </p>
      ) : null}
    </form>
  );
}
