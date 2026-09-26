'use client';

/**
 * PostageView — the /settings/postage surface. Web port of the mobile
 * PostageScreen: a flat summary of the selected carrier, a radio list of
 * UK postage options (label, from-price, ETA, tracking), the free-shipping
 * and bundle-discount switches, and a link to saved addresses.
 *
 * On mobile carriers resolve from the country-capabilities API; on web the
 * same UK option set is fixture data — "from" prices only, since actual
 * costs are calculated at checkout. Preferences persist on-device via
 * usePostagePrefs.
 */

import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from './Switch';
import { usePostagePrefs } from './usePostagePrefs';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useSavedAddresses } from '@/lib/store/userPaymentData';
import { useHydrated } from '@/lib/store/useStore';
import { formatPrice } from '@/lib/utils/format';

interface CarrierOption {
  key: string;
  label: string;
  priceFrom: number;
  etaMinDays: number;
  etaMaxDays: number;
  tracking: boolean;
}

/** UK carrier menu — the same set the capabilities API returns for GB. */
const CARRIERS: CarrierOption[] = [
  { key: 'evri-standard', label: 'Evri Standard', priceFrom: 2.99, etaMinDays: 2, etaMaxDays: 4, tracking: true },
  { key: 'rm-2nd', label: 'Royal Mail 2nd Class', priceFrom: 3.49, etaMinDays: 2, etaMaxDays: 3, tracking: false },
  { key: 'rm-tracked-48', label: 'Royal Mail Tracked 48', priceFrom: 4.29, etaMinDays: 2, etaMaxDays: 2, tracking: true },
  { key: 'dpd-next', label: 'DPD Next Day', priceFrom: 5.99, etaMinDays: 1, etaMaxDays: 1, tracking: true },
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
  const { addresses } = useSavedAddresses();
  const { show } = useToast();

  if (!hydrated || !loaded) {
    return (
      <div aria-busy aria-label="Loading postage preferences" className="mt-2 space-y-px">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[56px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  const selected = CARRIERS.find((c) => c.key === prefs.carrierKey) ?? null;

  const selectCarrier = (c: CarrierOption) => {
    update({ carrierKey: c.key });
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
        <div role="radiogroup" aria-label="Default carrier" className="divide-y divide-border-subtle">
          {CARRIERS.map((c) => (
            <CarrierRow
              key={c.key}
              carrier={c}
              selected={c.key === prefs.carrierKey}
              onSelect={() => selectCarrier(c)}
            />
          ))}
        </div>
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
            update({ freeShipping: v });
            show(v ? 'Free shipping on' : 'Free shipping off', 'success');
          }}
        />
        <ToggleRow
          label="Bundle discount on postage"
          sub="Save on multi-item orders"
          checked={prefs.bundleDiscount}
          onChange={(v) => {
            update({ bundleDiscount: v });
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
        You can override these defaults for individual items when creating a listing.
      </p>
    </>
  );
}
