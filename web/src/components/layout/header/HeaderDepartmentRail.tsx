'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from '../DepartmentNav';
import { useLocale } from '@/lib/i18n';

export function HeaderDepartmentRail() {
  const pathname = usePathname();
  const { t } = useLocale();

  return (
    <nav
      className="no-scrollbar hidden items-center gap-1 overflow-x-auto border-t border-border-subtle px-3 md:flex lg:hidden"
      aria-label={t('chrome.header.departments')}
    >
      {NAV.map((item) => {
        const active =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`pressable relative shrink-0 px-3 py-2.5 text-body-emphasis ${
              active ? 'text-text-primary' : 'text-text-secondary'
            }`}
          >
            {t(`chrome.nav.${item.labelKey}`)}
            {active ? (
              <span
                className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-text-primary"
                aria-hidden
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
