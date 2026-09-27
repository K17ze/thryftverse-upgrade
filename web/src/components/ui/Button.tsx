'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Icon, type AppIconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: AppIconName;
  iconFilled?: boolean;
  fullWidth?: boolean;
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-caption gap-1.5',
  md: 'h-11 px-5 text-body-emphasis gap-2',
  lg: 'h-[52px] px-6 text-body-emphasis gap-2',
};

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-text-inverse hover:bg-brand-pressed font-semibold',
  secondary: 'bg-surface-alt text-text-primary hover:bg-surface-raised font-semibold',
  quiet: 'bg-transparent text-text-primary hover:bg-brand-subtle font-medium',
  outline:
    'bg-transparent text-text-primary border border-border hover:border-text-muted font-semibold',
  danger: 'bg-danger text-scrim-text-primary hover:opacity-90 font-semibold',
};

/** One button grammar — primary CTA uses brand ink, everything else recedes. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconFilled, fullWidth, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[
        'pressable inline-flex items-center justify-center rounded-md select-none',
        'disabled:opacity-50 disabled:pointer-events-none',
        SIZES[size],
        VARIANTS[variant],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {icon ? <Icon name={icon} filled={iconFilled} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
    </button>
  );
});
