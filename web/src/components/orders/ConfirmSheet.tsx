'use client';

/**
 * ConfirmSheet — the mobile confirm-sheet pattern: a title, one honest
 * consequence sentence, and a labelled confirm/cancel pair. Used for every
 * high-consequence order action (escrow release, dispatch, cancel).
 */

import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';

export interface ConfirmSheetState {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
}

interface Props {
  sheet: ConfirmSheetState | null;
  busy?: boolean;
  onDismiss: () => void;
}

export function ConfirmSheet({ sheet, busy = false, onDismiss }: Props) {
  if (!sheet) return null;
  return (
    <Sheet open onClose={onDismiss} title={sheet.title} maxWidth={440}>
      <div className="px-5 pb-6">
        <p className="text-body text-text-secondary">{sheet.message}</p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" size="md" fullWidth onClick={onDismiss} disabled={busy}>
            {sheet.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={sheet.variant === 'destructive' ? 'danger' : 'primary'}
            size="md"
            fullWidth
            disabled={busy}
            onClick={sheet.onConfirm}
          >
            {busy ? 'Working…' : sheet.confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
