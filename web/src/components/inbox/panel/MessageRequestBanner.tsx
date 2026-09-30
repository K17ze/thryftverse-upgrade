'use client';

/**
 * MessageRequestBanner — banner displayed for unaccepted direct message requests.
 * Allows user to Accept (unlocking chat composer) or Decline (removing thread).
 */

import { Button } from '@/components/ui/Button';

interface MessageRequestBannerProps {
  show: boolean;
  title: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function MessageRequestBanner({
  show,
  title,
  busy,
  onAccept,
  onDecline,
}: MessageRequestBannerProps) {
  if (!show) return null;

  return (
    <div className="shrink-0 border-b border-border-subtle bg-surface-alt px-4 py-2.5">
      <div className="mx-auto flex w-full items-center gap-3 lg:max-w-3xl">
        <p className="min-w-0 flex-1 text-meta text-text-secondary">
          <span className="font-semibold text-text-primary">{title}</span>{' '}
          wants to message you — accept to reply.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onDecline}
          disabled={busy}
        >
          Decline
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onAccept}
          disabled={busy}
        >
          Accept
        </Button>
      </div>
    </div>
  );
}
