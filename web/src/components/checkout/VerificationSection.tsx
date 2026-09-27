'use client';

/**
 * VerificationSection — item verification add-on, the web port of
 * mobile's CheckoutVerificationSection.
 *
 * Truthful copy rules (mobile, verbatim): the backend exposes no
 * verification fee or SLA, so the row is "Free" and promises only the
 * check itself — never invented prices or business-day claims. It is a
 * request flag persisted on the order (orders.verification_requested).
 *
 * When any item in the order meets the authentication threshold the check
 * is already included — the row reads "Included" and stays on, rather
 * than offering a meaningless toggle.
 */

import { Switch } from '@/components/settings/Switch';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';

export function VerificationSection({
  enabled,
  onToggle,
  /** At least one item clears the physical-authentication threshold —
   *  verification is already part of the order, not an opt-in. */
  autoIncluded,
  thresholdGbp,
}: {
  enabled: boolean;
  onToggle: () => void;
  autoIncluded: boolean;
  thresholdGbp: number;
}) {
  const on = enabled || autoIncluded;
  return (
    <section aria-label="Item verification">
      <div className="flex items-start gap-3 py-2">
        <Switch
          checked={on}
          onChange={onToggle}
          disabled={autoIncluded}
          aria-label={
            autoIncluded
              ? `Item verification included — orders over ${formatPrice(thresholdGbp)} are checked before dispatch`
              : 'Item verification — ask Thryft to check the item photos and details for signs of inauthenticity'
          }
        />
        <div className="min-w-0 flex-1 pt-1">
          <p className="flex items-center gap-2 text-meta font-semibold text-text-primary">
            Item verification
            <span className="text-meta font-semibold uppercase tracking-wide text-success-text">
              {autoIncluded ? 'Included' : 'Free'}
            </span>
          </p>
          <p className="mt-0.5 text-body text-text-muted">
            {autoIncluded
              ? `Orders over ${formatPrice(thresholdGbp)} are checked by our verification team before dispatch`
              : "Thryft checks the item photos and details for signs of inauthenticity"}
          </p>
        </div>
      </div>

      {on && !autoIncluded ? (
        <p className="flex items-center gap-1.5 rounded-md bg-success-subtle px-2.5 py-1.5 text-meta font-medium text-success-text">
          <Icon name="shieldCheck" size={13} className="shrink-0" />
          Verification requested — a record is added to your order
        </p>
      ) : null}
    </section>
  );
}
