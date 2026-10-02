import type { ReactNode } from 'react';

/**
 * SettingsSection — caps label + hairline-separated row group on a flat
 * canvas. No cards; spacing and hairlines carry the structure.
 */

interface SettingsSectionProps {
  title: string;
  /** Anchor target for the desktop rail's jump links — the index view
      stamps settingsSectionId(title); detail views leave it unset. */
  id?: string;
  children: ReactNode;
}

export function SettingsSection({ title, id, children }: SettingsSectionProps) {
  return (
    <section id={id} className="mt-8 scroll-mt-24 first:mt-0">
      <h2 className="px-4 pb-2 text-label text-text-muted sm:px-5">
        {title}
      </h2>
      <div className="divide-y divide-border-subtle border-y border-border-subtle">
        {children}
      </div>
    </section>
  );
}
