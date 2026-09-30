'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';

interface PosterOptionsSheetProps {
  id: string;
  open: boolean;
  onClose: () => void;
  storyStatus?: 'active' | 'archived';
  onCopyLink: () => void;
  onArchive: () => void;
  onDeleteRequest: () => void;
  confirm: ConfirmSheetState | null;
  onDismissConfirm: () => void;
}

export function PosterOptionsSheet({
  id,
  open,
  onClose,
  storyStatus,
  onCopyLink,
  onArchive,
  onDeleteRequest,
  confirm,
  onDismissConfirm,
}: PosterOptionsSheetProps) {
  const router = useRouter();

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Story options" maxWidth={440}>
        <div className="px-5 pb-6 pt-1">
          <button
            type="button"
            onClick={() => {
              onClose();
              onCopyLink();
            }}
            className="pressable flex w-full items-center gap-3 rounded-md py-3 text-left text-body-emphasis text-text-primary"
          >
            <Icon name="link" size={20} />
            Copy link
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push(`/poster/${id}/activity`);
            }}
            className="pressable flex w-full items-center gap-3 rounded-md py-3 text-left text-body-emphasis text-text-primary"
          >
            <Icon name="analytics" size={20} />
            View activity
          </button>
          {storyStatus === 'active' ? (
            <button
              type="button"
              onClick={onArchive}
              className="pressable flex w-full items-center gap-3 rounded-md py-3 text-left text-body-emphasis text-text-primary"
            >
              <Icon name="inventory" size={20} />
              Archive story
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onClose();
              onDeleteRequest();
            }}
            className="pressable flex w-full items-center gap-3 rounded-md py-3 text-left text-body-emphasis text-danger-text"
          >
            <Icon name="trash" size={20} />
            Delete story
          </button>
        </div>
      </Sheet>

      <ConfirmSheet sheet={confirm} onDismiss={onDismissConfirm} />
    </>
  );
}
