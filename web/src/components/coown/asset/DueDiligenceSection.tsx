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
import { Badge } from '@/components/ui/Badge';
import type {
  CoOwnAsset,
  DueDiligenceProfile,
} from '@/lib/contracts/coown';
import { CO_OWN_FEE_RATE } from '@/lib/utils/trade';
import { DATA_MODE } from '@/lib/api/client';
import {
  useCoOwnPositions,
  useCoOwnRecourse,
} from '@/lib/hooks/coown-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { verificationLabel } from '../format';
import {
  DOSSIER_DOC_LINKS,
  type RuleKey,
} from './diligence/diligenceTypes';
import { CustodyConditionAccordion } from './diligence/CustodyConditionAccordion';
import { FeesRightsRisksAccordions } from './diligence/FeesRightsRisksAccordions';
import { DocumentsAuditAccordions } from './diligence/DocumentsAuditAccordions';
import { RecourseLiabilityAccordion } from './diligence/RecourseLiabilityAccordion';

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
  const docs = diligence?.documents ?? [];

  // Platform trading fee — the detail wire's own rate where it exists;
  // the fixture constant stays because fixture orders really charge it.
  const feeRate = dossier?.tradingFeeRate ?? CO_OWN_FEE_RATE;
  const feePct = `${Number((feeRate * 100).toFixed(2))}%`;

  // Issuer-filed fee schedule — every field nullable; absent stays absent.
  const feeScheduleRows = (
    dossier?.feeSchedule
      ? [
          { label: 'Management fee', value: dossier.feeSchedule.managementFeePct, fmt: 'pct' as const },
          { label: 'Performance fee', value: dossier.feeSchedule.performanceFeePct, fmt: 'pct' as const },
          { label: 'Platform fee', value: dossier.feeSchedule.platformFeePct, fmt: 'pct' as const },
          { label: 'Sourcing fee', value: dossier.feeSchedule.sourcingFeeGbp, fmt: 'gbp' as const },
        ]
      : []
  ).filter(
    (r): r is { label: string; value: number; fmt: 'pct' | 'gbp' } => r.value != null,
  );

  // Filed terms links (live wire only — fixtures file lab docs instead).
  const docLinks = DOSSIER_DOC_LINKS.flatMap((l) =>
    dossier?.[l.key] ? [{ href: dossier[l.key] as string, label: l.label }] : [],
  );

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
          <CustodyConditionAccordion
            asset={asset}
            diligence={diligence}
            isOpen={open === 'custody'}
            onToggle={() => toggle('custody')}
            isIssuer={isIssuer}
          />

          <FeesRightsRisksAccordions
            asset={asset}
            diligence={diligence}
            open={open}
            onToggle={toggle}
            feePct={feePct}
            feeScheduleRows={feeScheduleRows}
          />

          <DocumentsAuditAccordions
            docs={docs}
            docLinks={docLinks}
            auditEvents={auditEvents}
            open={open}
            onToggle={toggle}
          />

          {showRecourse ? (
            <RecourseLiabilityAccordion
              assetId={asset.id}
              recourse={recourse}
              isLoading={recourseQ.isLoading}
              isOpen={open === 'recourse'}
              onToggle={() => toggle('recourse')}
              isHolder={isHolder}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
