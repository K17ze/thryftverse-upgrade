import type { ReactNode } from 'react';

/**
 * SettingsSection — caps label + hairline-separated row group on a flat
 * canvas. No cards; spacing and hairlines carry the structure.
 */

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="px-4 pb-2 text-label font-semibold uppercase tracking-wider text-text-muted sm:px-5">
        {title}
      </h2>
      <div className="divide-y divide-border-subtle border-y border-border-subtle">
        {children}
      </div>
    </section>
  );
}
