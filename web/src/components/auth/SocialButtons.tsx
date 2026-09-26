'use client';

/**
 * SocialButtons — quiet outline social auth paths. Same io5 icon family,
 * same button grammar; brand glyphs stay monochrome.
 */

import { IoLogoApple, IoLogoGoogle } from 'react-icons/io5';

interface SocialButtonsProps {
  loading?: 'google' | 'apple' | null;
  onGoogle: () => void;
  onApple: () => void;
}

const BTN =
  'pressable inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-border px-5 text-body-emphasis font-semibold text-text-primary transition-colors hover:border-text-muted disabled:pointer-events-none disabled:opacity-50';

export function SocialButtons({ loading, onGoogle, onApple }: SocialButtonsProps) {
  return (
    <div className="grid gap-2.5">
      <button type="button" onClick={onGoogle} disabled={!!loading} className={BTN}>
        <IoLogoGoogle size={18} aria-hidden />
        {loading === 'google' ? 'Continuing' : 'Continue with Google'}
      </button>
      <button type="button" onClick={onApple} disabled={!!loading} className={BTN}>
        <IoLogoApple size={18} aria-hidden />
        {loading === 'apple' ? 'Continuing' : 'Continue with Apple'}
      </button>
    </div>
  );
}
