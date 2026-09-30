'use client';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';

interface StorefrontRollbackSheetProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function StorefrontRollbackSheet({
  open,
  busy,
  onClose,
  onConfirm,
}: StorefrontRollbackSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Revert to draft?">
      <div className="px-4 pb-6 pt-1">
        <p className="text-body text-text-secondary">
          Your shop comes off your profile until you publish it again. Your
          announcement, policies and pins stay saved.
        </p>
        <div className="mt-5 flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            disabled={busy}
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            Revert to draft
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Keep live
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
