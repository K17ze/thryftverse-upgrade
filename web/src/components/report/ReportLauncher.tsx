'use client';

/**
 * ReportLauncher — the overflow-menu entry point for reporting. Renders a
 * transparent "more" affordance, a compact options sheet with the report
 * row, then the staged ReportSheet. One component keeps the PDP and
 * profile integrations to a single element each.
 */

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import type { ReportTarget } from './reportModel';
import { ReportSheet } from './ReportSheet';

interface ReportLauncherProps {
  target: ReportTarget;
  /** Title of the small overflow sheet — e.g. "Listing options". */
  menuTitle: string;
  /** The single row label — e.g. "Report this item". */
  menuLabel: string;
}

export function ReportLauncher({ target, menuTitle, menuLabel }: ReportLauncherProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <>
      <IconButton
        name="more"
        aria-label="More options"
        onClick={() => setMenuOpen(true)}
      />
      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={menuTitle}
        maxWidth={400}
      >
        <div className="px-5 pb-5">
          <ul className="flex flex-col">
            <li>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name="flag" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">{menuLabel}</span>
                <Icon name="forward" size={16} className="text-text-muted" />
              </button>
            </li>
          </ul>
        </div>
      </Sheet>
      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        target={target}
      />
    </>
  );
}
