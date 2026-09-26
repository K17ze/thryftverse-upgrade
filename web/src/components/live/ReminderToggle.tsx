'use client';

/**
 * ReminderToggle — the persisted "Remind me" control behind the schedule
 * and the Coming up rail. One grammar for both placements: set state reads
 * as set (brand-subtle fill + check), not set is a quiet surface chip. The
 * flag persists through the liveReminders store; live mode also patches
 * the session cache. Toast copy lives here so every placement agrees.
 */

import type { LiveSession } from '@/lib/data/fixtures-media';
import { userById } from '@/lib/data/fixtures';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useLiveReminders } from './liveReminders';

interface ReminderToggleProps {
  session: LiveSession;
  /** Rail cards run compact; timeline rows use the same geometry. */
  className?: string;
}

export function ReminderToggle({ session, className = '' }: ReminderToggleProps) {
  const { show } = useToast();
  const { reminded, toggle } = useLiveReminders();
  const isReminded = reminded.has(session.id) || session.reminderSet === true;

  return (
    <button
      type="button"
      onClick={() => {
        const willRemind = toggle(session);
        show(
          willRemind
            ? `We'll remind you when ${userById(session.sellerId)?.username ?? 'the show'} goes live`
            : 'Reminder removed',
          'info',
        );
      }}
      aria-pressed={isReminded}
      className={`pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold ${
        isReminded
          ? 'bg-brand-subtle text-text-primary'
          : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
      } ${className ?? ''}`}
    >
      <Icon name={isReminded ? 'check' : 'notifications'} size={14} filled={isReminded} />
      {isReminded ? 'Reminder set' : 'Remind me'}
    </button>
  );
}
