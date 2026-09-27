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
 */

import { useState } from 'react';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { PickerSheet } from './PickerSheet';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmSheet } from '@/components/orders/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import {
  AUDIENCE_OPTIONS,
  BRAND_OPTIONS,
  CATEGORY_SIZE_OPTIONS,
  MEMBER_OPTIONS,
} from '@/lib/contracts/settings';

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
  const prefs = useSettingsPrefs((s) => s.personalisation);
  const setPersonalisation = useSettingsPrefs((s) => s.setPersonalisation);
  const resetPersonalisation = useSettingsPrefs((s) => s.resetPersonalisation);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const genderFilter = hydrated ? prefs.genderFilter : [];

  // Mirror of mobile handleSelectGender: 'All' is exclusive; removing the
  // last specific selection collapses back to 'All'.
  const selectAudience = (gender: string) => {
    if (gender === 'All') {
      setPersonalisation({ genderFilter: ['All'] });
      return;
    }
    const withoutAll = genderFilter.filter((g) => g !== 'All');
    const next = withoutAll.includes(gender)
      ? withoutAll.filter((g) => g !== gender)
      : [...withoutAll, gender];
    setPersonalisation({ genderFilter: next.length === 0 ? ['All'] : next });
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
      setPersonalisation({ categoriesAndSizesPref: value });
      show('Size preference updated', 'success');
    } else if (pickerMode === 'brands') {
      setPersonalisation({ brandsPref: value });
      show('Brand preference updated', 'success');
    } else if (pickerMode === 'members') {
      setPersonalisation({ membersPref: value });
      show('Member preference updated', 'success');
    }
  };

  return (
    <>
      {/* Shop for — visual multi-select, mirrors AudiencePreferenceGrid. */}
      <SettingsSection title="Shop for">
        <div className="px-4 py-4 sm:px-5">
          {hydrated ? (
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
        {hydrated ? (
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

      {hydrated ? (
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
        Saved on this device and applied to how your feed is ordered. In a
        signed-in production build the same choices sync to your account.
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
                  resetPersonalisation();
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
