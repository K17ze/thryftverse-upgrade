'use client';

/**
 * DangerZone — web port of mobile FlagshipDangerZone.
 *
 * The one sanctioned surface for destructive actions: a quiet danger-subtle
 * panel with a title, a plain-language consequence description, and a single
 * destructive action. Destructive actions are separated, never blended into
 * the action grammar (AGENTS.md §4 — coherent action placement).
 */
import { Button } from '@/components/ui/Button';

export interface DangerZoneProps {
  title: string;
  /** What actually happens — plain language, no hedging. */
  description: string;
  actionLabel: string;
  onAction: () => void;
  /** false renders a secondary button (for gated-but-not-destructive rows). */
  destructive?: boolean;
  className?: string;
}

export function DangerZone({
  title,
  description,
  actionLabel,
  onAction,
  destructive = true,
  className = '',
}: DangerZoneProps) {
  return (
    <section
      className={`rounded-lg border border-danger-border bg-danger-subtle p-4 ${className}`}
      aria-label={title}
    >
      <h3 className="text-section-title font-semibold text-danger-text">{title}</h3>
      <p className="mb-4 mt-1.5 text-body text-text-secondary">{description}</p>
      <Button
        variant={destructive ? 'danger' : 'secondary'}
        size="sm"
        onClick={onAction}
        className={destructive ? '' : 'text-danger-text'}
      >
        {actionLabel}
      </Button>
    </section>
  );
}
