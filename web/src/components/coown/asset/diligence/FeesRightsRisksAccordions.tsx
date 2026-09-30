'use client';

import type { CoOwnAsset, DueDiligenceProfile } from '@/lib/contracts/coown';
import { formatDate } from '@/lib/utils/format';
import { gbp } from '../../format';
import {
  DossierRow,
  DossierText,
  RIGHTS_ROWS,
  RISK_ROWS,
  RuleHead,
  type RuleKey,
} from './diligenceTypes';

interface FeesRightsRisksAccordionsProps {
  asset: CoOwnAsset;
  diligence: DueDiligenceProfile | null | undefined;
  open: RuleKey | null;
  onToggle: (key: RuleKey) => void;
  feePct: string;
  feeScheduleRows: { label: string; value: number; fmt: 'pct' | 'gbp' }[];
}

export function FeesRightsRisksAccordions({
  asset,
  diligence,
  open,
  onToggle,
  feePct,
  feeScheduleRows,
}: FeesRightsRisksAccordionsProps) {
  const dossier = diligence?.dossier ?? null;
  const rights = asset.rights ?? null;
  const risks = asset.riskDisclosures ?? null;
  const riskRows = risks ? RISK_ROWS.filter((r) => risks[r.key] != null) : [];

  return (
    <>
      {/* Fees & settlement */}
      <div>
        <RuleHead
          label="Fees & settlement"
          meta={`${feePct} trading fee`}
          open={open === 'fees'}
          onToggle={() => onToggle('fees')}
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
            onToggle={() => onToggle('rights')}
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
                value={rights.governingLaw ?? rights.jurisdiction}
              />
            </dl>
          ) : null}
        </div>
      ) : null}

      {/* Risks — the asset's own published risk narrative */}
      {riskRows.length > 0 ? (
        <div>
          <RuleHead
            label="Risks"
            meta={`${riskRows.length} disclosed`}
            open={open === 'risks'}
            onToggle={() => onToggle('risks')}
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
    </>
  );
}
