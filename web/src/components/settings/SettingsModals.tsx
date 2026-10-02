'use client';

import { ConfirmSheet } from '@/components/orders/ConfirmSheet';
import {
  LanguageSheet,
  VerificationSheet,
  ReportSheet,
} from './SettingsSheets';
import { AgeConfirmationSheet } from './AgeConfirmationSheet';
import { PickerSheet } from './PickerSheet';
import type { SettingsSheetId } from './settingsDestinations';
import { ACCENT_PRESETS } from '@/lib/accent';
import type { Density } from '@/lib/density';

const DENSITY_OPTIONS: { value: Density; label: string; subtitle: string }[] = [
  { value: 'compact', label: 'Compact', subtitle: 'Tighter spacing — more on screen' },
  { value: 'regular', label: 'Regular', subtitle: 'The default ThryftVerse layout' },
  { value: 'editorial', label: 'Editorial', subtitle: 'Roomier, media-led spacing' },
];

interface SettingsModalsProps {
  sheet: SettingsSheetId | null;
  onCloseSheet: () => void;
  signOutConfirm: boolean;
  onDismissSignOut: () => void;
  onConfirmSignOut: () => void;
  theme: 'dark' | 'light';
  accent: string;
  onSelectAccent: (accentId: (typeof ACCENT_PRESETS)[number]['id']) => void;
  density: Density;
  onSelectDensity: (density: Density) => void;
}

/**
 * Settings sheets & dialog manager:
 * Language, verification, issue report, age confirmation,
 * accent colour swatch picker, layout density picker, and sign-out confirmation.
 */
export function SettingsModals({
  sheet,
  onCloseSheet,
  signOutConfirm,
  onDismissSignOut,
  onConfirmSignOut,
  theme,
  accent,
  onSelectAccent,
  density,
  onSelectDensity,
}: SettingsModalsProps) {
  return (
    <>
      <ConfirmSheet
        sheet={
          signOutConfirm
            ? {
                title: 'Sign out of ThryftVerse?',
                message:
                  'Your bag, closet and messages stay on your account — you\u2019ll need your email and password to sign back in.',
                confirmLabel: 'Sign out',
                variant: 'destructive',
                onConfirm: onConfirmSignOut,
              }
            : null
        }
        onDismiss={onDismissSignOut}
      />

      <LanguageSheet open={sheet === 'language'} onClose={onCloseSheet} />
      <VerificationSheet open={sheet === 'verification'} onClose={onCloseSheet} />
      <ReportSheet open={sheet === 'report'} onClose={onCloseSheet} />
      <AgeConfirmationSheet open={sheet === 'age'} onClose={onCloseSheet} />
      <PickerSheet
        open={sheet === 'accent'}
        onClose={onCloseSheet}
        title="Accent colour"
        options={ACCENT_PRESETS.map((p) => ({
          value: p.id,
          label: p.label,
          swatch: (theme === 'light' ? p.light : p.dark).brand,
        }))}
        selectedValue={accent}
        onSelect={(v) =>
          onSelectAccent(v as (typeof ACCENT_PRESETS)[number]['id'])
        }
        note="Applies across this device — buttons, links and highlights take the tone."
      />
      <PickerSheet
        open={sheet === 'density'}
        onClose={onCloseSheet}
        title="Density"
        options={DENSITY_OPTIONS.map((d) => ({
          value: d.value,
          label: d.label,
          subtitle: d.subtitle,
        }))}
        selectedValue={density}
        onSelect={(v) => onSelectDensity(v as Density)}
        note="Stored on this device and applied wherever layouts support density switching."
      />
    </>
  );
}
