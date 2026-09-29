'use client';

/**
 * SustainabilityView — the /settings/sustainability surface.
 *
 * Web port of the mobile SustainabilityPreferencesScreen: carbon-saving
 * target, secondhand ratio goal, packaging preference, badges and impact
 * tracking — persisted via settingsPrefs. The mobile "local first"
 * ordering toggle is deliberately absent: it claims to reorder search
 * and feed results, which this surface has no honest way to honour.
 *
 * Honest impact treatment: mobile reads a verified impact ledger from the
 * backend. The web fixture layer has no such ledger, so the hero reports
 * the one figure that is real here — delivered orders involving the
 * member — and says plainly that verified CO₂e isn't connected. Per EU
 * Directive 2024/825 no carbon-neutral shipping claim is offered.
 *
 * Live + signed-in sessions sync the preference slice through
 * GET/PUT /users/me/sustainability-preferences: the store is the
 * optimistic mirror hydrated from server truth and a failed write
 * restores the pre-write posture. Guest and fixture sessions keep the
 * device-local path and the copy says so.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SettingsSection } from './SettingsSection';
import { Switch } from './Switch';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { useSettingsPrefs, type SustainabilityPrefs } from '@/lib/store/settingsPrefs';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as usersService from '@/lib/api/services/users';
import { useCommerceOrders } from '@/lib/hooks/queries';
import { ORDERS } from '@/lib/data/fixtures';

const LIVE = DATA_MODE === 'live';

const CARBON_TARGETS: (number | null)[] = [null, 10, 25, 50, 100, 250];
const RATIO_TARGETS: (number | null)[] = [null, 25, 50, 75, 100];

const METHODOLOGY_TEXT =
  'ThryftVerse calculates net avoided emissions using verified emissions factors (DEFRA 2024, Higg MSI v3.7). We subtract resale shipping and packaging emissions from the avoided production and end-of-life emissions, applying a displacement rate and rebound effect based on WRAP/Vestiaire methodology.';

// 'localFirst' stays in the store for the feed workstream — no honest
// surface here to consume it, so it is not a rendered toggle.
type ToggleKey = 'plasticFreePackaging' | 'showBadges' | 'trackImpact';

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
  const { user, isGuest, sessionLoading } = useSession();
  const { show } = useToast();
  const sustainability = useSettingsPrefs((s) => s.sustainability);
  const setSustainability = useSettingsPrefs((s) => s.setSustainability);
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  // The account wire only exists for an authed live session — guests and
  // fixture mode keep the device-local mirror.
  const syncs = LIVE && !isGuest;
  const livePrefs = useQuery({
    queryKey: ['users', 'me', 'sustainability-preferences'],
    queryFn: ({ signal }) => usersService.fetchSustainabilityPreferences(signal),
    enabled: syncs,
    staleTime: 30_000,
  });

  // Reconcile server truth into the mirror whenever the read lands — the
  // service emits the full shape, so a merge lands it verbatim.
  useEffect(() => {
    if (livePrefs.data) setSustainability(livePrefs.data);
  }, [livePrefs.data, setSustainability]);

  // Network/server failures carry no user-facing detail beyond "it didn't
  // save" — the offline classifier is the only message worth surfacing.
  const syncError = (error: unknown, fallback: string) => {
    const parsed = parseApiError(error);
    show(parsed.isNetworkError ? parsed.message : fallback, 'error');
  };

  /** Optimistic patch → PUT the touched fields; a failed write restores
   *  the exact pre-write object. Note: the server's COALESCE upsert
   *  treats a null goal as "keep existing", so clearing a target can't
   *  round-trip — same limitation as mobile. */
  const set = (patch: Partial<SustainabilityPrefs>) => {
    const before = useSettingsPrefs.getState().sustainability;
    setSustainability(patch);
    if (!syncs) return;
    void usersService.updateSustainabilityPreferences(patch).catch((error) => {
      setSustainability(before);
      syncError(error, 'Couldn’t save — the preferences were restored');
    });
  };

  // The mirror is the optimistic layer — show it only once persisted
  // state, the session, and the account read have all resolved.
  const ready = hydrated && !(LIVE && sessionLoading) && !(syncs && livePrefs.isLoading);

  // Real figure: completed resales involving the member — buying and
  // selling both keep an item in circulation. Live mode counts the
  // viewer's real delivered orders (the commerce list is already
  // viewer-scoped); fixture mode counts the demo account's records —
  // guests and other accounts get an honest zero, not a stranger's impact.
  const { data: orders } = useCommerceOrders();
  const keptInCirculation = useMemo(() => {
    if (LIVE) {
      return (orders ?? []).filter((o) => o.status === 'delivered').length;
    }
    return user?.id === 'me'
      ? ORDERS.filter(
          (o) => (o.buyerId === 'me' || o.sellerId === 'me') && o.status === 'delivered',
        ).length
      : 0;
  }, [orders, user?.id]);

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
        {ready ? (
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
          {ready ? (
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
        {syncs
          ? 'Preferences sync to your account and shape feeds, badges and packaging requests.'
          : LIVE
            ? 'Preferences are stored on this device — sign in to sync them to your account.'
            : 'In this preview, preferences are stored on this device; signed-in accounts sync them across devices and they shape feeds, badges and packaging requests.'}
      </p>
    </>
  );
}
