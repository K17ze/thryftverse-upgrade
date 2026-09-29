'use client';

/**
 * PostageView — the /settings/postage surface. Web port of the mobile
 * PostageScreen: a flat summary of the selected carrier, a radio list of
 * postage options (label, from-price, ETA, tracking), the free-shipping
 * and bundle-discount switches, and a link to saved addresses.
 *
 * Live mode resolves the carrier menu from the country-capabilities API
 * (GET /users/:id/capabilities → capabilities.postage.carriers) and
 * syncs the defaults through GET/PATCH /users/me/postage — "from" prices
 * only, since actual costs are calculated at checkout. usePostagePrefs
 * is the optimistic mirror and the fixture-mode truth.
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from './Switch';
import { usePostagePrefs, type PostagePrefs } from './usePostagePrefs';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useManagedAddresses } from '@/lib/hooks/instrument-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import {
  fetchCountryCapabilities,
  fetchPostagePreferences,
  updatePostagePreferences,
} from '@/lib/api/services/users';
import { useHydrated } from '@/lib/store/useStore';
import { formatPrice } from '@/lib/utils/format';

const isLive = DATA_MODE === 'live';

interface CarrierOption {
  key: string;
  label: string;
  priceFrom: number;
  etaMinDays: number;
  etaMaxDays: number;
  tracking: boolean;
}

/** Fixture carrier menu — mirrors the GB carrier set the capabilities
 *  resolver emits (backend/lib/countryCapabilities.ts UK cluster), with
 *  matching ids so a fixture choice is the same key a live account
 *  would hold. Live mode replaces this with the real capability list. */
const CARRIERS: CarrierOption[] = [
  { key: 'evri', label: 'Evri', priceFrom: 2.89, etaMinDays: 2, etaMaxDays: 3, tracking: true },
  { key: 'royal_mail', label: 'Royal Mail', priceFrom: 3.35, etaMinDays: 1, etaMaxDays: 3, tracking: true },
  { key: 'dpd', label: 'DPD', priceFrom: 4.5, etaMinDays: 1, etaMaxDays: 2, tracking: true },
];

function formatEta(min: number, max: number): string {
  if (min === max) return `${min} day${min === 1 ? '' : 's'}`;
  return `${min}–${max} days`;
}

function carrierMeta(c: CarrierOption): string {
  return `from ${formatPrice(c.priceFrom)} · ${formatEta(c.etaMinDays, c.etaMaxDays)}${c.tracking ? ' · tracking' : ''}`;
}

