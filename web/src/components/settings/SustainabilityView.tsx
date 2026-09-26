'use client';

/**
 * SustainabilityView — the /settings/sustainability surface.
 *
 * Web port of the mobile SustainabilityPreferencesScreen: carbon-saving
 * target, secondhand ratio goal, packaging preference, badges, impact
 * tracking and local-first ordering — persisted via settingsPrefs.
 *
 * Honest impact treatment: mobile reads a verified impact ledger from the
 * backend. The web fixture layer has no such ledger, so the hero reports
 * the one figure that is real here — delivered orders involving the
 * member — and says plainly that verified CO₂e isn't connected. Per EU
 * Directive 2024/825 no carbon-neutral shipping claim is offered.
 */

import { useMemo, useState } from 'react';
import { SettingsSection } from './SettingsSection';
import { Switch } from './Switch';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs, type SustainabilityPrefs } from '@/lib/store/settingsPrefs';
import { ORDERS } from '@/lib/data/fixtures';

const CARBON_TARGETS: (number | null)[] = [null, 10, 25, 50, 100, 250];
const RATIO_TARGETS: (number | null)[] = [null, 25, 50, 75, 100];

const METHODOLOGY_TEXT =
  'ThryftVerse calculates net avoided emissions using verified emissions factors (DEFRA 2024, Higg MSI v3.7). We subtract resale shipping and packaging emissions from the avoided production and end-of-life emissions, applying a displacement rate and rebound effect based on WRAP/Vestiaire methodology.';

type ToggleKey = 'plasticFreePackaging' | 'showBadges' | 'trackImpact' | 'localFirst';

interface ToggleRow {
  key: ToggleKey;
  label: string;
  sub: string;
  icon: 'leaf' | 'star' | 'analytics' | 'location';
}

const TOGGLE_GROUPS: { section: string; rows: ToggleRow[] }[] = [
  {
    section: 'Shipping & packaging',
    rows: [
      {
        key: 'plasticFreePackaging',
        label: 'Plastic-free packaging',
        sub: 'Prefer sellers using plastic-free packaging',
        icon: 'leaf',
      },
    ],
  },
  {
    section: 'Display & tracking',
    rows: [
      {
        key: 'showBadges',
        label: 'Sustainability badges',
        sub: 'Show sustainability grades on listings',
        icon: 'star',
      },
      {
        key: 'trackImpact',
        label: 'Impact tracking',
        sub: 'Track your personal sustainability impact',
        icon: 'analytics',
      },
      {
        key: 'localFirst',
        label: 'Local first',
        sub: 'Prioritise local listings in search and feed',
        icon: 'location',
      },
    ],
  },
];

function GoalChips<T extends number | null>({
  options,
  value,
  onChange,
  format,
  groupLabel,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
  groupLabel: string;
}) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2" role="radiogroup" aria-label={groupLabel}>
      {options.map((option) => {
        const label = format(option);
        const selected = value === option;
        return (
          <Chip
            key={label}
            selected={selected}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
          >
            {label}
          </Chip>
        );
      })}
    </div>
  );
}

