import { Icon, type AppIconName } from './Icon';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: AppIconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

/** Empty state — restrained flat glyph, one title, optional single action. */
export function EmptyState({ icon = 'search', title, subtitle, actionLabel, onAction, compact }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? 'py-12' : 'py-24'} px-6`}
      role="status"
    >
      <Icon name={icon} size={28} className="mb-4 text-text-muted" />
      <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
      {subtitle ? <p className="mt-1.5 max-w-sm text-body text-text-secondary">{subtitle}</p> : null}
      {actionLabel && onAction ? (
        <Button variant="secondary" size="md" className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
