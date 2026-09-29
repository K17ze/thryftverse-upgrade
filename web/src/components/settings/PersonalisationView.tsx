'use client';

/**
 * PersonalisationView — /settings/personalisation.
 *
 * 1:1 with mobile PersonalisationScreen: the "Shop for" audience grid
 * (Women / Men / Kids / All — 'All' is exclusive, emptying the selection
 * falls back to 'All'), then the three discovery pickers (categories &
 * sizes, brands, members) as sheet radios, and a quiet reset. Everything
 * persists through settingsPrefs; the audience selection also feeds the
 * local feed ranking via personalisationRankingSignals.
 *
 * Live + signed-in sessions sync through GET/PATCH /users/me/personalisation:
 * the store is the optimistic mirror hydrated from server truth and a
 * failed write restores the pre-write posture. Guest and fixture sessions
 * keep the device-local path and the copy says so.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { PickerSheet } from './PickerSheet';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmSheet } from '@/components/orders/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as usersService from '@/lib/api/services/users';
import {
  AUDIENCE_OPTIONS,
  BRAND_OPTIONS,
  CATEGORY_SIZE_OPTIONS,
  DEFAULT_PERSONALISATION,
  MEMBER_OPTIONS,
  type PersonalisationPreferences,
} from '@/lib/contracts/settings';

const isLive = DATA_MODE === 'live';

const AUDIENCE_META: Record<(typeof AUDIENCE_OPTIONS)[number], { subtitle: string }> = {
  Women: { subtitle: 'Womenswear and accessories' },
  Men: { subtitle: 'Menswear and accessories' },
  Kids: { subtitle: "Children's clothing" },
  All: { subtitle: 'Show every department' },
};

type PickerMode = 'categories' | 'brands' | 'members' | null;

const PICKER_CONFIG: Record<
  Exclude<PickerMode, null>,
  { title: string; options: readonly string[] }
> = {
  categories: { title: 'Categories and sizes', options: CATEGORY_SIZE_OPTIONS },
  brands: { title: 'Brands', options: BRAND_OPTIONS },
  members: { title: 'Members', options: MEMBER_OPTIONS },
};

export function PersonalisationView() {
  const { show } = useToast();
  const hydrated = useHydrated();
  const { isGuest, sessionLoading } = useSession();
  const prefs = useSettingsPrefs((s) => s.personalisation);
  const setPersonalisation = useSettingsPrefs((s) => s.setPersonalisation);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [resetOpen, setResetOpen] = useState(false);

  // The account wire only exists for an authed live session — guests and
  // fixture mode keep the device-local mirror.
  const syncs = isLive && !isGuest;
  const livePrefs = useQuery({
    queryKey: ['users', 'me', 'personalisation'],
    queryFn: ({ signal }) => usersService.fetchMyPersonalisation(signal),
    enabled: syncs,
    staleTime: 30_000,
  });

  // Reconcile server truth into the mirror whenever the read lands — the
  // service emits only well-typed fields, so a merge lands them verbatim.
  useEffect(() => {
    if (livePrefs.data) setPersonalisation(livePrefs.data);
  }, [livePrefs.data, setPersonalisation]);

  // Network/server failures carry no user-facing detail beyond "it didn't
  // save" — the offline classifier is the only message worth surfacing.
  const syncError = (error: unknown, fallback: string) => {
    const parsed = parseApiError(error);
    show(parsed.isNetworkError ? parsed.message : fallback, 'error');
  };

  /** Optimistic patch → PATCH the touched fields; a failed write restores
   *  the exact pre-write object (a full restore — merge semantics make it
   *  atomic for the keys it touched). */
  const syncPatch = (patch: Partial<PersonalisationPreferences>) => {
    const before = useSettingsPrefs.getState().personalisation;
    setPersonalisation(patch);
    if (!syncs) return;
    void usersService.updateMyPersonalisation(patch).catch((error) => {
      setPersonalisation(before);
      syncError(error, 'Couldn’t save — the preference was restored');
    });
  };

  // The mirror is the optimistic layer — show it only once persisted
  // state, the session, and the account read have all resolved.
  const ready = hydrated && !(isLive && sessionLoading) && !(syncs && livePrefs.isLoading);

  const genderFilter = ready ? prefs.genderFilter : [];

  // Mirror of mobile handleSelectGender: 'All' is exclusive; removing the
  // last specific selection collapses back to 'All'.
  const selectAudience = (gender: string) => {
    if (gender === 'All') {
      syncPatch({ genderFilter: ['All'] });
      return;
    }
    const withoutAll = genderFilter.filter((g) => g !== 'All');
    const next = withoutAll.includes(gender)
      ? withoutAll.filter((g) => g !== gender)
      : [...withoutAll, gender];
    syncPatch({ genderFilter: next.length === 0 ? ['All'] : next });
  };

  const pickerValue =
    pickerMode === 'categories'
      ? prefs.categoriesAndSizesPref
      : pickerMode === 'brands'
        ? prefs.brandsPref
        : pickerMode === 'members'
          ? prefs.membersPref
          : undefined;

  const selectPreference = (value: string) => {
    if (pickerMode === 'categories') {
      syncPatch({ categoriesAndSizesPref: value });
      show('Size preference updated', 'success');
    } else if (pickerMode === 'brands') {
      syncPatch({ brandsPref: value });
      show('Brand preference updated', 'success');
    } else if (pickerMode === 'members') {
      syncPatch({ membersPref: value });
      show('Member preference updated', 'success');
    }
  };

  return (
    <>
      {/* Shop for — visual multi-select, mirrors AudiencePreferenceGrid. */}
      <SettingsSection title="Shop for">
        <div className="px-4 py-4 sm:px-5">
          {ready ? (
            <div className="grid grid-cols-2 gap-2">
              {AUDIENCE_OPTIONS.map((key) => {
                const selected = genderFilter.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectAudience(key)}
                    className={`pressable rounded-lg border p-3.5 text-left ${
                      selected
                        ? 'border-text-primary bg-surface-alt'
                        : 'border-border bg-surface'
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span
                        className={`text-body-emphasis ${
                          selected ? 'font-medium text-text-primary' : 'text-text-secondary'
                        }`}
                      >
                        {key}
                      </span>
                      {selected ? (
                        <Icon name="check" size={16} className="text-text-primary" />
                      ) : null}
                    </span>
                    <span className="mt-1 block text-caption text-text-muted">
                      {AUDIENCE_META[key].subtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2" aria-busy aria-label="Loading audience preferences">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[76px] w-full rounded-lg" />
              ))}
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Discovery preferences">
        {ready ? (
          <>
            <SettingsRow
              icon="options"
              label="Categories and sizes"
              subtitle="Keep a preferred size mix"
              value={prefs.categoriesAndSizesPref}
              onClick={() => setPickerMode('categories')}
            />
            <SettingsRow
              icon="bag"
              label="Brands"
              subtitle="Choose a general brand direction"
              value={prefs.brandsPref}
              onClick={() => setPickerMode('brands')}
            />
            <SettingsRow
              icon="people"
              label="Members"
              subtitle="Choose whose listings you prefer to browse"
              value={prefs.membersPref}
              onClick={() => setPickerMode('members')}
            />
          </>
        ) : (
          <div aria-busy aria-label="Loading discovery preferences">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[52px] w-full rounded-none" />
            ))}
          </div>
        )}
      </SettingsSection>

      {ready ? (
        <div className="px-4 pt-2 sm:px-5">
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className="pressable inline-flex min-h-11 items-center gap-2 text-body text-text-muted hover:text-text-secondary"
          >
            <Icon name="refresh" size={16} />
            Reset preferences
          </button>
        </div>
      ) : null}

      <p className="px-4 pt-4 text-caption text-text-muted sm:px-5">
        {syncs
          ? 'Synced to your account and applied to how your feed is ordered.'
          : isLive
            ? 'Stored on this device and applied to how your feed is ordered — sign in to sync these choices to your account.'
            : 'In this preview, choices are stored on this device and applied to how the demo feed is ordered.'}
      </p>

      <PickerSheet
        open={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={pickerMode ? PICKER_CONFIG[pickerMode].title : 'Preference'}
        options={(pickerMode ? PICKER_CONFIG[pickerMode].options : []).map((o) => ({
          value: o,
          label: o,
        }))}
        selectedValue={pickerValue}
        onSelect={selectPreference}
      />

      <ConfirmSheet
        sheet={
          resetOpen
            ? {
                title: 'Reset preferences?',
                message: 'Your audience and discovery choices return to their defaults.',
                confirmLabel: 'Reset',
                onConfirm: () => {
                  setResetOpen(false);
                  // Defaults cover every field, so the same syncPatch path
                  // writes the reset through to the account.
                  syncPatch({ ...DEFAULT_PERSONALISATION });
                  show('Preferences reset to defaults', 'success');
                },
              }
            : null
        }
        onDismiss={() => setResetOpen(false)}
      />
    </>
  );
}
