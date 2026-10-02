'use client';

import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { formatPrice } from '@/lib/utils/format';

interface AddLotSheetProps {
  open: boolean;
  onClose: () => void;
  candidates: Listing[];
  tableBusy: boolean;
  onAddLot: (listingId: string) => void;
}

export function AddLotSheet({
  open,
  onClose,
  candidates,
  tableBusy,
  onAddLot,
}: AddLotSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Add a lot">
      {candidates.length === 0 ? (
        <p className="px-5 py-6 text-caption text-text-muted">
          No eligible listings — everything you own is either sold or already
          scheduled into this show.
        </p>
      ) : (
        <ul className="space-y-2 px-5 pb-6 pt-1">
          {candidates.map((listing) => (
            <li key={listing.id}>
              <button
                type="button"
                onClick={() => onAddLot(listing.id)}
                disabled={tableBusy}
                className="pressable flex w-full items-center gap-3 border border-border-subtle px-3 py-2.5 text-left transition-colors hover:bg-brand-subtle"
              >
                <AppImage
                  src={listing.images[0] ?? null}
                  alt={listing.title}
                  fill
                  className="h-10 w-10 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="clamp-1 text-caption font-semibold text-text-primary">
                    {listing.title}
                  </p>
                  <p className="tnum mt-0.5 text-meta text-text-muted">
                    {formatPrice(listing.price)}
                  </p>
                </div>
                <Icon
                  name="plus"
                  size={14}
                  className="shrink-0 text-text-muted"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
