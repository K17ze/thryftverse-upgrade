'use client';

/**
 * ReviewSection — final read before the preview surface: spec summary,
 * postage line, fee line and the Preview CTA. Publish happens on the
 * preview, not here — the seller sees the listing as buyers will first.
 */

import { CATEGORIES } from '@/lib/data/fixtures';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import {
  missingPublishFields,
  parsePriceInput,
  postageSummary,
  protectionFeeGbp,
  SUSTAINABILITY_TAG_OPTIONS,
  type SellDraft,
} from './constants';
import { SellSection } from './SellSection';

interface ReviewSectionProps {
  draft: SellDraft;
  /** True on the ?edit=<id> path — publish saves over the live listing. */
  editing?: boolean;
  onPreview: () => void;
}

export function ReviewSection({ draft, editing, onPreview }: ReviewSectionProps) {
  const price = parsePriceInput(draft.price);
  const originalPrice = parsePriceInput(draft.originalPrice);
  const buyerPays = price != null ? price + protectionFeeGbp(price) : null;
  const categoryName = CATEGORIES.find((c) => c.slug === draft.category)?.name;
  const postage = postageSummary(draft.shippingMethod, draft.shippingPayer);
  const missing = missingPublishFields(draft);

  const specs: [string, string][] = [];
  if (categoryName) specs.push(['Category', draft.subcategory ? `${categoryName} — ${draft.subcategory}` : categoryName]);
  if (draft.size) specs.push(['Size', draft.size]);
  if (draft.condition) specs.push(['Condition', draft.condition]);
  if (price != null) specs.push(['Price', formatPrice(price)]);
  if (originalPrice != null && originalPrice > (price ?? 0)) {
    specs.push(['Original price', `${formatPrice(originalPrice)} (was)`]);
  }
  if (postage) specs.push(['Postage', postage]);
  if (draft.tags.length) specs.push(['Tags', draft.tags.map((t) => `#${t}`).join(' ')]);
  if (draft.sustainabilityTags.length) {
    specs.push([
      'Sustainability',
      SUSTAINABILITY_TAG_OPTIONS.filter((t) => draft.sustainabilityTags.includes(t.id))
        .map((t) => t.label)
        .join(', '),
    ]);
  }
  if (draft.photos.length) specs.push(['Photos', `${draft.photos.length}`]);

  return (
    <SellSection id="sell-review" step={5} title="Review" subtitle="One last check, then see it as buyers do.">
      <div className="max-w-[560px]">
        {specs.length ? (
          <dl>
            {specs.map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 border-b border-border-subtle py-2.5 last:border-b-0"
              >
                <dt className="shrink-0 text-caption text-text-muted">{label}</dt>
                <dd className="clamp-1 text-right text-body text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {buyerPays != null ? (
          <p className="mt-4 flex items-start gap-2 text-caption text-text-secondary">
            <Icon name="shieldCheck" size={14} className="mt-px shrink-0 text-commerce-trust" />
            <span>
              Buyer pays <span className="tnum font-semibold">{formatPrice(buyerPays)}</span> incl.
              protection — you get <span className="tnum font-semibold">{formatPrice(price)}</span>
            </span>
          </p>
        ) : null}

        <div className="mt-6">
          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            icon="eye"
            onClick={onPreview}
            className="sm:max-w-[280px]"
          >
            {editing ? 'Preview changes' : 'Preview listing'}
          </Button>
          {/* Completeness line — mirrors the mobile review row: what the
              draft still needs before the publish gate will pass. */}
          {missing.length ? (
            <p className="mt-3 flex items-start gap-1.5 text-caption text-warning-text">
              <Icon name="warning" size={14} className="mt-px shrink-0" />
              Still needs: {missing.join(', ')}
            </p>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-caption text-success-text">
              <Icon name="check" size={14} />
              Ready to list
            </p>
          )}
          <p className="mt-2.5 text-micro text-text-muted">
            Nothing goes live until you confirm on the preview.
          </p>
        </div>
      </div>
    </SellSection>
  );
}
