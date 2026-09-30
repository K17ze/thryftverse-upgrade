'use client';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';

interface EndPromotionConfirmSheetProps {
  confirmEnd: string | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
}

export function EndPromotionConfirmSheet({
  confirmEnd,
  onClose,
  onConfirm,
}: EndPromotionConfirmSheetProps) {
  return (
    <Sheet
      open={confirmEnd != null}
      onClose={onClose}
      title="End this promotion?"
      maxWidth={420}
    >
      <div className="px-5 py-5">
        <p className="text-body text-text-secondary">
          The listing leaves Sponsored placements immediately and no further daily charges run.
          Ended promotions can&apos;t be resumed — you&apos;d create a new one.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="quiet" size="md" onClick={onClose}>
            Keep running
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={() => {
              if (confirmEnd) onConfirm(confirmEnd);
              onClose();
            }}
          >
            End promotion
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