function CarrierRow({
  carrier,
  selected,
  onSelect,
}: {
  carrier: CarrierOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${carrier.label}, ${carrierMeta(carrier)}`}
      onClick={onSelect}
      className="pressable flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block text-body ${selected ? 'font-semibold text-text-primary' : 'text-text-primary'}`}
        >
          {carrier.label}
        </span>
        <span className="mt-0.5 block text-caption text-text-muted">
          <span className="tnum">{carrierMeta(carrier)}</span>
        </span>
      </span>
      <span
        aria-hidden
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-brand bg-brand' : 'border-border'
        }`}
      >
        {selected ? <Icon name="check" size={12} className="text-text-inverse" /> : null}
      </span>
    </button>
  );
}

function ToggleRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-body-emphasis text-text-primary">{label}</p>
        <p className="text-caption text-text-muted">{sub}</p>
      </div>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </div>
  );
}

export function PostageView() {
  const hydrated = useHydrated();
  const { prefs, loaded, update } = usePostagePrefs();
  // The "Saved addresses" row shows the real count — live resolves the
  // server rail (useManagedAddresses), fixture the local overlay.
  const { addresses, isLoading: addressesLoading } = useManagedAddresses();
  const { show } = useToast();
  const qc = useQueryClient();
  const { user, isGuest, sessionLoading } = useSession();

  // The wire only exists for an authed live session — guests and fixture
  // mode keep the device-local mirror.
  const syncs = isLive && !isGuest && Boolean(user?.id);

  // Live: GET /users/me/postage hydrates the defaults; the carrier menu
  // resolves from the same country-capabilities payload mobile reads.
  const postageQuery = useQuery({
    queryKey: ['postage-preferences'],
    queryFn: ({ signal }) => fetchPostagePreferences(signal),
    enabled: syncs,
    staleTime: 30_000,
  });
  const capabilitiesQuery = useQuery({
    queryKey: ['country-capabilities', user?.id],
    queryFn: ({ signal }) => fetchCountryCapabilities(user!.id, signal),
    enabled: syncs,
    staleTime: 300_000,
  });

  // Reconcile server truth into the mirror whenever the read lands.
  useEffect(() => {
    const postage = postageQuery.data;
    if (postage) {
      update({
        carrierKey: postage.carrierKey || null,
        freeShipping: postage.freeShipping,
        bundleDiscount: postage.bundleDiscount,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postageQuery.data]);

  const carriers: CarrierOption[] = useMemo(() => {
    if (!syncs) return CARRIERS;
    return (capabilitiesQuery.data?.postage.carriers ?? []).map((c) => ({
      key: c.id,
      label: c.label,
      priceFrom: c.priceFromGbp,
      etaMinDays: c.etaMinDays,
      etaMaxDays: c.etaMaxDays,
      tracking: c.tracking,
    }));
  }, [syncs, capabilitiesQuery.data]);

  /** Optimistic write — the mirror applies instantly, the live PATCH
   *  carries just the touched field, and a failed write restores the
   *  exact pre-write defaults. Fixture mode writes the store. */
  const applyPostage = (patch: Partial<PostagePrefs>) => {
    const previous = { ...prefs };
    update(patch);
    if (!syncs) return;
    // The wire schema has no carrier-clear (carrierKey is min-1 when
    // present) — a null mirror value is simply not sent.
    void updatePostagePreferences({
      ...(patch.carrierKey != null ? { carrierKey: patch.carrierKey } : {}),
      ...(patch.freeShipping !== undefined ? { freeShipping: patch.freeShipping } : {}),
      ...(patch.bundleDiscount !== undefined
        ? { bundleDiscount: patch.bundleDiscount }
        : {}),
    })
      .then(() => void qc.invalidateQueries({ queryKey: ['postage-preferences'] }))
      .catch((error) => {
        update(previous);
        const parsed = parseApiError(error);
        show(
          parsed.isNetworkError
            ? parsed.message
            : 'Couldn’t save postage defaults — restored',
          'error',
        );
      });
  };

  if (
    !hydrated ||
    !loaded ||
    addressesLoading ||
    (isLive && sessionLoading) ||
    (syncs && (postageQuery.isLoading || capabilitiesQuery.isLoading))
  ) {
    return (
      <div aria-busy aria-label="Loading postage preferences" className="mt-2 space-y-px">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[56px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  const selected = carriers.find((c) => c.key === prefs.carrierKey) ?? null;

  const selectCarrier = (c: CarrierOption) => {
    applyPostage({ carrierKey: c.key });
    show(`${c.label} set as default carrier`, 'success');
  };

  return (
    <>
      {/* Flat summary — the dominant object is the chosen carrier. */}
      <div className="px-4 pb-5 sm:px-5">
        <p className="text-body-emphasis font-semibold text-text-primary">
          {selected ? selected.label : 'Choose a default carrier'}
        </p>
        <p className="mt-0.5 text-caption text-text-secondary">
          {selected ? carrierMeta(selected) : 'Applied to new listings unless you override them.'}
        </p>
      </div>

      <SettingsSection title="Default carrier">
        {syncs && capabilitiesQuery.isError ? (
          <div className="px-4 py-3.5 sm:px-5">
            <p className="text-caption text-text-muted">
              Couldn’t load the carriers for your region.
            </p>
            <button
              type="button"
              onClick={() => void capabilitiesQuery.refetch()}
              className="pressable mt-1 inline-flex min-h-11 items-center text-caption font-semibold text-text-primary"
            >
              Try again
            </button>
          </div>
        ) : carriers.length === 0 ? (
          <p className="px-4 py-3.5 text-caption text-text-muted sm:px-5">
            No postage carriers are available for your region yet.
          </p>
        ) : (
          <div role="radiogroup" aria-label="Default carrier" className="divide-y divide-border-subtle">
            {carriers.map((c) => (
              <CarrierRow
                key={c.key}
                carrier={c}
                selected={c.key === prefs.carrierKey}
                onSelect={() => selectCarrier(c)}
              />
            ))}
          </div>
        )}
        <p className="px-4 pb-3 pt-2 text-caption text-text-muted sm:px-5">
          Actual shipping costs are calculated at checkout based on item size, weight and
          destination.
        </p>
      </SettingsSection>

      <SettingsSection title="Shipping options">
        <ToggleRow
          label="Offer free shipping"
          sub="You cover postage"
          checked={prefs.freeShipping}
          onChange={(v) => {
            applyPostage({ freeShipping: v });
            show(v ? 'Free shipping on' : 'Free shipping off', 'success');
          }}
        />
        <ToggleRow
          label="Bundle discount on postage"
          sub="Save on multi-item orders"
          checked={prefs.bundleDiscount}
          onChange={(v) => {
            applyPostage({ bundleDiscount: v });
            show(v ? 'Bundle postage discount on' : 'Bundle postage discount off', 'success');
          }}
        />
      </SettingsSection>

      <SettingsSection title="Delivery">
        <SettingsRow
          icon="location"
          label="Saved addresses"
          value={`${addresses.length} saved`}
          href="/settings/addresses"
        />
      </SettingsSection>

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        {syncs
          ? 'Defaults sync to your account and apply to new listings — you can still override them per item.'
          : isLive
            ? 'Postage defaults are stored on this device — sign in to sync them to your account.'
            : 'In this preview, postage defaults are stored on this device. On an account, they apply to new listings.'}
      </p>
    </>
  );
}