export function SustainabilityView() {
  const hydrated = useHydrated();
  const sustainability = useSettingsPrefs((s) => s.sustainability);
  const setSustainability = useSettingsPrefs((s) => s.setSustainability);
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  // Real figure available in fixture mode: completed resales involving the
  // member — buying and selling both keep an item in circulation.
  const keptInCirculation = useMemo(
    () =>
      ORDERS.filter(
        (o) => (o.buyerId === 'me' || o.sellerId === 'me') && o.status === 'delivered',
      ).length,
    [],
  );

  const set = (patch: Partial<SustainabilityPrefs>) => setSustainability(patch);

  return (
    <>
      {/* Impact summary — the one dominant panel. Real count; CO₂e honestly
          disclosed as not connected rather than estimated. */}
      <div className="px-4 pb-4 pt-1 sm:px-5">
        <h2 className="text-body-emphasis font-semibold text-text-primary">Your impact</h2>
        <div className="mt-2.5 flex items-start gap-2.5 rounded-lg bg-surface-alt px-4 py-4">
          <Icon name="leaf" size={20} className="mt-0.5 shrink-0 text-success-text" />
          <div className="min-w-0 flex-1">
            {keptInCirculation > 0 ? (
              <p className="text-body-large font-semibold text-text-primary">
                <span className="tnum">{keptInCirculation}</span>{' '}
                {keptInCirculation === 1 ? 'item' : 'items'} kept in circulation
              </p>
            ) : (
              <p className="text-body text-text-secondary">
                No completed purchases yet — your impact appears here once you
                buy your first pre-owned item.
              </p>
            )}
            <p className="mt-1 text-caption text-text-muted">
              Verified CO₂e savings are calculated by the platform impact
              ledger, which isn’t connected in this preview.
            </p>
          </div>
        </div>
      </div>

      {/* Goals — chip pickers matching mobile's target options. */}
      <SettingsSection title="Sustainability goals">
        {hydrated ? (
          <>
            <div className="px-4 py-3.5 sm:px-5">
              <p className="text-body-emphasis text-text-primary">Carbon saving target</p>
              <p className="mt-0.5 text-caption text-text-muted">kg CO₂ per year</p>
              <GoalChips
                options={CARBON_TARGETS}
                value={sustainability.carbonTargetKg}
                onChange={(v) => set({ carbonTargetKg: v })}
                format={(v) => (v === null ? 'None' : String(v))}
                groupLabel="Carbon saving target, kilograms of CO₂ per year"
              />
            </div>
            <div className="px-4 py-3.5 sm:px-5">
              <p className="text-body-emphasis text-text-primary">Secondhand ratio goal</p>
              <p className="mt-0.5 text-caption text-text-muted">
                Share of purchases that are secondhand
              </p>
              <GoalChips
                options={RATIO_TARGETS}
                value={sustainability.ratioTargetPct}
                onChange={(v) => set({ ratioTargetPct: v })}
                format={(v) => (v === null ? 'None' : `${v}%`)}
                groupLabel="Secondhand ratio goal, percent of purchases"
              />
            </div>
          </>
        ) : (
          <div aria-busy aria-label="Loading sustainability goals">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-none" />
            ))}
          </div>
        )}
      </SettingsSection>

      {TOGGLE_GROUPS.map((group) => (
        <SettingsSection key={group.section} title={group.section}>
          {hydrated ? (
            group.rows.map((row) => (
              <div
                key={row.key}
                className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5"
              >
                <Icon name={row.icon} size={18} className="shrink-0 text-text-secondary" />
                <div className="min-w-0 flex-1">
                  <p className="text-body-emphasis text-text-primary">{row.label}</p>
                  <p className="clamp-1 text-caption text-text-muted">{row.sub}</p>
                </div>
                <Switch
                  checked={sustainability[row.key]}
                  onChange={(v) => set({ [row.key]: v })}
                  aria-label={row.label}
                />
              </div>
            ))
          ) : (
            <div aria-busy aria-label={`Loading ${group.section.toLowerCase()}`}>
              {group.rows.map((row) => (
                <Skeleton key={row.key} className="h-[52px] w-full rounded-none" />
              ))}
            </div>
          )}
        </SettingsSection>
      ))}

      {/* Methodology disclosure — same expanded copy as mobile. */}
      <div className="px-4 pb-2 pt-4 sm:px-5">
        <button
          type="button"
          onClick={() => setMethodologyOpen((v) => !v)}
          aria-expanded={methodologyOpen}
          className="pressable flex w-full items-center justify-between py-2 text-left"
        >
          <span className="text-meta text-text-secondary">How we calculate impact</span>
          <Icon
            name={methodologyOpen ? 'chevronUp' : 'chevronDown'}
            size={16}
            className="text-text-secondary"
          />
        </button>
        {methodologyOpen ? (
          <p className="mt-1 text-meta leading-relaxed text-text-muted">{METHODOLOGY_TEXT}</p>
        ) : null}
      </div>

      <p className="px-4 pt-4 text-caption text-text-muted sm:px-5">
        Preferences are stored on this device in this preview. In the app they
        sync to your account and shape feeds, badges and packaging requests.
      </p>
    </>
  );
}
