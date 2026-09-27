'use client';

/**
 * OutfitSuggestionCard — port of mobile OutfitBuilderSuggestionCard.
 * A quiet hairline strip under the canvas: "Complete the look" +
 * the suggested item with an Add affordance. Suggestions are heuristic
 * (StyleGraph rules), not ML — the label stays honest about that.
 */

import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import type { CompletionSuggestion } from './styleGraph';
import { SLOT_LABEL } from './outfitItems';
import { getListingCoverUri } from '@/lib/utils/media';
import { formatPrice } from '@/lib/utils/format';

interface OutfitSuggestionCardProps {
  suggestion: CompletionSuggestion;
  onApply: () => void;
}

export function OutfitSuggestionCard({
  suggestion,
  onApply,
}: OutfitSuggestionCardProps) {
  const { item, slot, scoreImprovement } = suggestion;
  return (
    <div className="mt-5 border-t border-border-subtle pt-4">
      <p className="flex items-center gap-1.5 text-caption font-semibold text-text-primary">
        <Icon name="sparkles" size={15} className="text-brand" />
        Complete the look
      </p>
      <p className="mt-1.5 text-body text-text-secondary">
        Add a{' '}
        <span className="font-semibold text-text-primary">
          {SLOT_LABEL[slot].toLowerCase()}
        </span>{' '}
        to improve your outfit score by{' '}
        <span className="tnum">+{scoreImprovement}</span>.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span className="relative h-14 w-12 shrink-0 overflow-hidden rounded-md bg-surface-alt">
          <AppImage
            src={getListingCoverUri(item.images)}
            alt={item.title}
            fill
            sizes="48px"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="clamp-1 block text-body font-medium text-text-primary">
            {item.brand ? `${item.brand} · ` : ''}
            {item.title}
          </span>
          <span className="tnum block text-meta text-text-muted">
            {formatPrice(item.price)}
          </span>
        </span>
        <button
          type="button"
          onClick={onApply}
          aria-label={`Add ${item.title} as the ${SLOT_LABEL[slot].toLowerCase()}`}
          className="pressable flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-brand px-3.5 text-caption font-semibold text-text-inverse"
        >
          <Icon name="plus" size={15} />
          Add
        </button>
      </div>
    </div>
  );
}
