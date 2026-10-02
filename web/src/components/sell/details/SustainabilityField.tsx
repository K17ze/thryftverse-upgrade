'use client';

import { Icon } from '@/components/ui/Icon';
import {
  SUSTAINABILITY_TAG_OPTIONS,
  type SellDraft,
} from '../constants';

interface SustainabilityFieldProps {
  draft: SellDraft;
  update: (patch: Partial<SellDraft>) => void;
}

export function SustainabilityField({
  draft,
  update,
}: SustainabilityFieldProps) {
  return (
    <fieldset id="sell-field-sustainability">
      <div className="mb-1.5 flex items-baseline justify-between">
        <legend className="text-caption font-medium text-text-secondary">
          Sustainability
        </legend>
        <span className="text-micro text-text-muted">Optional</span>
      </div>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Sustainability attributes"
      >
        {SUSTAINABILITY_TAG_OPTIONS.map((opt) => {
          const selected = draft.sustainabilityTags.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              role="switch"
              aria-checked={selected}
              aria-label={`${opt.label} — mark this listing ${opt.label.toLowerCase()}`}
              onClick={() =>
                update({
                  sustainabilityTags: selected
                    ? draft.sustainabilityTags.filter((t) => t !== opt.id)
                    : [...draft.sustainabilityTags, opt.id],
                })
              }
              className={`pressable relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-body font-medium after:absolute after:-inset-y-1 after:content-[""] ${
                selected
                  ? 'bg-brand text-text-inverse'
                  : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
              }`}
            >
              <Icon name={opt.icon} filled={selected} size={16} />
              {opt.label}
            </button>
          );
        })}
      </div>
      {/* Truth line — mirrors the mobile disclosure: these are the
          seller's own assertions, not a platform-verified grade. */}
      <p className="mt-2 text-meta text-text-muted">
        Your claims — shown to buyers as seller-provided, not independently verified.
      </p>
      {draft.sustainabilityTags.length ? (
        <ul className="mt-2.5 space-y-1" aria-label="Sustainability impact">
          {SUSTAINABILITY_TAG_OPTIONS.filter((t) =>
            draft.sustainabilityTags.includes(t.id),
          ).map((t) => (
            <li
              key={t.id}
              className="flex items-start gap-1.5 text-caption text-text-secondary"
            >
              <Icon
                name="check"
                size={14}
                className="mt-px shrink-0 text-success-text"
              />
              <span>
                <span className="font-semibold text-text-primary">{t.label}</span>
                {' — '}
                {t.impact}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
