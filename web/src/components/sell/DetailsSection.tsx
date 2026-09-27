'use client';

/**
 * DetailsSection — what the item is: title, brand (with popular picks),
 * category + subcategory, condition radio cards, size chips, description.
 */

import { CATEGORIES } from '@/lib/data/fixtures';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import {
  CONDITION_OPTIONS,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  POPULAR_BRANDS,
  SUBCATEGORIES,
  SUSTAINABILITY_TAG_OPTIONS,
  isSizelessCategory,
  isSizeRequiredCategory,
  sizesForCategory,
  type SellDraft,
  type SellErrors,
} from './constants';
import { INPUT_CLASS, INPUT_ERROR_CLASS, SellField } from './SellField';
import { SellSection } from './SellSection';
import { TagField } from './TagField';

interface DetailsSectionProps {
  draft: SellDraft;
  errors: SellErrors;
  update: (patch: Partial<SellDraft>) => void;
  clearError: (key: keyof SellErrors) => void;
}

const SELECT_CLASS = `${INPUT_CLASS} appearance-none pr-10`;

function Chevron() {
  return (
    <Icon
      name="chevronDown"
      size={16}
      className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted"
    />
  );
}

export function DetailsSection({ draft, errors, update, clearError }: DetailsSectionProps) {
  const subcategories = SUBCATEGORIES[draft.category] ?? [];
  const sizes = sizesForCategory(draft.category);
  const sizeless = isSizelessCategory(draft.category);
  // Category policy parity: size is a hard requirement for sneakers
  // (mobile's shoes policy); recommended elsewhere, hidden when sizeless.
  const sizeRequired = isSizeRequiredCategory(draft.category);

  return (
    <SellSection id="sell-details" step={2} title="Details" subtitle="The facts buyers filter on.">
      <div className="flex flex-col gap-6">
        <SellField
          id="sell-field-title"
          label="Title"
          required
          done={draft.title.trim().length >= 3}
          error={errors.title}
          hint={!errors.title && draft.title.trim().length > 0 && draft.title.trim().length < 10 ? 'Describe the item — include the style or model name.' : undefined}
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
            aria-describedby={errors.title ? 'sell-field-title-error' : undefined}
            className={`${INPUT_CLASS} ${errors.title ? INPUT_ERROR_CLASS : ''}`}
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
                onClick={() => update({ brand: draft.brand === brand ? '' : brand })}
              >
                {brand}
              </Chip>
            ))}
          </div>
        </SellField>

        <div className="grid gap-6 sm:grid-cols-2">
          <SellField
            id="sell-field-category"
            label="Category"
            required
            done={!!draft.category}
            error={errors.category}
          >
            <div className="relative">
              <select
                id="sell-field-category"
                value={draft.category}
                onChange={(e) => {
                  update({ category: e.target.value, subcategory: '', size: '' });
                  clearError('category');
                }}
                aria-invalid={!!errors.category}
                aria-describedby={errors.category ? 'sell-field-category-error' : undefined}
                className={`${SELECT_CLASS} ${errors.category ? INPUT_ERROR_CLASS : ''} ${
                  draft.category ? '' : 'text-text-muted'
                }`}
              >
                <option value="" disabled>
                  Select category
                </option>
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Chevron />
            </div>
          </SellField>

          <SellField id="sell-field-subcategory" label="Type" optional>
            <div className="relative">
              <select
                id="sell-field-subcategory"
                value={draft.subcategory}
                onChange={(e) => update({ subcategory: e.target.value })}
                disabled={!subcategories.length}
                className={`${SELECT_CLASS} disabled:opacity-50 ${
                  draft.subcategory ? '' : 'text-text-muted'
                }`}
              >
                <option value="">
                  {subcategories.length ? 'Select type' : 'Select a category first'}
                </option>
                {subcategories.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <Chevron />
            </div>
          </SellField>
        </div>

        <div id="sell-field-condition">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-caption font-medium text-text-secondary">Condition</span>
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
            aria-describedby={errors.condition ? 'sell-field-condition-error' : undefined}
            className="grid gap-2 sm:grid-cols-2"
          >
            {CONDITION_OPTIONS.map((opt) => {
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
                    <span className="mt-0.5 block text-caption text-text-muted">{opt.hint}</span>
                  </span>
                  {selected ? (
                    <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success-text" />
                  ) : null}
                </button>
              );
            })}
          </div>
          {errors.condition ? (
            <p id="sell-field-condition-error" role="alert" className="mt-1.5 text-caption text-danger-text">
              {errors.condition}
            </p>
          ) : null}
        </div>

        {draft.category && !sizeless ? (
          <div id="sell-field-size">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-caption font-medium text-text-secondary">Size</span>
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
              <p id="sell-field-size-error" role="alert" className="mt-1.5 text-caption text-danger-text">
                {errors.size}
              </p>
            ) : null}
          </div>
        ) : null}

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
              aria-describedby={errors.description ? 'sell-field-description-error' : undefined}
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

        {/* Sustainability — seller-asserted attributes, ported from the
            mobile SustainabilityTags selector. Each chip is a labelled
            switch with a 44px hit area; the impact summary below is
            honest about what a claim means — never a verified grade. */}
        <fieldset id="sell-field-sustainability">
          <div className="mb-1.5 flex items-baseline justify-between">
            <legend className="text-caption font-medium text-text-secondary">
              Sustainability
            </legend>
            <span className="text-micro text-text-muted">Optional</span>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sustainability attributes">
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
                  <Icon name="check" size={14} className="mt-px shrink-0 text-success-text" />
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
      </div>
    </SellSection>
  );
}
