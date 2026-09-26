'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Icon, type AppIconName } from './Icon';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  name: AppIconName;
  filled?: boolean;
  /** Visible glyph size. Hit area stays 44px — chrome is separate. */
  size?: number;
  /** Render on media — adds drop-shadow scrim for legibility. */
  onMedia?: boolean;
  /** Contained chrome for inputs/selected surfaces — transparent by default. */
  contained?: boolean;
}

/**
 * IconButton — 44px hit area, 20–24px visible glyph, no decorative chrome.
 * Mirrors the mobile grammar: transparent targets, glyph legibility via
 * text-shadow on media, containment only where it has meaning.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { name, filled, size = 22, onMedia, contained, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={[
        'pressable inline-flex h-11 w-11 items-center justify-center rounded-full',
        'disabled:opacity-40 disabled:pointer-events-none',
        contained
          ? 'bg-surface-alt hover:bg-surface-raised'
          : 'hover:bg-brand-subtle',
        onMedia ? 'text-scrim-text-primary drop-scrim' : 'text-text-primary',
        className,
      ].join(' ')}
      {...rest}
    >
      <Icon name={name} filled={filled} size={size} aria-label={rest['aria-label'] ?? name} />
    </button>
  );
});
