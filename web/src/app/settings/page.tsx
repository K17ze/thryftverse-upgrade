import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SettingsView } from '@/components/settings/SettingsView';
import { Skeleton } from '@/components/ui/Skeleton';

export const metadata: Metadata = {
  title: 'Settings',
};

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl pb-16 pt-4 md:pt-8 lg:mx-0">
      <h1 className="px-4 pb-2 text-screen-title text-text-primary sm:px-5">
        Settings
      </h1>
      {/* Suspense: SettingsView reads ?sheet= deep links via
          useSearchParams — same boundary the ledger page uses. The
          fallback mirrors the settings-list geometry (hairline rows) so
          the bailout paints structure, not blank. */}
      <Suspense
        fallback={
          <div className="px-4 sm:px-5" aria-busy aria-label="Loading settings">
            <div className="divide-y divide-border-subtle">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-3.5">
                  <Skeleton className="h-5 w-5 rounded-md" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        }
      >
        <SettingsView />
      </Suspense>
    </div>
  );
}
