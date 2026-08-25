/**
 * CatalogImportSummaryScreen — the completion receipt.
 *
 * Factual, not a celebration. No confetti, no “Success!” big text. A flat
 * canvas with hairline-separated rows reports what happened. The two bottom
 * dock actions move the seller forward — to the closet, or back to fix what
 * remains. When the outcome is unknown a separate restrained section surfaces
 * a check-result affordance.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import {
  Space,
  Radius,
  Type,
  FontFamily,
  Stroke,
  Control,
  DockConstants,
} from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import {
  fetchPublicationReceipt,
  CatalogImportError,
  type PublicationReceiptDTO,
} from '../services/catalogImportApi';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CatalogImportSummary'>;
type SummaryRoute = RouteProp<RootStackParamList, 'CatalogImportSummary'>;

const DOT_SIZE = 8;
const COUNT_COL_WIDTH = 40;

export default function CatalogImportSummaryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<SummaryRoute>();
  const { batchId } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [receipt, setReceipt] = useState<PublicationReceiptDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchPublicationReceipt(batchId);
      if (!isMountedRef.current) return;
      setReceipt(r);
    } catch (cause) {
      if (!isMountedRef.current) return;
      const message =
        cause instanceof CatalogImportError ? cause.message : 'Couldn’t load the receipt.';
      setError(message);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBack = useCallback(() => {
    navigation.navigate('SellerHub');
  }, [navigation]);

  const handleViewCloset = useCallback(() => {
    navigation.navigate('Closet');
  }, [navigation]);

  const handleFixRemaining = useCallback(() => {
    navigation.navigate('CatalogImportReview', { batchId });
  }, [navigation, batchId]);

  const handleRetry = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} onPress={handleBack} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !receipt) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} onPress={handleBack} />
        </View>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load receipt"
          subtitle="Check your connection and try again."
          ctaLabel="Try again"
          onCtaPress={handleRetry}
        />
      </View>
    );
  }

  const showFixRemaining = receipt.failedCount > 0 || receipt.outcomeUnknownCount > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <BackButton colors={colors} onPress={handleBack} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: insets.bottom + DockConstants.singleActionHeight + Space.lg,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Title — left-aligned, factual ── */}
        <Text style={styles.title}>Import complete</Text>

        {/* ── Receipt — flat canvas, hairline separators ── */}
        <View style={styles.receiptSection}>
          {/* Live — success dot + itemTitle weight */}
          <ReceiptRow
            count={receipt.liveCount}
            label="live"
            colors={colors}
            tone="success"
            showDot
            first
          />

          {receipt.draftCount > 0 ? (
            <ReceiptRow
              count={receipt.draftCount}
              label="kept as drafts"
              colors={colors}
            />
          ) : null}

          {receipt.failedCount > 0 ? (
            <ReceiptRow
              count={receipt.failedCount}
              label="needs a new photo"
              colors={colors}
              tone="danger"
            />
          ) : null}

          {receipt.excludedCount > 0 ? (
            <ReceiptRow
              count={receipt.excludedCount}
              label="excluded"
              colors={colors}
              tone="muted"
            />
          ) : null}
        </View>

        {/* ── Outcome unknown — restrained separate section ── */}
        {receipt.outcomeUnknownCount > 0 ? (
          <View style={styles.unknownSection}>
            <Text style={styles.unknownHeading}>Result not confirmed</Text>
            <Text style={styles.unknownBody}>
              {`${receipt.outcomeUnknownCount} item${receipt.outcomeUnknownCount === 1 ? '' : 's'} couldn’t be confirmed. Check whether they published.`}
            </Text>
            <AnimatedPressable
              style={styles.checkResultButton}
              onPress={handleFixRemaining}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Check result"
            >
              <Text style={styles.checkResultText}>Check result</Text>
            </AnimatedPressable>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Bottom dock — two actions side by side ── */}
      <View
        style={[
          styles.dock,
          {
            paddingBottom: insets.bottom + Space.sm,
            backgroundColor: colors.background,
            borderTopColor: colors.borderSubtle,
          },
        ]}
      >
        <View style={styles.dockRow}>
          {showFixRemaining ? (
            <AnimatedPressable
              style={[styles.dockButton, styles.dockButtonSecondary]}
              onPress={handleFixRemaining}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="Fix remaining items"
            >
              <Text style={styles.dockButtonTextSecondary}>Fix remaining</Text>
            </AnimatedPressable>
          ) : null}

          <AnimatedPressable
            style={styles.dockButton}
            onPress={handleViewCloset}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel="View your closet"
          >
            <Text style={styles.dockButtonText}>View your closet</Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  );
}

