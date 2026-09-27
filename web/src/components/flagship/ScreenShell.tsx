/**
 * ScreenShell — web port of mobile FlagshipScreen.
 *
 * The composition contract every content surface shares:
 *   - optional `header` — a screen-level bar, sticky under the app header
 *     (sticky top-14/md:top-16), hairline-separated, density-aware gutter
 *   - `children` — scroll content, padded by `--density-gutter`
 *   - optional `footer` — a StickyFooter region rendered after content
 *
 * Density geometry comes from the `--density-*` CSS vars (globals.css) so
 * the shell needs no hooks and stays server-component friendly.
 *
 * Not a second global chrome — the app-level Header/tab bar/Footer live in
 * layout/AppShell. This is the per-screen contract for surfaces that want
 * the mobile FlagshipScreen structure.
 */
import type { ReactNode } from 'react';

export interface ScreenShellProps {
  children: ReactNode;
  /** Screen-level bar — sticky beneath the global header. */
  header?: ReactNode;
  /** Bottom action region — render a StickyFooter (or equivalent) here. */
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function ScreenShell({
  children,
  header,
  footer,
  className = '',
  contentClassName = '',
}: ScreenShellProps) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      {header ? (
        <div
          className="sticky top-14 z-elevated border-b border-border-subtle bg-background md:top-16"
          style={{ paddingInline: 'var(--density-gutter)' }}
        >
          {header}
        </div>
      ) : null}
      <div
        className={`flex-1 ${contentClassName}`}
        style={{ paddingInline: 'var(--density-gutter)' }}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}
