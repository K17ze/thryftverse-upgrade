'use client';

/**
 * OutfitCanvas — the builder's stage: a structured slot grid (web equivalent
 * of the mobile slot-circle preview). Fixed flat-lay composition — dominant
 * top, outerwear + accessory stacked right, bottom + shoes along the base.
 * Edit mode: cells activate a slot and expose a remove affordance.
 * View mode: filled cells link to the item's PDP.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { getListingCoverUri } from '@/lib/utils/media';
import type { OutfitSlot } from '@/lib/store/outfits';
import { SLOT_LABEL } from './outfitItems';

export type OutfitCanvasItems = Partial<Record<OutfitSlot, Listing | undefined>>;

interface OutfitCanvasProps {
  items: OutfitCanvasItems;
  /** Edit mode — highlights one slot and wires cell/remove handlers. */
  activeSlot?: OutfitSlot | null;
  onSlotPress?: (slot: OutfitSlot) => void;
  onRemoveItem?: (slot: OutfitSlot) => void;
  /** View mode — filled cells link to /item/[id]. */
  linkToItems?: boolean;
}

/** Flat-lay placement on a 2-col × 3-row grid. */
const CELL_PLACEMENT: Record<OutfitSlot, string> = {
  top: 'col-start-1 row-start-1 row-span-2',
  outerwear: 'col-start-2 row-start-1',
  accessory: 'col-start-2 row-start-2',
  bottom: 'col-start-1 row-start-3',
  shoes: 'col-start-2 row-start-3',
};

const CANVAS_ORDER: OutfitSlot[] = [
  'top',
  'outerwear',
  'accessory',
  'bottom',
  'shoes',
];

function SlotChip({ label }: { label: string }) {
  return (
    <span className="absolute bottom-1.5 left-1.5 rounded-sm bg-overlay px-1.5 py-0.5 text-micro font-medium text-scrim-text-primary">
      {label}
    </span>
  );
}

export function OutfitCanvas({
  items,
  activeSlot,
  onSlotPress,
  onRemoveItem,
  linkToItems,
}: OutfitCanvasProps) {
  const editable = Boolean(onSlotPress);
  return (
    <div
      className="grid aspect-[4/5] w-full grid-cols-2 grid-rows-3 gap-2"
      role="group"
      aria-label="Outfit slots"
    >
      {CANVAS_ORDER.map((slot) => {
        const item = items[slot];
        const isActive = activeSlot === slot;

        /* ── Filled cell ── */
        if (item) {
          const media = (
            <>
              <AppImage
                src={getListingCoverUri(item.images)}
                alt={item.title}
                fill
                sizes="(max-width: 640px) 50vw, 320px"
                className="h-full w-full"
              />
              <SlotChip label={SLOT_LABEL[slot]} />
            </>
          );
          return (
            <div
              key={slot}
              className={`relative min-h-0 overflow-hidden rounded-lg bg-surface-alt ${CELL_PLACEMENT[slot]} ${
                isActive ? 'ring-2 ring-brand' : ''
              }`}
            >
              {linkToItems ? (
                <Link
                  href={`/item/${item.id}`}
                  aria-label={`${SLOT_LABEL[slot]}: ${item.title}`}
                  className="group block h-full w-full"
                >
                  {media}
                </Link>
              ) : editable ? (
                <button
                  type="button"
                  onClick={() => onSlotPress?.(slot)}
                  aria-label={`${SLOT_LABEL[slot]} slot — ${item.title}`}
                  aria-pressed={isActive}
                  className="block h-full w-full text-left"
                >
                  {media}
                </button>
              ) : (
                <div className="h-full w-full">{media}</div>
              )}
              {editable && !linkToItems ? (
                <button
                  type="button"
                  onClick={() => onRemoveItem?.(slot)}
                  aria-label={`Remove ${item.title} from ${SLOT_LABEL[slot]} slot`}
                  className="pressable absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-overlay text-scrim-text-primary"
                >
                  <Icon name="close" size={14} />
                </button>
              ) : null}
            </div>
          );
        }

        /* ── Empty cell ── */
        const empty = (
          <>
            <Icon
              name="plus"
              size={18}
              className={isActive ? 'text-brand' : 'text-text-muted'}
            />
            <span
              className={`mt-1 text-meta font-medium ${
                isActive ? 'text-text-primary' : 'text-text-muted'
              }`}
            >
              {SLOT_LABEL[slot]}
            </span>
          </>
        );
        return editable ? (
          <button
            key={slot}
            type="button"
            onClick={() => onSlotPress?.(slot)}
            aria-label={`${SLOT_LABEL[slot]} slot — empty`}
            aria-pressed={isActive}
            className={`pressable flex min-h-0 flex-col items-center justify-center rounded-lg border border-dashed ${CELL_PLACEMENT[slot]} ${
              isActive
                ? 'border-brand bg-brand-subtle'
                : 'border-border bg-surface hover:bg-surface-alt'
            }`}
          >
            {empty}
          </button>
        ) : (
          <div
            key={slot}
            aria-hidden
            className={`flex min-h-0 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface ${CELL_PLACEMENT[slot]}`}
          >
            {empty}
          </div>
        );
      })}
    </div>
  );
}
