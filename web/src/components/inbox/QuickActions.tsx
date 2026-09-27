'use client';

/**
 * QuickActions — the action dock under the identity hero, ported from
 * mobile GroupQuickActions: a single row of transparent icon + label
 * targets. No containers — containment is reserved for meaning, so each
 * action is a plain 44px+ target whose only state signal is colour and a
 * spinner while a mutation is in flight.
 */

import { Icon, type AppIconName } from '@/components/ui/Icon';

export interface QuickAction {
  key: string;
  label: string;
  icon: AppIconName;
  /** Filled glyph + brand tint (e.g. muted state). */
  active?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
  'aria-label'?: string;
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="mt-3 flex items-stretch justify-between gap-2 border-y border-border-subtle px-4">
      {actions.map((action) => {
        const disabled = action.disabled || action.busy;
        return (
          <button
            key={action.key}
            type="button"
            onClick={action.onPress}
            disabled={disabled}
            aria-label={action['aria-label'] ?? action.label}
            aria-pressed={action.active || undefined}
            className={`pressable flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 ${
              action.active ? 'text-brand' : 'text-text-primary'
            } ${disabled ? 'opacity-55' : ''}`}
          >
            <span className="flex h-7 w-7 items-center justify-center" aria-hidden>
              {action.busy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-brand" />
              ) : (
                <Icon name={action.icon} size={22} filled={action.active} />
              )}
            </span>
            <span className="clamp-1 text-meta font-medium">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
