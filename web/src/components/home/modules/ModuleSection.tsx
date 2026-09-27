'use client';

/**
 * ModuleSection — shared chrome for home-feed module bands.
 * Flat canvas grammar: hairline top separator, section title left,
 * optional quiet right-aligned link. No card wrappers, no decoration.
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

interface ModuleSectionProps {
  title: string;
  href?: string;
  linkLabel?: string;
  /** Quiet text-button affordance (e.g. "Clear") — used when there's no
   *  destination to link to. Same chrome weight as the link variant. */
  action?: { label: string; onClick: () => void };
  /** Hairline separator above the band — off for the first module. */
  bordered?: boolean;
  children: React.ReactNode;
}

export function ModuleSection({
  title,
  href,
  linkLabel = 'See all',
  action,
  bordered = true,
  children,
}: ModuleSectionProps) {
  return (
    <section
      aria-label={title}
      className={`${bordered ? 'border-t border-border-subtle' : ''} py-5 sm:py-6`}
    >
      <header className="mb-3 flex items-baseline justify-between gap-4 px-4 sm:px-6">
        <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
        {href ? (
          <Link
            href={href}
            className="pressable flex shrink-0 items-center gap-0.5 text-body font-medium text-text-secondary hover:text-text-primary"
          >
            {linkLabel}
            <Icon name="forward" size={14} />
          </Link>
        ) : action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="pressable shrink-0 text-body font-medium text-text-secondary hover:text-text-primary"
          >
            {action.label}
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}
