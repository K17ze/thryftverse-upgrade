'use client';

/**
 * SettingsRail — the desktop left nav for the /settings tree: every real
 * destination grouped under its index-section label, sticky beside the
 * content column (Linear/Vinted grammar). Hidden below lg — mobile keeps
 * the existing list→page pattern.
 *
 * Destinations are derived from SETTINGS_DESTINATIONS so the rail can
 * never drift from the index. Sheet-backed prefs (language, accent,
 * density, verification, age, report) deep-link into the index as
 * /settings?sheet=… — SettingsView opens them on arrival. The dark-theme
 * switch is an inline control on the index, not a destination, so it is
 * the one entry not listed.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { SETTINGS_DESTINATIONS, type SettingsDestination } from './settingsDestinations';

function railHref(d: SettingsDestination): string | null {
  switch (d.target.kind) {
    case 'route':
      return d.target.href;
    case 'sheet':
      return `/settings?sheet=${d.target.sheet}`;
    case 'theme':
      // An inline control on the index — not a navigable destination.
      return null;
  }
}

function RailLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon?: AppIconName;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`pressable flex min-h-11 items-center gap-2.5 rounded-md px-3 text-body ${
        active
          ? 'bg-surface-alt font-medium text-text-primary'
          : 'text-text-secondary hover:bg-row hover:text-text-primary'
      }`}
    >
      {icon ? (
        <Icon
          name={icon}
          size={16}
          className={`shrink-0 ${active ? 'text-text-primary' : 'text-text-muted'}`}
        />
      ) : null}
      <span className="clamp-1">{label}</span>
    </Link>
  );
}

export function SettingsRail() {
  const pathname = usePathname();

  // Group destinations by their index section, preserving declaration
  // order — the rail mirrors the mobile section hierarchy 1:1.
  const groups = useMemo(() => {
    const bySection = new Map<string, SettingsDestination[]>();
    for (const d of SETTINGS_DESTINATIONS) {
      if (d.target.kind === 'theme') continue;
      const list = bySection.get(d.section) ?? [];
      list.push(d);
      bySection.set(d.section, list);
    }
    return [...bySection.entries()].map(([section, items]) => ({ section, items }));
  }, []);

  return (
    <nav aria-label="Settings" className="hidden lg:block">
      <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-10 pr-1">
        <RailLink
          href="/settings"
          icon="settings"
          label="All settings"
          active={pathname === '/settings'}
        />
        {groups.map((group) => (
          <div key={group.section} className="mt-6">
            <p className="px-3 pb-1.5 text-label text-text-muted">
              {group.section}
            </p>
            <div className="space-y-px">
              {group.items.map((d) => {
                const href = railHref(d);
                if (!href) return null;
                return (
                  <RailLink
                    key={d.id}
                    href={href}
                    icon={d.icon}
                    label={d.label}
                    active={d.target.kind === 'route' && pathname === d.target.href}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
