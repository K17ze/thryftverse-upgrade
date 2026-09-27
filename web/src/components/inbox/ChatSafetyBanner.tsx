'use client';

/**
 * ChatSafetyBanner — the in-thread safety prompt, a web port of the
 * mobile ChatSafetyBanner. Renders above the message stream only when
 * the detector fired (see chatSafety.ts); level emphasis comes from the
 * icon/text colour over a quiet surfaceAlt strip — hairline, no card
 * chrome. Danger warnings pin (non-dismissible); caution dismisses via ×.
 */

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import type { ChatSafetyWarning } from './chatSafety';

export function ChatSafetyBanner({
  warning,
  onDismiss,
}: {
  warning: ChatSafetyWarning;
  onDismiss?: () => void;
}) {
  const tone =
    warning.level === 'danger'
      ? 'text-danger-text'
      : warning.level === 'caution'
        ? 'text-warning-text'
        : 'text-text-muted';
  const textTone =
    warning.level === 'danger'
      ? 'text-danger-text'
      : warning.level === 'caution'
        ? 'text-warning-text'
        : 'text-text-secondary';
  return (
    <div
      role="alert"
      className="flex shrink-0 items-start gap-2 border-b border-border-subtle bg-surface-alt px-4 py-2"
    >
      <Icon
        name={warning.level === 'danger' ? 'warning' : warning.level === 'caution' ? 'alert' : 'lock'}
        size={14}
        className={`mt-0.5 shrink-0 ${tone}`}
      />
      <p className={`clamp-2 min-w-0 flex-1 text-meta ${textTone}`}>{warning.message}</p>
      {warning.dismissible && onDismiss ? (
        <IconButton
          name="close"
          size={12}
          aria-label="Dismiss safety warning"
          className="-mr-1 -mt-0.5 h-7 w-7 shrink-0"
          onClick={onDismiss}
        />
      ) : null}
    </div>
  );
}
