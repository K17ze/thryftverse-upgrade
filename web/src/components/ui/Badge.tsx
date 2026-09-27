import { Icon, type AppIconName } from './Icon';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'trust' | 'brand';
  icon?: AppIconName;
  className?: string;
}

const VARIANTS = {
  neutral: 'bg-surface-alt text-text-secondary',
  success: 'bg-success-subtle text-success-text',
  warning: 'bg-warning-subtle text-warning-text',
  danger: 'bg-danger-subtle text-danger-text',
  trust: 'bg-commerce-trust-subtle text-commerce-trust',
  brand: 'bg-brand-subtle text-text-primary',
};

/** Quiet status badge — text-grade ink, subtle tint fill, no chrome. */
export function Badge({ children, variant = 'neutral', icon, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-meta font-semibold tracking-wide ${VARIANTS[variant]} ${className}`}
    >
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

/** Sustainability grade chip — A/B only on cards, leaf glyph. */
export function SustainabilityChip({ grade, onMedia }: { grade: 'A' | 'B' | 'C' | 'D'; onMedia?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-meta font-semibold ${
        onMedia
          ? 'bg-overlay text-scrim-text-primary'
          : 'bg-success-subtle text-success-text'
      }`}
    >
      <Icon name="leaf" size={11} filled />
      {grade}
    </span>
  );
}
