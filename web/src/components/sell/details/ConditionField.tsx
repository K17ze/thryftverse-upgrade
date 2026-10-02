'use client';

import { Icon } from '@/components/ui/Icon';
import {
  CONDITION_OPTIONS,
  type SellDraft,
  type SellErrors,
} from '../constants';
import { allowedConditionsFor } from '../taxonomy';

interface ConditionFieldProps {
  draft: SellDraft;
  errors: SellErrors;
  update: (patch: Partial<SellDraft>) => void;
  clearError: (key: keyof SellErrors) => void;
}

export function ConditionField({
  draft,
  errors,
  update,
  clearError,
}: ConditionFieldProps) {
  // Condition picker respects the category policy too — 'New with tags'
  // can't apply where a garment tag can't exist (electronics, cars, yachts).
  const conditionOptions = CONDITION_OPTIONS.filter((opt) =>
    allowedConditionsFor(draft.category, draft.subcategory).includes(opt.value),
  );

  return (
    <div id="sell-field-condition">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-caption font-medium text-text-secondary">
          Condition
        </span>
        {draft.condition ? (
          <Icon name="check" size={14} className="text-success-text" />
        ) : (
          <span className="text-micro text-text-muted">Required</span>
        )}
      </div>
      <div
        role="radiogroup"
        aria-label="Condition"
        aria-invalid={!!errors.condition}
        aria-describedby={
          errors.condition ? 'sell-field-condition-error' : undefined
        }
        className="grid gap-2 sm:grid-cols-2"
      >
        {conditionOptions.map((opt) => {
          const selected = draft.condition === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                update({ condition: opt.value });
                clearError('condition');
              }}
              className={`pressable flex items-start justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
                selected
                  ? 'border-text-primary bg-surface-alt'
                  : errors.condition
                    ? 'border-danger-border hover:border-text-muted'
                    : 'border-border hover:border-text-muted'
              }`}
            >
              <span>
                <span className="block text-body font-medium text-text-primary">
                  {opt.value}
                </span>
                <span className="mt-0.5 block text-caption text-text-muted">
                  {opt.hint}
                </span>
              </span>
              {selected ? (
                <Icon
                  name="check"
                  size={16}
                  className="mt-0.5 shrink-0 text-success-text"
                />
              ) : null}
            </button>
          );
        })}
      </div>
      {errors.condition ? (
        <p
          id="sell-field-condition-error"
          role="alert"
          className="mt-1.5 text-caption text-danger-text"
        >
          {errors.condition}
        </p>
      ) : null}
    </div>
  );
}