// ── Receipt row — count column + label, hairline separator ───────────────────
function ReceiptRow({
  count,
  label,
  colors,
  tone = 'default',
  showDot = false,
  first = false,
}: {
  count: number;
  label: string;
  colors: ThemeColors;
  tone?: 'default' | 'success' | 'danger' | 'muted';
  showDot?: boolean;
  first?: boolean;
}) {
  const styles = useMemo(() => createReceiptRowStyles(colors), [colors]);
  const labelColor =
    tone === 'success'
      ? colors.textPrimary
      : tone === 'danger'
        ? colors.danger
        : tone === 'muted'
          ? colors.textMuted
          : colors.textSecondary;

  const isStrong = tone === 'success';

  return (
    <View style={[styles.row, !first && styles.rowSeparator]}>
      <Text style={styles.count}>{count}</Text>

      <View style={styles.labelWrap}>
        {showDot ? <View style={styles.successDot} /> : null}
        <Text
          style={[
            isStrong ? styles.labelStrong : styles.label,
            { color: labelColor },
          ]}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const createReceiptRowStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
    },
    rowSeparator: {
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.borderSubtle,
    },
    count: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.numericMeta.size,
      lineHeight: Type.numericMeta.lineHeight,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      width: COUNT_COL_WIDTH,
    },
    labelWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    successDot: {
      width: DOT_SIZE,
      height: DOT_SIZE,
      borderRadius: DOT_SIZE / 2,
      backgroundColor: colors.success,
    },
    label: {
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
    },
    labelStrong: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.itemTitle.size,
      lineHeight: Type.itemTitle.lineHeight,
      letterSpacing: Type.itemTitle.letterSpacing,
    },
  });

// ── Back button — transparent 44pt hit, 22pt glyph, no chrome ────────────────
const backHitStyle = {
  width: Control.hit,
  height: Control.hit,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

function BackButton({
  colors,
  onPress,
}: {
  colors: ThemeColors;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={backHitStyle}
    >
      <Ionicons name="chevron-back" size={Control.icon} color={colors.textPrimary} />
    </AnimatedPressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.xs,
      minHeight: Control.hit,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      paddingHorizontal: Space.md,
      flexGrow: 1,
    },
    title: {
      fontFamily: FontFamily.bold,
      fontSize: Type.title.size,
      lineHeight: Type.title.lineHeight,
      letterSpacing: Type.title.letterSpacing,
      color: colors.textPrimary,
      marginTop: Space.sm,
      marginBottom: Space.lg,
    },
    receiptSection: {
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.borderSubtle,
    },
    unknownSection: {
      marginTop: Space.xl,
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      gap: Space.sm,
    },
    unknownHeading: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.bodyEmphasis.size,
      lineHeight: Type.bodyEmphasis.lineHeight,
      color: colors.warning,
    },
    unknownBody: {
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textSecondary,
    },
    checkResultButton: {
      alignSelf: 'flex-start',
      paddingVertical: Space.smMd,
      paddingHorizontal: Space.lg,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard,
      borderColor: colors.borderSubtle,
      minHeight: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Space.xs,
    },
    checkResultText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textPrimary,
    },
    dock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: Space.sm,
      paddingHorizontal: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    dockRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    dockButton: {
      flex: 1,
      height: DockConstants.primaryButtonHeight,
      borderRadius: Radius.sm,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dockButtonSecondary: {
      backgroundColor: 'transparent',
      borderWidth: Stroke.standard,
      borderColor: colors.borderSubtle,
    },
    dockButtonText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.bodyEmphasis.size,
      lineHeight: Type.bodyEmphasis.lineHeight,
      color: colors.textInverse,
    },
    dockButtonTextSecondary: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.bodyEmphasis.size,
      lineHeight: Type.bodyEmphasis.lineHeight,
      color: colors.textPrimary,
    },
  });
