'use client';

import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from './Switch';
import { settingsSectionId } from './settingsDestinations';
import { getAccentPreset, type AccentPreset } from '@/lib/accent';
import type { Density } from '@/lib/density';

const DENSITY_LABELS: Record<Density, string> = {
  compact: 'Compact',
  regular: 'Regular',
  editorial: 'Editorial',
};

interface SettingsExperienceSectionProps {
  theme: 'dark' | 'light';
  setThemeMode: (dark: boolean) => void;
  hydrated: boolean;
  accent: AccentPreset;
  density: Density;
  language: string;
  onOpenSheet: (sheet: 'accent' | 'density' | 'language') => void;
}

/**
 * Visual & interaction experience preferences:
 * Theme mode switch, accent palette, layout density, i18n language, and algorithm curation.
 */
export function SettingsExperienceSection({
  theme,
  setThemeMode,
  hydrated,
  accent,
  density,
  language,
  onOpenSheet,
}: SettingsExperienceSectionProps) {
  return (
    <SettingsSection
      id={settingsSectionId('Experience')}
      title="Experience"
    >
      <SettingsRow
        icon="moon"
        label="Dark theme"
        trailing={
          <Switch
            checked={theme === 'dark'}
            onChange={setThemeMode}
            aria-label="Dark theme"
          />
        }
      />
      <SettingsRow
        icon="palette"
        label="Accent colour"
        value={hydrated ? getAccentPreset(accent)?.label : undefined}
        onClick={() => onOpenSheet('accent')}
      />
      <SettingsRow
        icon="layers"
        label="Density"
        subtitle="How roomy lists and feeds feel"
        value={hydrated ? DENSITY_LABELS[density] : undefined}
        onClick={() => onOpenSheet('density')}
      />
      <SettingsRow
        icon="language"
        label="Language"
        value={language}
        onClick={() => onOpenSheet('language')}
      />
      <SettingsRow
        icon="options"
        label="Personalisation"
        subtitle="Audience, sizes, brands and members"
        href="/settings/personalisation"
      />
      <SettingsRow
        icon="sparkles"
        label="Recommendations"
        subtitle="Photo enhancement, title and price suggestions"
        href="/settings/recommendations"
      />
      <SettingsRow
        icon="accessibility"
        label="Accessibility"
        subtitle="Text size, motion and contrast"
        href="/settings/accessibility"
      />
      <SettingsRow
        icon="feed"
        label="Your feed"
        subtitle="Tune what your feed favours"
        href="/agents/algorithm"
      />
      <SettingsRow
        icon="leaf"
        label="Sustainability"
        href="/settings/sustainability"
      />
    </SettingsSection>
  );
}
