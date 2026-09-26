'use client';

/**
 * ConfirmSheet — the shared confirmation dialog behind destructive
 * conversation actions (leave, remove, clear), a compact port of the
 * mobile ConfirmationSheet on the web Sheet primitive.
 */

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';

export interface ConfirmSheetState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm?: () => void;
}

export const CLOSED_CONFIRM: ConfirmSheetState = {
  open: false,
  title: '',
  message: '',
};

export function ConfirmSheet({
  state,
  onClose,
}: {
  state: ConfirmSheetState;
  onClose: () => void;
}) {
  return (
    <Sheet open={state.open} onClose={onClose} title={state.title} maxWidth={400}>
      <div className="px-5 pb-5">
        <p className="text-body text-text-secondary">{state.message}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" size="md" fullWidth onClick={onClose}>
            {state.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={state.variant === 'danger' ? 'danger' : 'primary'}
            size="md"
            fullWidth
            onClick={() => {
              onClose();
              state.onConfirm?.();
            }}
          >
            {state.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
