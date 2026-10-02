'use client';

import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import {
  isSizelessCategory,
  isSizeRequiredCategory,
  sizesForCategory,
  type SellDraft,
  type SellErrors,
} from '../constants';

interface SizeFieldProps {
  draft: SellDraft;
  errors: SellErrors;
  update: (patch: Partial<SellDraft>) => void;
  clearError: (key: keyof SellErrors) => void;
}

export function SizeField({
  draft,
  errors,
  update,
  clearError,
}: SizeFieldProps) {
  const sizes = sizesForCategory(draft.category, draft.subcategory);
  const sizeless = isSizelessCategory(draft.category, draft.subcategory);
  // Category policy parity: size is a hard requirement under the shoes
  // policy; recommended for apparel/sports, hidden when sizeless.
  const sizeRequired = isSizeRequiredCategory(
    draft.category,
    draft.subcategory,
  );

  if (!draft.category || sizeless) return null;

  return (
    <div id="sell-field-size">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-caption font-medium text-text-secondary">
          Size
        </span>
        {sizeRequired ? (
          draft.size ? (
            <Icon name="check" size={14} className="text-success-text" />
          ) : (
            <span className="text-micro text-text-muted">Required</span>
          )
        ) : (
          <span className="text-micro text-text-muted">Recommended</span>
        )}
      </div>
      <div
        className="flex flex-wrap gap-1.5"
        aria-invalid={!!errors.size}
        aria-describedby={errors.size ? 'sell-field-size-error' : undefined}
      >
        {sizes.map((size) => (
          <Chip
            key={size}
            selected={draft.size === size}
            onClick={() => {
              update({ size: draft.size === size ? '' : size });
              clearError('size');
            }}
          >
            {size}
          </Chip>
        ))}
      </div>
      {errors.size ? (
        <p
          id="sell-field-size-error"
          role="alert"
          className="mt-1.5 text-caption text-danger-text"
        >
          {errors.size}
        </p>
      ) : null}
    </div>
  );
}
