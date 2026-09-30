'use client';

import { Icon } from '@/components/ui/Icon';
import type {
  CoOwnAssetRights,
  CoOwnRiskDisclosures,
  DiligenceDocKind,
} from '@/lib/contracts/coown';

export type RuleKey =
  | 'custody'
  | 'fees'
  | 'rights'
  | 'risks'
  | 'documents'
  | 'audit'
  | 'recourse';

export const DOC_KIND: Record<DiligenceDocKind, string> = {
  authentication: 'Authentication',
  condition: 'Condition report',
  custody: 'Custody',
  insurance: 'Insurance',
  appraisal: 'Appraisal',
};

export const RISK_ROWS: { key: keyof Omit<CoOwnRiskDisclosures, 'publishedAt'>; label: string }[] = [
  { key: 'marketRisk', label: 'Market' },
  { key: 'liquidityRisk', label: 'Liquidity' },
  { key: 'custodyRisk', label: 'Custody' },
  { key: 'regulatoryRisk', label: 'Regulatory' },
  { key: 'counterpartyRisk', label: 'Counterparty' },
  { key: 'otherRisks', label: 'Other' },
];

export const RIGHTS_ROWS: { key: keyof CoOwnAssetRights; label: string }[] = [
  { key: 'economicRights', label: 'Economic' },
  { key: 'votingRights', label: 'Voting' },
  { key: 'exitRights', label: 'Exit' },
  { key: 'feeRights', label: 'Fees' },
];

export const DOSSIER_DOC_LINKS: {
  key: 'escrowTermsUrl' | 'safeguardingTermsUrl' | 'safeguardingEvidenceUrl' | 'buyerProtectionTermsUrl';
  label: string;
}[] = [
  { key: 'escrowTermsUrl', label: 'Escrow terms' },
  { key: 'safeguardingTermsUrl', label: 'Safeguarding terms' },
  { key: 'safeguardingEvidenceUrl', label: 'Safeguarding evidence' },
  { key: 'buyerProtectionTermsUrl', label: 'Buyer protection terms' },
];

/** 'buyout_offer_created' → 'Buyout offer created'. */
export function humaniseEventType(eventType: string): string {
  const words = eventType.replace(/[_.\-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function DossierRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2">
      <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="text-right text-body text-text-primary">{value}</dd>
    </div>
  );
}

export function DossierText({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2">
      <dt className="text-meta font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-1 text-body text-text-primary">{value}</dd>
    </div>
  );
}

export function RuleHead({
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

export const FIELD_CLASS =
  'mt-1.5 h-11 w-full rounded-lg bg-input px-3 text-body-emphasis text-input-text outline-none focus:ring-2 focus:ring-text-primary';
export const LABEL_CLASS =
  'text-meta font-semibold uppercase tracking-wide text-text-muted';
