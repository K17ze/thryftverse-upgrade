'use client';

/**
 * StickyFooter — web port of mobile FlagshipStickyFooter + ActionCluster.
 *
 * A bottom-pinned action bar: hairline top border, flat background, one
 * action cluster. Sits above the mobile tab bar on <md (the tab bar is
 * fixed at 68px + safe-area), flush with the viewport bottom on ≥md.
 *
 *   <StickyFooter
 *     actions={[
 *       { label: t('common.buttons.cancel'), onClick: onClose, variant: 'secondary' },
 *       { label: 'Publish', onClick: onPublish, loading: publishing },
 *     ]}
 *     layout="row"
 *   />
 *
 * Contract: one cluster, one grammar — primary action last (stack) or
 * right (row). No decorative chrome, no shadows; the hairline is the edge.
 */
import { Button } from '@/components/ui/Button';
import type { AppIconName } from '@/components/ui/Icon';

export interface FooterAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: AppIconName;
}

export interface StickyFooterProps {
  actions: FooterAction[];
  /** stack (mobile default) or row — matches FlagshipActionCluster. */
  layout?: 'stack' | 'row';
  className?: string;
}

export function StickyFooter({ actions, layout = 'stack', className = '' }: StickyFooterProps) {
  const isRow = layout === 'row';
  return (
    <div
      className={`sticky bottom-[calc(68px+env(safe-area-inset-bottom,0px))] z-elevated border-t border-border-subtle bg-background md:bottom-0 ${
        isRow ? 'flex items-center gap-2' : 'flex flex-col gap-2'
      } ${className}`}
      style={{
        paddingInline: 'var(--density-gutter)',
        paddingBlock: 'var(--density-row-py, 12px)',
      }}
    >
      {actions.map((action, i) => (
        <Button
          key={`${action.label}-${i}`}
          variant={action.variant ?? 'primary'}
          size={action.size ?? 'md'}
          icon={action.icon}
          fullWidth={!isRow}
          disabled={action.disabled || action.loading}
          aria-busy={action.loading || undefined}
          onClick={action.onClick}
          className={isRow ? 'flex-1' : ''}
        >
          {action.loading ? '…' : action.label}
        </Button>
      ))}
    </div>
  );
}
