'use client';

/**
 * PartialDataBanner — quiet inline prompt when saved address/payment data
 * is incomplete versus what checkout needs. Web port of the mobile
 * CheckoutPartialDataBanner: warning-subtle tone, one message, one action.
 * The checkout stays usable — this names what's missing, not blocks.
 */

import { Icon, type AppIconName } from '@/components/ui/Icon';

export function PartialDataBanner({
  icon,
  message,
  actionLabel,
  onAction,
}: {
  icon: AppIconName;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-lg border border-warning-border bg-warning-subtle px-4 py-2.5"
    >
      <Icon name={icon} size={16} className="shrink-0 text-warning-text" />
      <p className="tnum min-w-0 flex-1 text-meta font-medium text-warning-text">{message}</p>
      <button
        type="button"
        onClick={onAction}
        className="pressable shrink-0 rounded-md border border-border bg-surface-alt px-2.5 py-1 text-meta font-semibold text-warning-text hover:text-text-primary"
      >
        {actionLabel}
      </button>
    </div>
  );
}
