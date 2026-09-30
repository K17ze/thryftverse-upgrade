'use client';

/**
 * ComposerBanners — staging banners rendered directly above the compose textarea:
 * 1. Edit mode banner: shows original text preview and cancel button
 * 2. Quoted reply banner: shows sender name and message preview
 * 3. Chat safety banner: non-blocking warning for off-platform payment / urgency grammar
 */

import { IconButton } from '@/components/ui/IconButton';
import { ChatSafetyBanner } from '../ChatSafetyBanner';
import type { ChatSafetyWarning } from '../chatSafety';

export interface ComposerReply {
  senderName: string;
  text: string;
}

interface ComposerBannersProps {
  activeEdit?: { id: string; text: string } | null;
  onCancelEdit?: () => void;
  replyTo?: ComposerReply | null;
  onCancelReply?: () => void;
  warning?: ChatSafetyWarning | null;
  warningDismissed?: boolean;
  onDismissWarning?: () => void;
  disabled?: boolean;
}

export function ComposerBanners({
  activeEdit,
  onCancelEdit,
  replyTo,
  onCancelReply,
  warning,
  warningDismissed = false,
  onDismissWarning,
  disabled = false,
}: ComposerBannersProps) {
  return (
    <>
      {/* Edit staging banner */}
      {activeEdit ? (
        <div className="flex items-stretch gap-2 px-3 pt-2.5 md:px-4">
          <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-border-subtle bg-surface">
            <span className="w-[3px] self-stretch rounded-sm bg-brand" aria-hidden />
            <span className="min-w-0 flex-1 px-2.5 py-2">
              <span className="block text-meta font-semibold text-brand">
                Edit message
              </span>
              <span className="clamp-1 block text-caption text-text-secondary">
                {activeEdit.text}
              </span>
            </span>
          </div>
          <IconButton
            name="close"
            size={16}
            aria-label="Cancel edit"
            onClick={onCancelEdit}
            disabled={disabled}
          />
        </div>
      ) : null}

      {/* Quoted reply banner */}
      {!activeEdit && replyTo ? (
        <div className="flex items-stretch gap-2 px-3 pt-2.5 md:px-4">
          <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-border-subtle bg-surface">
            <span className="w-[3px] self-stretch rounded-sm bg-brand" aria-hidden />
            <span className="min-w-0 flex-1 px-2.5 py-2">
              <span className="block text-meta font-semibold text-brand">
                {replyTo.senderName}
              </span>
              <span className="clamp-1 block text-caption text-text-secondary">
                {replyTo.text}
              </span>
            </span>
          </div>
          <IconButton
            name="close"
            size={16}
            aria-label="Cancel reply"
            onClick={onCancelReply}
            disabled={disabled}
          />
        </div>
      ) : null}

      {/* Draft safety warning banner */}
      {warning && !warningDismissed && onDismissWarning ? (
        <div className="px-3 pt-2.5 md:px-4">
          <ChatSafetyBanner
            warning={warning}
            onDismiss={onDismissWarning}
          />
        </div>
      ) : null}
    </>
  );
}
