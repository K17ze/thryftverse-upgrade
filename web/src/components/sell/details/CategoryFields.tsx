'use client';

import { Icon } from '@/components/ui/Icon';
import { useTaxonomy } from '@/lib/hooks/sell/useTaxonomy';
import {
  categoryOptions,
  conditionAllowedFor,
  subcategoryOptions,
} from '../taxonomy';
import {
  isSizelessCategory,
  type SellDraft,
  type SellErrors,
} from '../constants';
import { INPUT_CLASS, INPUT_ERROR_CLASS, SellField } from '../SellField';

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

interface CategoryFieldsProps {
  draft: SellDraft;
  errors: SellErrors;
  update: (patch: Partial<SellDraft>) => void;
  clearError: (key: keyof SellErrors) => void;
}

export function CategoryFields({
  draft,
  errors,
  update,
  clearError,
}: CategoryFieldsProps) {
  const { taxonomy } = useTaxonomy();
  const categories = categoryOptions(taxonomy.categories);
  const subcategories = subcategoryOptions(taxonomy.categories, draft.category);

  return (
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
              const category = e.target.value;
              const patch: Partial<SellDraft> = {
                category,
                subcategory: '',
                size: '',
              };
              // A condition the new category's policy disallows (e.g.
              // 'New with tags' on electronics) can't ride forward —
              // the seller re-picks from the allowed set.
              if (
                draft.condition &&
                !conditionAllowedFor(category, undefined, draft.condition)
              ) {
                patch.condition = '';
              }
              update(patch);
              clearError('category');
            }}
            aria-invalid={!!errors.category}
            aria-describedby={
              errors.category ? 'sell-field-category-error' : undefined
            }
            className={`${SELECT_CLASS} ${
              errors.category ? INPUT_ERROR_CLASS : ''
            } ${draft.category ? '' : 'text-text-muted'}`}
          >
            <option value="" disabled>
              Select category
            </option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
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
            onChange={(e) => {
              const subcategory = e.target.value;
              const patch: Partial<SellDraft> = { subcategory };
              // Leaf switch can retire a size pick (e.g. Clothing →
              // Beauty) or a condition the new leaf disallows.
              if (isSizelessCategory(draft.category, subcategory)) {
                patch.size = '';
              }
              if (
                draft.condition &&
                !conditionAllowedFor(
                  draft.category,
                  subcategory,
                  draft.condition,
                )
              ) {
                patch.condition = '';
              }
              update(patch);
            }}
            disabled={!subcategories.length}
            className={`${SELECT_CLASS} disabled:opacity-50 ${
              draft.subcategory ? '' : 'text-text-muted'
            }`}
          >
            <option value="">
              {subcategories.length ? 'Select type' : 'Select a category first'}
            </option>
            {subcategories.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Chevron />
        </div>
      </SellField>
    </div>
  );
}
