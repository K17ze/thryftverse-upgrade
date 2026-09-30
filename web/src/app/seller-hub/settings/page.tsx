'use client';

/**
 * /seller-hub/settings — shop controls the seller actually owns.
 *
 * Holiday mode follows the mobile PrivacySettings grammar: a labelled
 * switch, an optional return date (future-dated), an optional away
 * message, and the honest "what buyers see" line. Live mode reads/writes
 * the real /users/me/preferences contract; fixture mode persists the same
 * state on this device and projects it onto the fixture closet so demo
 * buy buttons genuinely pause — the flag is never a dead toggle.
 *
 * Seller standards render the real program metrics in live mode; demo
 * mode shows only what the fixture queue can truthfully compute
 * (ship time, shipped count) and marks the rest as not measured.
 */

import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useFulfilmentCounts,
  useSellerStandards,
  useShopAway,
} from '@/lib/hooks/seller-queries';
import { SellerSettingsSkeleton } from '@/components/seller/settings/SellerSettingsSkeleton';
import { HolidayModeSection } from '@/components/seller/settings/HolidayModeSection';
import { LiveStandardsSection } from '@/components/seller/settings/LiveStandardsSection';
import { DemoStandardsSection } from '@/components/seller/settings/DemoStandardsSection';

export default function SellerSettingsPage() {
  const counts = useFulfilmentCounts();
  const away = useShopAway();
  const standards = useSellerStandards();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <h1 className="text-screen-title text-text-primary">Shop settings</h1>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {away.isLoading ? (
        <SellerSettingsSkeleton />
      ) : away.isError ? (
        <div className="mt-8">
          <EmptyState
            icon="alert"
            title="Couldn't load shop settings"
            subtitle="We couldn't reach your preferences. Try again in a moment."
            actionLabel="Retry"
            onAction={() => void away.refetch()}
          />
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-16">
          {/* Holiday mode */}
          <HolidayModeSection />

          {/* Seller standards */}
          <section aria-label="Seller standards" className="mt-10 lg:mt-8">
            <h2 className="text-section-title font-semibold text-text-primary">Seller standards</h2>
            {standards.isLoading ? (
              <div className="mt-3 space-y-2" aria-busy aria-label="Loading seller standards">
                <div className="h-11 w-full animate-pulse rounded bg-surface-alt" />
                <div className="h-11 w-full animate-pulse rounded bg-surface-alt" />
              </div>
            ) : standards.isError ? (
              <p className="mt-3 text-body text-text-muted">
                Standards couldn&apos;t be loaded —{' '}
                <button
                  type="button"
                  onClick={() => void standards.refetch()}
                  className="pressable font-medium text-text-primary underline-offset-4 hover:underline"
                >
                  try again
                </button>
                .
              </p>
            ) : standards.data?.kind === 'live' ? (
              <LiveStandardsSection standards={standards.data.standards} />
            ) : standards.data?.kind === 'demo' ? (
              <DemoStandardsSection standards={standards.data.standards} />
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
