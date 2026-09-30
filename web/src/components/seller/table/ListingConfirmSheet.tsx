'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import type { ManagedListingRow } from '../listingManagementModel';

export type ConfirmTarget =
  | { kind: 'mark-sold'; row: ManagedListingRow }
  | { kind: 'delete-draft'; row: ManagedListingRow }
  | { kind: 'bulk-delete'; rows: ManagedListingRow[] };

interface ListingConfirmSheetProps {
  target: ConfirmTarget | null;
  onClose: () => void;
  onConfirm: () => void;
  canRelist?: boolean;
}

export function ListingConfirmSheet({
  target,
  onClose,
  onConfirm,
  canRelist = false,
}: ListingConfirmSheetProps) {
  const confirmCopy = useMemo(() => {
    if (!target) return null;
    if (target.kind === 'delete-draft') {
      return {
        title: 'Delete this draft?',
        body: `“${target.row.listing.title || 'Untitled draft'}” will be removed permanently — it can't be recovered.`,
        action: 'Delete',
      };
    }
    if (target.kind === 'bulk-delete') {
      const n = target.rows.length;
      const listings = target.rows.filter((r) => r.status !== 'draft').length;
      const drafts = n - listings;
      return {
        title: `Delete ${n} item${n === 1 ? '' : 's'}?`,
        body: `${[
          listings ? `${listings} listing${listings === 1 ? '' : 's'}` : null,
          drafts ? `${drafts} draft${drafts === 1 ? '' : 's'}` : null,
        ]
          .filter(Boolean)
          .join(' and ')} will be removed permanently — this can't be undone.`,
        action: 'Delete',
      };
    }
    return {
      title: 'Mark as sold?',
      body: canRelist
        ? `“${target.row.listing.title}” will show as sold and come off the public shelf. You can relist it anytime.`
        : `“${target.row.listing.title}” will show as sold and come off the public shelf — sold is permanent, it can't be relisted.`,
      action: 'Mark sold',
    };
  }, [target, canRelist]);

  return (
    <Sheet
      open={target != null}
      onClose={onClose}
      title={confirmCopy?.title}
      ariaLabel="Listing action"
      maxWidth={420}
    >
      <div className="px-5 py-5">
        <p className="text-body text-text-secondary">{confirmCopy?.body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="quiet" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={target?.kind !== 'mark-sold' ? 'danger' : 'primary'}
            size="md"
            onClick={onConfirm}
          >
            {confirmCopy?.action}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
