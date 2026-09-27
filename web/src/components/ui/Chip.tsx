'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Icon, type AppIconName } from './Icon';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: AppIconName;
}

/** Category/filter pill — one chip grammar across the app. The visible
 *  pill stays compact (h-9); the ::after pad-out stretches the hit area to
 *  44px tall so taps land on the control, not the gap beside it. */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected, icon, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={[
        'pressable relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-body font-medium after:absolute after:-inset-y-1 after:content-[""]',
        'disabled:opacity-40 disabled:pointer-events-none',
        selected
          ? 'bg-brand text-text-inverse'
          : 'bg-surface-alt text-text-primary hover:bg-surface-raised',
        className,
      ].join(' ')}
      {...rest}
    >
      {icon ? <Icon name={icon} filled={selected} size={16} /> : null}
      {children}
    </button>
  );
});
