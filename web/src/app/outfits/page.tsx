'use client';

/**
 * Your outfits — grid of saved outfits (collage cover, name, item count,
 * created date) plus the New outfit CTA. Persisted via the outfits store;
 * hydration-gated like /saved.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { OutfitCard } from '@/components/outfits/OutfitCard';
import { useOutfits, type SavedOutfit } from '@/lib/store/outfits';
import { useHydrated } from '@/lib/store/useStore';

export default function OutfitsPage() {
  const router = useRouter();
  const { show } = useToast();
  const hydrated = useHydrated();
  const outfits = useOutfits((s) => s.outfits);
  const removeOutfit = useOutfits((s) => s.removeOutfit);
  const [pendingDelete, setPendingDelete] = useState<SavedOutfit | null>(null);

  const sorted = useMemo(
    () =>
      [...outfits].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [outfits],
  );

  const confirmDelete = () => {
    if (!pendingDelete) return;
    removeOutfit(pendingDelete.id);
    show(`Deleted “${pendingDelete.name}”`, 'info');
    setPendingDelete(null);
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <h1 className="text-screen-title font-bold text-text-primary">
          Your outfits
        </h1>
        <Button
          variant="primary"
          size="sm"
          icon="plus"
          className="rounded-full"
          onClick={() => router.push('/outfits/builder')}
        >
          New outfit
        </Button>
      </div>

      <div className="py-4">
        {!hydrated ? (
          <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[0.72] rounded-xl" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="layers"
            title="No outfits yet"
            subtitle="Build outfits from items you've saved."
            actionLabel="New outfit"
            onAction={() => router.push('/outfits/builder')}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-4">
            {sorted.map((outfit) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Destructive confirm — mirrors the mobile ConfirmationSheet. */}
      <Sheet
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete outfit"
        maxWidth={420}
      >
        <div className="px-5 py-5">
          <p className="text-body text-text-secondary">
            Delete “{pendingDelete?.name}”? This can’t be undone.
          </p>
          <div className="mt-5 flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button variant="danger" fullWidth onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
