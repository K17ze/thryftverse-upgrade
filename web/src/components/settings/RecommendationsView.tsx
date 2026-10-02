'use client';

/**
 * RecommendationsView — the /settings/recommendations surface.
 *
 * Web port of the mobile AIPreferencesScreen: a master switch plus the
 * six per-feature toggles for assisted surfaces — listing suggestions,
 * photo enhancement, search autocomplete, chat agents, offer
 * auto-accept rules and confidence indicators — persisted via aiPrefs.
 * Feature names stay benefit-led (no "AI" prefix), same as mobile.
 *
 * Truth posture (AGENTS.md §11): the account-preferences wire has no
 * AI-toggle seat, so every flag is device-local in every build and the
 * notice is always rendered, never a demo badge. The wired consumers —
 * the sell composer's auto-fill control, both search-autocomplete
 * fields and the photo editor's Enhance tab — read these flags live;
 * the rest record the choice until their surfaces honour it.
 */

import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from './Switch';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useHydrated } from '@/lib/store/useStore';
import {
  AI_FEATURE_KEYS,
  useAIPrefs,
  type AIFeatureKey,
} from '@/lib/store/aiPrefs';

interface FeatureRow {
  key: AIFeatureKey;
  icon: AppIconName;
  label: string;
  sub: string;
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    key: 'listingSuggestions',
    icon: 'sparkles',
    label: 'Listing suggestions',
    sub: 'Get suggested titles, descriptions and price estimates',
  },
  {
    key: 'photoEnhancement',
    icon: 'image',
    label: 'Photo enhancement',
    sub: 'Receive photo editing suggestions for your listings',
  },
  {
    key: 'searchAutocomplete',
    icon: 'search',
    label: 'Search autocomplete',
    sub: 'Show autocomplete suggestions while you search',
  },
  {
    key: 'chatAgents',
    icon: 'inbox',
    label: 'Chat agents',
    sub: 'Enable agents to assist in your conversations',
  },
  {
    key: 'smartSell',
    icon: 'trending',
    label: 'Offer auto-accept rules',
    sub: 'Preview — saved on this device only; offer rules are not applied to live offers',
  },
  {
    key: 'confidenceDisplay',
    icon: 'analytics',
    label: 'Confidence indicators',
    sub: 'Show confidence indicators on suggestions',
  },
];

export function RecommendationsView() {
  // Persisted flags diverge from SSR on returning sessions — the summary
  // and both toggle sections render skeletons until the client store
  // has hydrated, the same gate the other prefs surfaces use.
  const hydrated = useHydrated();
  const prefs = useAIPrefs();
  const activeCount = AI_FEATURE_KEYS.filter((k) => prefs[k]).length;
  const total = AI_FEATURE_KEYS.length;

  return (
    <>
      {/* Honesty notice — always rendered: these toggles are device-local
          in every build and some features are still in preview, so it is
          not a demo-only indicator. */}
      <div className="px-4 sm:px-5">
        <div className="flex items-center gap-2.5 rounded-lg bg-surface-alt px-4 py-3">
          <Icon name="info" size={16} className="shrink-0 text-text-secondary" />
          <p className="text-meta text-text-secondary">
            Preferences are saved on this device. Some features are in
            preview and may not respond to these settings yet.
          </p>
        </div>
      </div>

      {/* Summary — the active count and a quiet progress line, mobile
          parity with the hero block. */}
      <div className="px-4 py-5 sm:px-5">
        {hydrated ? (
          <>
            <p className="text-body-emphasis font-semibold text-text-primary">
              {prefs.masterEnabled
                ? `${activeCount} of ${total} features on`
                : 'All features off'}
            </p>
            <p className="mt-0.5 text-caption text-text-muted">
              {activeCount === total
                ? 'All features enabled'
                : activeCount === 0
                  ? 'No features active'
                  : 'Some features paused'}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-200"
                  style={{ width: `${(activeCount / total) * 100}%` }}
                />
              </div>
              <span className="tnum w-9 text-right text-caption text-text-muted">
                {activeCount}/{total}
              </span>
            </div>
          </>
        ) : (
          <div aria-busy aria-label="Loading preferences summary">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-24" />
            <Skeleton className="mt-4 h-1.5 w-full" />
          </div>
        )}
      </div>

      {/* Master control — off forces every feature off; re-enabling keeps
          the recorded mix rather than reviving everything. */}
      <SettingsSection title="Master control">
        {hydrated ? (
          <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
            <Icon name="zap" size={18} className="shrink-0 text-text-secondary" />
            <div className="min-w-0 flex-1">
              <p className="text-body-emphasis text-text-primary">Enable suggestions</p>
              <p className="clamp-1 text-caption text-text-muted">
                Turn all assisted features on or off
              </p>
            </div>
            <Switch
              checked={prefs.masterEnabled}
              onChange={prefs.setMasterEnabled}
              aria-label="Enable suggestions"
            />
          </div>
        ) : (
          <Skeleton className="h-[52px] w-full rounded-none" />
        )}
      </SettingsSection>

      <SettingsSection title="Features">
        {hydrated ? (
          FEATURE_ROWS.map((row) => (
            <div
              key={row.key}
              className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5"
            >
              <div
                className={`flex min-w-0 flex-1 items-center gap-3 ${
                  prefs.masterEnabled ? '' : 'opacity-50'
                }`}
              >
                <Icon name={row.icon} size={18} className="shrink-0 text-text-secondary" />
                <div className="min-w-0 flex-1">
                  <p className="text-body-emphasis text-text-primary">{row.label}</p>
                  <p className="clamp-1 text-caption text-text-muted">{row.sub}</p>
                </div>
              </div>
              <Switch
                checked={prefs[row.key]}
                onChange={(v) => prefs.setFeature(row.key, v)}
                aria-label={row.label}
                disabled={!prefs.masterEnabled}
              />
            </div>
          ))
        ) : (
          <div aria-busy aria-label="Loading feature preferences">
            {FEATURE_ROWS.map((row) => (
              <Skeleton key={row.key} className="h-[52px] w-full rounded-none" />
            ))}
          </div>
        )}
      </SettingsSection>

      {/* Transparency — the real disclosure surfaces, same destinations
          as mobile's YourAlgorithm and AgentMemory rows. */}
      <SettingsSection title="Transparency">
        <SettingsRow
          icon="feed"
          label="Your feed"
          subtitle="See the signals that shape your feed"
          href="/agents/algorithm"
        />
        <SettingsRow
          icon="bookmark"
          label="Agent memory"
          subtitle="See and forget what agents remember about you"
          href="/agents/memory"
        />
      </SettingsSection>

      {/* Data usage — the same inline disclosure mobile renders. */}
      <div className="px-4 py-6 sm:px-5">
        <div className="flex items-center gap-2">
          <Icon name="chip" size={18} className="shrink-0 text-text-secondary" />
          <h2 className="text-body-emphasis font-semibold text-text-primary">Data usage</h2>
        </div>
        <p className="mt-1.5 text-meta leading-relaxed text-text-muted">
          Assisted features can use your listing content, search queries and chat
          messages to generate suggestions. Where a server assistant is configured,
          the relevant content is sent to that provider to produce a response;
          otherwise suggestions are produced on-device from local signals such as
          photo file names. Turning a feature off records your preference on this
          device.
        </p>
      </div>
    </>
  );
}
