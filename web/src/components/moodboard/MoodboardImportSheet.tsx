'use client';

/**
 * MoodboardImportSheet — the add-to-board picker, web port of the mobile
 * import grammar: a sheet of your own saved / favourited listings to pin
 * to the board. Picked tiles carry the brand ring + check; the footer
 * button reports the real count. Honest empty state when there's nothing
 * saved to import.
 */

import { useEffect, useState } from 'react';
import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

interface MoodboardImportSheetProps {
  open: boolean;
  onClose: () => void;
  /** Importable listings — saved + favourites, deduped, minus on-board ids. */
  candidates: DiscoveryListingSummary[];
  onAdd: (ids: string[]) => void;
}

function PickerTile({
  item,
  picked,
  onToggle,
}: {
  item: DiscoveryListingSummary;
  picked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={picked}
      aria-label={`${picked ? 'Unpick' : 'Pick'} ${item.title}`}
      className="pressable group relative text-left"
    >
      <div
        className={`relative overflow-hidden rounded-lg bg-surface-alt ${
          picked ? 'ring-2 ring-brand' : ''
        }`}
      >
        <AppImage
          src={getListingCoverUri(item.images)}
          alt={item.title}
          aspectRatio={1}
          sizes="(max-width: 640px) 33vw, 150px"
        />
        <span
          aria-hidden
          className={[
            'pointer-events-none absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border',
            picked
              ? 'border-transparent bg-brand text-text-inverse'
              : 'border-scrim-text-primary/70 bg-overlay text-transparent',
          ].join(' ')}
        >
          <Icon name="check" size={13} />
        </span>
      </div>
      <span className="clamp-1 mt-1 block px-0.5 text-meta text-text-secondary">
        {item.price != null ? `${formatPrice(item.price)} · ` : ''}
        {item.title}
      </span>
    </button>
  );
}

export function MoodboardImportSheet({
  open,
  onClose,
  candidates,
  onAdd,
}: MoodboardImportSheetProps) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  // Fresh picks each time the sheet opens.
  useEffect(() => {
    if (open) setPicked(new Set());
  }, [open]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Sheet open={open} onClose={onClose} title="Add to board" maxWidth={640}>
      {candidates.length === 0 ? (
        <EmptyState
          compact
          icon="bookmark"
          title="Nothing to add"
          subtitle="Items you save or favourite will appear here, ready to pin to this board."
        />
      ) : (
        <div className="flex min-h-full flex-col">
          <p className="px-5 pb-3 pt-4 text-meta text-text-muted">
            From your saved items and favourites
          </p>
          <div className="grid flex-1 grid-cols-3 content-start gap-2 px-5 pb-4 sm:grid-cols-4">
            {candidates.map((item) => (
              <PickerTile
                key={item.id}
                item={item}
                picked={picked.has(item.id)}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </div>
          <div className="sticky bottom-0 border-t border-border-subtle bg-surface px-5 py-3">
            <Button
              fullWidth
              disabled={picked.size === 0}
              onClick={() => onAdd([...picked])}
            >
              {picked.size === 0
                ? 'Pick items to add'
                : `Add ${picked.size} ${picked.size === 1 ? 'item' : 'items'}`}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
