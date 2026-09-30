'use client';

/**
 * MoodboardOptionsSheet — bottom sheet / dialog presenting board actions:
 * rename board, manage items, toggle public/private visibility, and share link.
 */

import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';

interface MoodboardOptionsSheetProps {
  open: boolean;
  onClose: () => void;
  isPrivate: boolean;
  onStartRename: () => void;
  onStartEditing: () => void;
  onTogglePrivacy: () => void;
  onShare: () => void;
}

export function MoodboardOptionsSheet({
  open,
  onClose,
  isPrivate,
  onStartRename,
  onStartEditing,
  onTogglePrivacy,
  onShare,
}: MoodboardOptionsSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Board options"
      maxWidth={400}
    >
      <div className="px-5 pb-5">
        <ul className="flex flex-col">
          <li>
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartRename();
              }}
              className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
            >
              <Icon name="edit" size={20} />
              <span className="flex-1 text-body-emphasis font-medium">
                Rename board
              </span>
              <Icon name="forward" size={16} className="text-text-muted" />
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartEditing();
              }}
              className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
            >
              <Icon name="layers" size={20} />
              <span className="flex-1 text-body-emphasis font-medium">
                Manage items
              </span>
              <Icon name="forward" size={16} className="text-text-muted" />
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={onTogglePrivacy}
              className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
            >
              <Icon name={isPrivate ? 'lockOpen' : 'lock'} size={20} />
              <span className="flex-1 text-body-emphasis font-medium">
                {isPrivate ? 'Make public' : 'Make private'}
              </span>
            </button>
          </li>
          {!isPrivate ? (
            <li>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onShare();
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name="share" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  Share board
                </span>
                <Icon name="forward" size={16} className="text-text-muted" />
              </button>
            </li>
          ) : null}
        </ul>
      </div>
    </Sheet>
  );
}
