'use client';

/**
 * SettingsRail — the desktop left rail for the /settings tree, sticky
 * beside the content column. Hidden below lg — mobile keeps the existing
 * list→page pattern.
 *
 * Two grammars, one per context:
 * - On the index (/settings) the main column already lists every row
 *   once, so the rail is a jump-link TOC of its six section groups —
 *   anchors, not a second copy of the list. A scroll-spy marks the
 *   section under the reading line.
 * - On detail pages the column is unique content, so the rail stays the
 *   full destination nav (Linear/Vinted grammar) for sibling switching.
 *
 * Destinations are derived from SETTINGS_DESTINATIONS so the rail can
 * never drift from the index. Sheet-backed prefs (language, accent,
 * density, verification, age, report) deep-link into the index as
 * /settings?sheet=… — SettingsView opens them on arrival. The dark-theme
 * switch is an inline control on the index, not a destination, so it is
 * the one entry not listed.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import {
  SETTINGS_DESTINATIONS,
  settingsSectionId,
  type SettingsDestination,
} from './settingsDestinations';

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

/** Jump link to an index <section> — real anchor (deep-linkable, right-
 *  clickable), with smooth-scroll layered on top instead of the native
 *  instant jump. */
function AnchorLink({
  id,
  label,
  active,
}: {
  id: string;
  label: string;
  active: boolean;
}) {
  return (
    <a
      href={`#${id}`}
      aria-current={active ? 'location' : undefined}
      onClick={(e) => {
        const el = document.getElementById(id);
        if (!el) return;
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.replaceState(null, '', `#${id}`);
      }}
      className={`pressable flex min-h-11 items-center rounded-md px-3 text-body ${
        active
          ? 'bg-surface-alt font-medium text-text-primary'
          : 'text-text-secondary hover:bg-row hover:text-text-primary'
      }`}
    >
      <span className="clamp-1">{label}</span>
    </a>
  );
}

export function SettingsRail() {
  const pathname = usePathname();
  const isIndex = pathname === '/settings';
  const [activeSection, setActiveSection] = useState<string | null>(null);

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

  // Scroll-spy for the index TOC: the current section is the last one
  // whose top has passed the reading line (a quarter down the viewport).
  // Element ids are re-resolved on every frame tick, so the spy survives
  // the list unmounting/remounting (e.g. while searching) and the
  // Suspense-gated first mount — no observer lifecycle to go stale.
  useEffect(() => {
    if (!isIndex) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const line = window.innerHeight * 0.25;
      let current: string | null = null;
      for (const g of groups) {
        const id = settingsSectionId(g.section);
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActiveSection((prev) => current ?? prev);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [isIndex, groups]);

  return (
    <nav
      aria-label={isIndex ? 'Settings sections' : 'Settings'}
      className="hidden lg:block"
    >
      <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-10 pr-1">
        {isIndex ? (
          <div className="space-y-px">
            {groups.map((g) => {
              const id = settingsSectionId(g.section);
              return (
                <AnchorLink
                  key={id}
                  id={id}
                  label={g.section}
                  active={activeSection === id}
                />
              );
            })}
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </nav>
  );
}
