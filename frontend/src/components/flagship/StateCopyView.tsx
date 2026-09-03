/**
 * StateCopyView — a reusable, compact state copy component.
 *
 * Renders a calm, specific state surface for loading, empty, error, offline,
 * stale, and permission-denied states. Uses the centralized state copy
 * registry (`src/theme/stateCopyRegistry.ts`) to get the appropriate text
 * via i18n, and design tokens for all colors.
 *
 * Design principles (AGENTS.md §4, §14):
 *   - No aggressive red for errors — uses `colors.textMuted` and
 *     `colors.warning` for calm urgency.
 *   - Icons are Ionicons, 24pt, `colors.textMuted`.
 *   - Every state offers a clear next step (no dead ends).
 *   - No hardcoded colors — all colors come from `useAppTheme().colors`.
 *
 * @see src/theme/stateCopyRegistry.ts for the copy registry.
 * @see src/i18n/locales/en.json → `stateCopy` namespace for the copy text.
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useStateCopy, type StateCopyState } from '../../theme/stateCopyRegistry';
import { useAppTranslation } from '../../i18n/useAppTranslation';

export interface StateCopyViewProps {
  /** The state to render. */
  state: StateCopyState;
  /** Registry key for the state copy (e.g. "conversations", "listings"). */
  copyKey: string;
  /** Called when the user taps the recovery action (Try again / Refresh). */
  onRetry?: () => void;
  /** Optional CTA label override for the empty state. */
  emptyCtaLabel?: string;
  /** Called when the user taps the empty state CTA. */
  onEmptyCta?: () => void;
  /** Optional style override for the container. */
  style?: StyleProp<ViewStyle>;
}

// ── Icon mapping ────────────────────────────────────────────────────────────
// One icon per state. All 24pt, colors.textMuted — calm, not alarming.

const STATE_ICONS: Record<StateCopyState, React.ComponentProps<typeof Ionicons>['name']> = {
  loading: 'sync-outline',
  empty: 'cube-outline',
  emptyFiltered: 'filter-outline',
  error: 'cloud-offline-outline',
  offline: 'cloud-offline-outline',
  stale: 'time-outline',
  permissionDenied: 'lock-closed-outline',
};

/**
 * StateCopyView — renders a compact, calm state surface.
 *
 * @example
 *   // Error state with retry
 *   <StateCopyView state="error" copyKey="conversations" onRetry={refetch} />
 *
 *   // Empty state with CTA
 *   <StateCopyView
 *     state="empty"
 *     copyKey="inventory"
 *     emptyCtaLabel="Add a listing"
 *     onEmptyCta={() => navigation.navigate('Sell')}
 *   />
 */
export function StateCopyView({
  state,
  copyKey,
  onRetry,
  emptyCtaLabel,
  onEmptyCta,
  style,
}: StateCopyViewProps) {
  const { colors } = useAppTheme();
  const copy = useStateCopy(copyKey);
  const { t } = useAppTranslation('stateCopy');

  // ── Loading: spinner + loading text ──────────────────────────────────
  if (state === 'loading') {
    return (
      <View
        style={[styles.container, style]}
        accessibilityLiveRegion="polite"
        accessibilityRole="progressbar"
      >
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={[styles.message, { color: colors.textMuted }]}>
          {copy.loading}
        </Text>
      </View>
    );
  }

  // ── Resolve the message for the current state ────────────────────────
  const message = resolveMessage(state, copy);
  const iconName = STATE_ICONS[state];

  // ── Determine the action button ──────────────────────────────────────
  const isErrorish = state === 'error' || state === 'offline' || state === 'stale';
  const actionLabel = resolveActionLabel(state, copy, t, emptyCtaLabel);
  const actionHandler = state === 'empty' ? onEmptyCta : onRetry;
  const showAction = actionLabel !== undefined && actionHandler !== undefined;

  return (
    <View
      style={[styles.container, style]}
      accessibilityLiveRegion={isErrorish ? 'assertive' : 'polite'}
    >
      <Ionicons name={iconName} size={24} color={colors.textMuted} />

      <Text
        style={[styles.message, { color: isErrorish ? colors.warning : colors.textSecondary }]}
        accessibilityRole="text"
      >
        {message}
      </Text>

      {showAction && actionLabel && actionHandler ? (
        <Pressable
          onPress={actionHandler}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityHint={isErrorish ? 'Tries loading this again' : undefined}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.actionText, { color: colors.textPrimary }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveMessage(
  state: StateCopyState,
  copy: ReturnType<typeof useStateCopy>,
): string {
  switch (state) {
    case 'empty':
      return copy.empty;
    case 'emptyFiltered':
      return copy.emptyFiltered ?? copy.empty;
    case 'error':
      return copy.error;
    case 'offline':
      return copy.offline ?? copy.error;
    case 'stale':
      return copy.stale ?? copy.error;
    case 'permissionDenied':
      return copy.permissionDenied ?? copy.error;
    default:
      return copy.loading;
  }
}

function resolveActionLabel(
  state: StateCopyState,
  copy: ReturnType<typeof useStateCopy>,
  t: ReturnType<typeof useAppTranslation>['t'],
  emptyCtaOverride?: string,
): string | undefined {
  switch (state) {
    case 'error':
    case 'offline':
      return t('stateCopy:actions.tryAgain');
    case 'stale':
      return t('stateCopy:actions.refresh');
    case 'empty':
      return emptyCtaOverride ?? undefined;
    case 'emptyFiltered':
      return t('stateCopy:actions.clearFilters');
    case 'permissionDenied':
      return undefined;
    default:
      return undefined;
  }
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
    paddingHorizontal: Space.lg,
  },
  message: {
    marginTop: Space.md,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'center',
    maxWidth: 300,
  },
  actionButton: {
    marginTop: Space.lg,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.smMd,
    borderRadius: Radius.xl,
    borderWidth: Stroke.standard,
  },
  actionText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
});
