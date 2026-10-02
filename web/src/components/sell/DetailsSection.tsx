'use client';

/**
 * DetailsSection — what the item is: title, brand (with popular picks),
 * category + subcategory, condition radio cards, size chips, description.
 */

import { Chip } from '@/components/ui/Chip';
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  POPULAR_BRANDS,
  type SellDraft,
  type SellErrors,
} from './constants';
import { INPUT_CLASS, INPUT_ERROR_CLASS, SellField } from './SellField';
import { SellSection } from './SellSection';
import { TagField } from './TagField';
import { CategoryFields } from './details/CategoryFields';
import { ConditionField } from './details/ConditionField';
import { SizeField } from './details/SizeField';
import { SustainabilityField } from './details/SustainabilityField';

interface DetailsSectionProps {
  draft: SellDraft;
  errors: SellErrors;
  update: (patch: Partial<SellDraft>) => void;
  clearError: (key: keyof SellErrors) => void;
}

export function DetailsSection({
  draft,
  errors,
  update,
  clearError,
}: DetailsSectionProps) {
  return (
    <SellSection
      id="sell-details"
      step={2}
      title="Details"
      subtitle="The facts buyers filter on."
    >
      <div className="flex flex-col gap-6">
        <SellField
          id="sell-field-title"
          label="Title"
          required
          done={draft.title.trim().length >= 3}
          error={errors.title}
          hint={
            !errors.title &&
            draft.title.trim().length > 0 &&
            draft.title.trim().length < 10
              ? 'Describe the item — include the style or model name.'
              : undefined
          }
        >
          <input
            id="sell-field-title"
            type="text"
            value={draft.title}
            onChange={(e) => {
              update({ title: e.target.value });
              clearError('title');
            }}
            placeholder="e.g. Vintage Levi's 501 jeans"
            maxLength={80}
            aria-invalid={!!errors.title}
            aria-describedby={
              errors.title ? 'sell-field-title-error' : undefined
            }
            className={`${INPUT_CLASS} ${
              errors.title ? INPUT_ERROR_CLASS : ''
            }`}
          />
        </SellField>

        <SellField id="sell-field-brand" label="Brand" optional>
          <input
            id="sell-field-brand"
            type="text"
            value={draft.brand}
            onChange={(e) => update({ brand: e.target.value })}
            placeholder="e.g. Nike"
            maxLength={50}
            className={INPUT_CLASS}
          />
          <div className="no-scrollbar -mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1">
            {POPULAR_BRANDS.map((brand) => (
              <Chip
                key={brand}
                selected={draft.brand === brand}
                onClick={() =>
                  update({ brand: draft.brand === brand ? '' : brand })
                }
              >
                {brand}
              </Chip>
            ))}
          </div>
        </SellField>

        <CategoryFields
          draft={draft}
          errors={errors}
          update={update}
          clearError={clearError}
        />

        <ConditionField
          draft={draft}
          errors={errors}
          update={update}
          clearError={clearError}
        />

        <SizeField
          draft={draft}
          errors={errors}
          update={update}
          clearError={clearError}
        />

        <SellField
          id="sell-field-description"
          label="Description"
          required
          done={draft.description.trim().length >= DESCRIPTION_MIN}
          error={errors.description}
          hint={
            !errors.description
              ? draft.description.trim().length > 0 &&
                draft.description.trim().length < DESCRIPTION_MIN
                ? `At least ${DESCRIPTION_MIN} characters — material, fit, flaws, why you're selling.`
                : "Material, fit, flaws, why you're selling — honest detail builds trust."
              : undefined
          }
        >
          <div className="relative">
            <textarea
              id="sell-field-description"
              value={draft.description}
              onChange={(e) => {
                update({ description: e.target.value });
                clearError('description');
              }}
              rows={4}
              maxLength={DESCRIPTION_MAX}
              placeholder="e.g. 90s 501s, perfect wash and fade. Button fly, no repairs needed."
              aria-invalid={!!errors.description}
              aria-describedby={
                errors.description ? 'sell-field-description-error' : undefined
              }
              className={`w-full resize-y rounded-md border bg-input px-3.5 py-3 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none ${
                errors.description ? 'border-danger-border' : 'border-border'
              }`}
            />
            <span className="pointer-events-none absolute bottom-2.5 right-3 text-micro text-text-muted">
              {draft.description.length}/{DESCRIPTION_MAX}
            </span>
          </div>
        </SellField>

        <TagField tags={draft.tags} onChange={(tags) => update({ tags })} />

        {/* Sustainability — seller-asserted attributes */}
        <SustainabilityField draft={draft} update={update} />
      </div>
    </SellSection>
  );
}
