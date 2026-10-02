'use client';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import type { CoOwnAlert } from '../alertStore';
import { gbp } from '../format';

interface DeleteAlertSheetProps {
  pendingDelete: CoOwnAlert | null;
  title: string;
  deleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteAlertSheet({
  pendingDelete,
  title,
  deleting,
  onConfirm,
  onClose,
}: DeleteAlertSheetProps) {
  return (
    <Sheet
      open={pendingDelete != null}
      onClose={onClose}
      title="Delete alert?"
      maxWidth={420}
    >
      <div className="p-5">
        <p className="text-body text-text-secondary">
          {pendingDelete
            ? `Remove the ${pendingDelete.direction} ${gbp(
                pendingDelete.targetPriceGbp,
              )} alert on ${title}?`
            : ''}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
