'use client';

/**
 * DueDiligenceSection — the market rules collectors check before buying,
 * as a quiet accordion: issuer, custody & condition, fees & settlement,
 * and the filed documents. Every line comes from the asset record or the
 * diligence profile — absent data fails closed, it is never dressed up.
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import type { CoOwnAsset, DueDiligenceProfile, DiligenceDocKind } from '@/lib/contracts/coown';
import { CO_OWN_FEE_RATE } from '@/lib/utils/trade';
import { formatDate } from '@/lib/utils/format';
import { verificationLabel } from '../format';

const DOC_KIND: Record<DiligenceDocKind, string> = {
  authentication: 'Authentication',
  condition: 'Condition report',
  custody: 'Custody',
  insurance: 'Insurance',
  appraisal: 'Appraisal',
};

type RuleKey = 'issuer' | 'custody' | 'fees' | 'documents';

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
                  <dt className="text-meta font-semibold uppercase tracking-[0.08em] text-text-muted">Name</dt>
                  <dd className="text-right text-body text-text-primary">
                    {asset.issuer.displayName ?? `@${asset.issuer.username}`}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-6 py-2">
                  <dt className="text-meta font-semibold uppercase tracking-[0.08em] text-text-muted">Verification</dt>
                  <dd className="text-right text-body text-text-primary">
                    {tierLabel ?? 'Unverified — diligence file pending'}
                  </dd>
                </div>
                {asset.issuer.location ? (
                  <div className="flex items-baseline justify-between gap-6 py-2">
                    <dt className="text-meta font-semibold uppercase tracking-[0.08em] text-text-muted">Location</dt>
                    <dd className="text-right text-body text-text-primary">{asset.issuer.location}</dd>
                  </div>
                ) : null}
                {asset.issuerJurisdiction ? (
                  <div className="flex items-baseline justify-between gap-6 py-2">
                    <dt className="text-meta font-semibold uppercase tracking-[0.08em] text-text-muted">Jurisdiction</dt>
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
                  <div className="py-2">
                    <dt className="text-meta font-semibold uppercase tracking-[0.08em] text-text-muted">Custody</dt>
                    <dd className="mt-1 text-body text-text-primary">{asset.custodyNote}</dd>
                  </div>
                ) : null}
                <div className="py-2">
                  <dt className="text-meta font-semibold uppercase tracking-[0.08em] text-text-muted">Authentication</dt>
                  <dd className="mt-1 text-body text-text-primary">
                    {diligence?.authenticatedBy ? (
                      <>
                        {diligence.authenticatedBy}
                        {diligence.authenticatedAt ? (
                          <span className="text-text-secondary"> · {formatDate(diligence.authenticatedAt)}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-text-secondary">
                        <Icon name="clock" size={14} />
                        Authentication in progress
                      </span>
                    )}
                  </dd>
                </div>
                {diligence?.conditionSummary ? (
                  <div className="py-2">
                    <dt className="text-meta font-semibold uppercase tracking-[0.08em] text-text-muted">
                      Condition{diligence.conditionGrade ? ` · ${diligence.conditionGrade}` : ''}
                    </dt>
                    <dd className="mt-1 text-body text-text-primary">{diligence.conditionSummary}</dd>
                  </div>
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
                  <dt className="text-meta font-semibold uppercase tracking-[0.08em] text-text-muted">Trading fee</dt>
                  <dd className="text-right text-body text-text-primary">
                    <span className="tnum">{feePct}</span>
                    <span className="text-text-secondary"> — added to buys, deducted from sale proceeds</span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-6 py-2">
                  <dt className="text-meta font-semibold uppercase tracking-[0.08em] text-text-muted">Settlement</dt>
                  <dd className="text-right text-body text-text-primary">1ZE — single-price clearing</dd>
                </div>
              </dl>
            ) : null}
          </div>

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
        </div>
      )}
    </section>
  );
}
