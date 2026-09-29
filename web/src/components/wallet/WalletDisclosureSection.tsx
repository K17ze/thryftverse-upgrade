'use client';

/**
 * WalletDisclosureSection — safeguarding status and 1ZE marketplace disclosure.
 * Web port of mobile's WalletDisclosureSection (spec 17).
 *
 * Every safeguarding claim is wire-backed: the 1ZE position read carries
 * `safeguarded`, `safeguardingPartner` and evidence/terms URLs from the
 * user's safeguarding profile. Nothing asserts a bank, a regulation or a
 * ring-fence the backend didn't report — an unknown status says so.
 */

import { Icon } from '@/components/ui/Icon';

interface WalletDisclosureSectionProps {
  currencyCode?: string;
  /** Wire truth — undefined when the position read failed (fail closed). */
  safeguarded?: boolean;
  safeguardingPartner?: string | null;
  safeguardingEvidenceUrl?: string | null;
  safeguardingTermsUrl?: string | null;
  reconciliationState?: string | null;
}

export function WalletDisclosureSection({
  currencyCode = 'GBP',
  safeguarded,
  safeguardingPartner,
  safeguardingEvidenceUrl,
  safeguardingTermsUrl,
  reconciliationState,
}: WalletDisclosureSectionProps) {
  const statusKnown = safeguarded !== undefined;
  const title = !statusKnown
    ? 'Safeguarding status unavailable'
    : safeguarded
      ? safeguardingPartner
        ? `Safeguarded at ${safeguardingPartner}`
        : 'Safeguarded'
      : 'Safeguarding pending';

  return (
    <section
      aria-label="Safeguarding & Regulatory Disclosure"
      className="mt-10 border-t border-border-subtle px-4 pt-6 sm:px-6"
    >
      <div className="flex items-center gap-2">
        <Icon
          name={statusKnown && safeguarded ? 'verified' : 'shield'}
          size={17}
          className={statusKnown && safeguarded ? 'text-coown-up' : 'text-text-muted'}
        />
        <h3 className="text-body-emphasis font-semibold text-text-primary">{title}</h3>
      </div>

      <p className="mt-2 text-caption text-text-muted leading-relaxed">
        {!statusKnown
          ? 'We couldn\u2019t load this wallet\u2019s safeguarding status. Balances shown are ledger-reported; safeguarding details will appear here once the position read succeeds.'
          : safeguarded
            ? `Your ${currencyCode} balance is held in a segregated client account, separate from ThryftVerse operating funds.`
            : `Safeguarding details for your ${currencyCode} balance are still being confirmed.`}
      </p>

      {statusKnown && safeguarded && (safeguardingEvidenceUrl || safeguardingTermsUrl) ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {safeguardingEvidenceUrl ? (
            <a
              href={safeguardingEvidenceUrl}
              target="_blank"
              rel="noreferrer"
              className="pressable text-caption font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
            >
              Safeguarding evidence
            </a>
          ) : null}
          {safeguardingTermsUrl ? (
            <a
              href={safeguardingTermsUrl}
              target="_blank"
              rel="noreferrer"
              className="pressable text-caption font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
            >
              Safeguarding terms
            </a>
          ) : null}
        </div>
      ) : null}

      {reconciliationState === 'reconciling' ? (
        <p className="mt-2 flex items-start gap-1.5 text-meta text-text-muted">
          <Icon name="info" size={13} className="mt-0.5 shrink-0" />
          1ZE supply reconciliation is in progress — balances remain ledger-reported.
        </p>
      ) : null}

      <div className="mt-4 border-t border-border-subtle pt-4">
        <p className="text-meta text-text-muted leading-relaxed">
          <strong>1ZE settlement credit:</strong> 1ZE is a closed-loop
          marketplace settlement credit used for Co-Own syndicates and
          checkout.
        </p>
      </div>
    </section>
  );
}
