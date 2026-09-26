'use client';

/**
 * PostageSection — per-listing delivery choices: how fast it ships and who
 * pays. Web port of the mobile sell flow's shipping sheet — the values land
 * on the Listing contract's shippingMethod/shippingPayer, so the PDP's
 * shipping strip renders them verbatim ("Free delivery" / method label).
 * Costs stay honest: nothing is quoted here, checkout prices it.
 */

import { Icon } from '@/components/ui/Icon';
import {
  SHIPPING_METHOD_OPTIONS,
  SHIPPING_PAYER_OPTIONS,
  type SellDraft,
} from './constants';
import { SellSection } from './SellSection';

interface PostageSectionProps {
  draft: SellDraft;
  update: (patch: Partial<SellDraft>) => void;
}

interface OptionRowProps {
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}

/** Same radio-card grammar as the condition picker — one border, one check. */
function OptionRow({ label, hint, selected, onSelect }: OptionRowProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`pressable flex items-start justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
        selected
          ? 'border-text-primary bg-surface-alt'
          : 'border-border hover:border-text-muted'
      }`}
    >
      <span>
        <span className="block text-body font-medium text-text-primary">{label}</span>
        <span className="mt-0.5 block text-caption text-text-muted">{hint}</span>
      </span>
      {selected ? (
        <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success-text" />
      ) : null}
    </button>
  );
}

export function PostageSection({ draft, update }: PostageSectionProps) {
  return (
    <SellSection
      id="sell-postage"
      step={4}
      title="Postage"
      subtitle="What buyers pick at checkout. Skip it and postage stays flexible."
    >
      <div className="flex flex-col gap-6">
        <div>
          <span className="mb-1.5 block text-caption font-medium text-text-secondary">
            Delivery speed
          </span>
          <div role="radiogroup" aria-label="Delivery speed" className="grid gap-2 sm:grid-cols-2">
            {SHIPPING_METHOD_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                label={opt.label}
                hint={opt.hint}
                selected={draft.shippingMethod === opt.value}
                onSelect={() => update({ shippingMethod: opt.value })}
              />
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-caption font-medium text-text-secondary">
            Who pays postage
          </span>
          <div role="radiogroup" aria-label="Who pays postage" className="grid gap-2 sm:grid-cols-2">
            {SHIPPING_PAYER_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.value}
                label={opt.label}
                hint={opt.hint}
                selected={draft.shippingPayer === opt.value}
                onSelect={() => update({ shippingPayer: opt.value })}
              />
            ))}
          </div>
        </div>

        <p className="flex items-start gap-2 text-caption text-text-muted">
          <Icon name="info" size={14} className="mt-px shrink-0" />
          Exact postage is priced at checkout by parcel size and destination —
          you never quote it yourself.
        </p>
      </div>
    </SellSection>
  );
}
