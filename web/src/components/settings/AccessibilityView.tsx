'use client';

/**
 * AccessibilityView — the /settings/accessibility surface.
 *
 * Web port of the mobile AccessibilitySettingsScreen: text size, reduce
 * motion, high contrast. Each preference has a real effect on this device:
 *
 * - Text size applies a root `zoom` factor (px-based type scale means a
 *   font-size override alone would do nothing — zoom is the honest
 *   equivalent and scales the whole interface like mobile's text size).
 * - Reduce motion / high contrast toggle classes on documentElement; the
 *   companion rules are injected by the <style> element below so
 *   globals.css stays untouched. The reduce-motion squash mirrors the
 *   prefers-reduced-motion block already in globals.css.
 *
 * The OS-level settings (prefers-reduced-motion, forced colours, browser
 * zoom) keep working underneath — these add app-level control on top.
 */

import { useEffect } from 'react';
import { SettingsSection } from './SettingsSection';
import { Switch } from './Switch';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useHydrated } from '@/lib/store/useStore';
import {
  useSettingsPrefs,
  type AccessibilityFlag,
  type TextSize,
} from '@/lib/store/settingsPrefs';

const TEXT_SIZES: { value: TextSize; label: string; zoom: number; sample: number }[] = [
  { value: 'small', label: 'Small', zoom: 0.9, sample: 13 },
  { value: 'medium', label: 'Medium', zoom: 1, sample: 15 },
  { value: 'large', label: 'Large', zoom: 1.125, sample: 17 },
  { value: 'xlarge', label: 'XL', zoom: 1.25, sample: 19 },
];

/**
 * Companion rules for the document classes this view toggles. Kept in the
 * component (not globals.css) so the effect is owned by the surface that
 * surfaces the toggle — the motion block mirrors the media-query squash
 * globals.css already applies under prefers-reduced-motion.
 */
const ACCESSIBILITY_CSS = `
html.reduce-motion .skeleton,
html.reduce-motion .fade-up,
html.reduce-motion .fade-in,
html.reduce-motion .sheet-enter,
html.reduce-motion .toast-enter,
html.reduce-motion .toast-exit {
  animation: none;
}
html.reduce-motion .media-zoom {
  transition: none;
}
html.reduce-motion .group:hover .media-zoom,
html.reduce-motion .pressable:active {
  transform: none;
}
html.reduce-motion *,
html.reduce-motion *::before,
html.reduce-motion *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}
html.high-contrast {
  --text-muted: #adadad;
  --text-secondary: #d4d4d4;
  --border: #383838;
  --border-subtle: #2c2c2c;
}
html.high-contrast[data-theme='light'] {
  --text-muted: #545454;
  --text-secondary: #404040;
  --border: #c6c6c6;
  --border-subtle: #dadada;
}
`;

interface ToggleRow {
  key: AccessibilityFlag;
  label: string;
  sub: string;
  icon: 'pause' | 'eye';
}

const TOGGLES: { section: string; rows: ToggleRow[] }[] = [
  {
    section: 'Motion',
    rows: [
      {
        key: 'reduceMotion',
        label: 'Reduce motion',
        sub: 'Minimise animations and transitions in ThryftVerse',
        icon: 'pause',
      },
    ],
  },
  {
    section: 'Display',
    rows: [
      {
        key: 'highContrast',
        label: 'High contrast',
        sub: 'Increase contrast between text, borders and backgrounds',
        icon: 'eye',
      },
    ],
  },
];

export function AccessibilityView() {
  const hydrated = useHydrated();
  const textSize = useSettingsPrefs((s) => s.textSize);
  const reduceMotion = useSettingsPrefs((s) => s.reduceMotion);
  const highContrast = useSettingsPrefs((s) => s.highContrast);
  const setTextSize = useSettingsPrefs((s) => s.setTextSize);
  const setAccessibilityFlag = useSettingsPrefs((s) => s.setAccessibilityFlag);

  // Apply prefs only after hydration — persisted values differ from the
  // SSR defaults, and the effect must not fight the stored choice.
  useEffect(() => {
    if (!hydrated) return;
    const zoom = TEXT_SIZES.find((t) => t.value === textSize)?.zoom ?? 1;
    if (zoom === 1) document.documentElement.style.removeProperty('zoom');
    else document.documentElement.style.setProperty('zoom', String(zoom));
  }, [hydrated, textSize]);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
    document.documentElement.classList.toggle('high-contrast', highContrast);
  }, [hydrated, reduceMotion, highContrast]);

  const flagValues: Record<AccessibilityFlag, boolean> = { reduceMotion, highContrast };

  return (
    <>
      {/* Companion rules for the toggled classes — see header note. */}
      <style>{ACCESSIBILITY_CSS}</style>

      {/* Text size — segmented selector, mirrors mobile's Aa options. */}
      <SettingsSection title="Text size">
        {hydrated ? (
          <div className="px-4 py-4 sm:px-5">
            <div
              className="grid grid-cols-4 overflow-hidden rounded-lg border border-border"
              role="radiogroup"
              aria-label="Text size"
            >
              {TEXT_SIZES.map((option, i) => {
                const selected = textSize === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTextSize(option.value)}
                    className={`pressable flex flex-col items-center justify-center gap-1 py-3 ${
                      i > 0 ? 'border-l border-border' : ''
                    } ${selected ? 'bg-brand' : 'hover:bg-surface-alt'}`}
                  >
                    <span
                      className={`font-semibold leading-none ${
                        selected ? 'text-text-inverse' : 'text-text-primary'
                      }`}
                      style={{ fontSize: option.sample }}
                    >
                      Aa
                    </span>
                    <span
                      className={`text-meta ${
                        selected ? 'text-text-inverse' : 'text-text-muted'
                      }`}
                    >
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-caption text-text-muted">
              Scales text and interface elements in this browser — your browser
              zoom and device text settings apply on top.
            </p>
          </div>
        ) : (
          <div aria-busy aria-label="Loading text size">
            <Skeleton className="m-4 h-[72px] rounded-lg sm:m-5" />
          </div>
        )}
      </SettingsSection>

      {TOGGLES.map((group) => (
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
                  checked={flagValues[row.key]}
                  onChange={(v) => setAccessibilityFlag(row.key, v)}
                  aria-label={row.label}
                />
              </div>
            ))
          ) : (
            <div aria-busy aria-label={`Loading ${group.section.toLowerCase()} settings`}>
              <Skeleton className="h-[52px] w-full rounded-none" />
            </div>
          )}
        </SettingsSection>
      ))}

      {/* Device settings — the browser/OS layer keeps its own authority. */}
      <SettingsSection title="Device settings">
        <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
          <Icon name="info" size={18} className="shrink-0 text-text-secondary" />
          <div className="min-w-0 flex-1">
            <p className="text-body-emphasis text-text-primary">Works with your device</p>
            <p className="text-caption text-text-muted">
              Reduced motion, contrast and zoom set in your browser or operating
              system are respected automatically — these options add
              ThryftVerse-level control on top.
            </p>
          </div>
        </div>
      </SettingsSection>

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        Preferences are stored on this device and apply across the whole web
        app, not just this screen.
      </p>
    </>
  );
}
