/**
 * CatalogImportProgressScreen — the import progress surface.
 *
 * The backend owns progress; this screen never fakes a percentage. A calm,
 * centred phase statement carries the viewport, with the ImportReadinessBar
 * beneath it as the only quantitative signal. Terminal phases surface the
 * next obvious action; failure and pause surface a retry. Cancel is a
 * text-only destructive affordance at the bottom — never equal in weight to
 * the primary action.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import {
  Space,
  Radius,
  Type,
  FontFamily,
  Control,
  DockConstants,
} from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { ImportReadinessBar } from '../components/catalogImport/ImportReadinessBar';
import { useCatalogImport } from '../hooks/useCatalogImport';
import {
  fetchPublicationReceipt,
  CatalogImportError,
  type PublicationReceiptDTO,
} from '../services/catalogImportApi';
import type { RootStackParamList } from '../navigation/types';
import { ConfirmationSheet } from '../components/ConfirmationSheet';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CatalogImportProgress'>;
type ProgressRoute = RouteProp<RootStackParamList, 'CatalogImportProgress'>;

const SOURCE_LABEL: Record<string, string> = {
  seller_package: 'Seller package',
  ebay: 'eBay',
  depop: 'Depop',
  vinted: 'Vinted',
};

const PHASE_COPY: Record<string, string> = {
  connecting: 'Connecting…',
  finding_listings: 'Finding your listings',
  copying_photos: 'Copying photos securely',
  preparing_details: 'Preparing details',
  ready_to_review: 'Ready to review',
  needs_input: 'Needs your input',
  publishing: 'Publishing drafts…',
  completed: 'Import complete',
  cancelled: 'Import cancelled',
  paused: 'Paused',
  failed: 'Something went wrong',
};

export default function CatalogImportProgressScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<ProgressRoute>();
  const { batchId } = route.params;
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { batch, phase, loading, error, retry, cancel } = useCatalogImport(batchId);

  const [receipt, setReceipt] = useState<PublicationReceiptDTO | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });
  const isMountedRef = useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Fetch the publication receipt once the batch reaches 'completed'.
  React.useEffect(() => {
    if (phase !== 'completed' || !batch) return;
    let cancelled = false;
    fetchPublicationReceipt(batchId)
      .then((r) => {
        if (!cancelled && isMountedRef.current) {
          setReceipt(r);
          setReceiptError(null);
        }
      })
      .catch((cause) => {
        if (!cancelled && isMountedRef.current) {
          const message =
            cause instanceof CatalogImportError ? cause.message : 'Couldn’t load the receipt.';
          setReceiptError(message);
        }
      });
    return () => { cancelled = true; };
  }, [phase, batch, batchId]);

  const phaseLabel = PHASE_COPY[phase] ?? phase;
  const sourceLabel = batch ? SOURCE_LABEL[batch.source] ?? batch.source : '';
  const isFailed = phase === 'failed';
  const isPaused = phase === 'paused';
  const isReadyToReview = phase === 'ready_to_review';
  const isCompleted = phase === 'completed';
  const isCancelled = phase === 'cancelled';
  const isTerminal = isCompleted || isCancelled;
  const canCancel = !isTerminal && !isFailed;

  const handleRetry = useCallback(async () => {
    if (actionInFlight) return;
    setActionInFlight(true);
    try {
      await retry();
    } catch {
      // error surfaced by hook
    } finally {
      if (isMountedRef.current) setActionInFlight(false);
    }
  }, [actionInFlight, retry]);

  const handleReview = useCallback(() => {
    navigation.navigate('CatalogImportReview', { batchId });
  }, [navigation, batchId]);

  const handleViewCloset = useCallback(() => {
    navigation.navigate('Closet');
  }, [navigation]);

  const handleCancel = useCallback(() => {
    setConfirmSheet({
      visible: true,
      title: 'Cancel import?',
      message: 'The import will stop. Any items already prepared will be discarded.',
      confirmLabel: 'Cancel import',
      variant: 'danger',
      onConfirm: () => { void cancel(); },
    });
  }, [cancel, setConfirmSheet]);

  const enter = reducedMotion ? undefined : FadeIn.duration(300);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading && !batch) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} styles={styles} onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.loadingText}>Loading import…</Text>
        </View>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error && !batch) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} styles={styles} onPress={() => navigation.goBack()} />
        </View>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load this import"
          subtitle="Check your connection and try again."
          ctaLabel="Try again"
          onCtaPress={() => navigation.goBack()}
        />
      </View>
    );
  }

  const readyCount = batch?.readyCount ?? 0;
  const discoveredCount = batch?.discoveredCount ?? 0;
  const statusReason = batch?.statusReason ?? null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <BackButton colors={colors} styles={styles} onPress={() => navigation.goBack()} />
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
        {/* ── Source + status line ── */}
        <Text style={styles.sourceLine} numberOfLines={1}>
          {sourceLabel}
        </Text>

        {/* ── Phase statement — the dominant object ── */}
        <Reanimated.View entering={enter} style={styles.phaseWrap}>
          <Text style={styles.phaseTitle}>{phaseLabel}</Text>
          {isReadyToReview && readyCount > 0 ? (
            <Text style={styles.phaseCount}>
              {`${readyCount} ready to review`}
            </Text>
          ) : null}
          {(isFailed || isPaused) && statusReason ? (
            <Text style={styles.phaseReason}>{statusReason}</Text>
          ) : null}
        </Reanimated.View>

        {/* ── Readiness bar — the only quantitative signal ── */}
        {!isTerminal ? (
          <View style={styles.barWrap}>
            <ImportReadinessBar
              phase={phase}
              discoveredCount={discoveredCount}
              readyCount={readyCount}
            />
          </View>
        ) : null}

        {/* ── Completed receipt summary ── */}
        {isCompleted ? (
          <Reanimated.View entering={enter} style={styles.receiptSummary}>
            {receipt ? (
              <>
                <ReceiptRow
                  count={receipt.liveCount}
                  label="live"
                  colors={colors}
                  tone="success"
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
              </>
            ) : receiptError ? (
              <Text style={styles.receiptErrorText}>{receiptError}</Text>
            ) : (
              <ActivityIndicator size="small" color={colors.brand} />
            )}
          </Reanimated.View>
        ) : null}
      </ScrollView>

      {/* ── Bottom dock ── */}
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
        {isFailed || isPaused ? (
          <AnimatedPressable
            style={[styles.dockButton, actionInFlight && styles.dockButtonDisabled]}
            onPress={handleRetry}
            disabled={actionInFlight}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel="Retry import"
            accessibilityState={{ disabled: actionInFlight }}
          >
            {actionInFlight ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={styles.dockButtonText}>Retry</Text>
            )}
          </AnimatedPressable>
        ) : null}

        {isReadyToReview ? (
          <AnimatedPressable
            style={styles.dockButton}
            onPress={handleReview}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel={`Review ${readyCount} items`}
          >
            <Text style={styles.dockButtonText}>Review items</Text>
          </AnimatedPressable>
        ) : null}

        {isCompleted ? (
          <AnimatedPressable
            style={styles.dockButton}
            onPress={handleViewCloset}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel="View your closet"
          >
            <Text style={styles.dockButtonText}>View your closet</Text>
          </AnimatedPressable>
        ) : null}

        {/* ── Cancel — text-only, destructive, never equal weight ── */}
        {canCancel ? (
          <AnimatedPressable
            style={styles.cancelButton}
            onPress={handleCancel}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Cancel import"
          >
            <Text style={styles.cancelText}>Cancel import</Text>
          </AnimatedPressable>
        ) : null}
      </View>

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
      />
    </View>
  );
}

// ── Receipt summary row ──────────────────────────────────────────────────────
function ReceiptRow({
  count,
  label,
  colors,
  tone = 'default',
}: {
  count: number;
  label: string;
  colors: ThemeColors;
  tone?: 'default' | 'success' | 'danger' | 'muted';
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

  return (
    <View style={styles.row}>
      <Text style={styles.count}>{count}</Text>
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
    </View>
  );
}

const createReceiptRowStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    count: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.numericMeta.size,
      lineHeight: Type.numericMeta.lineHeight,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      minWidth: 32,
    },
    label: {
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
    },
  });

// ── Back button — transparent 44pt hit, 22pt glyph, no chrome ────────────────
function BackButton({
  colors,
  styles,
  onPress,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={styles.backHit}
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
    backHit: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.smMd,
    },
    loadingText: {
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textSecondary,
    },
    scrollContent: {
      paddingHorizontal: Space.md,
      flexGrow: 1,
    },
    sourceLine: {
      fontFamily: FontFamily.medium,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textSecondary,
      marginTop: Space.sm,
    },
    phaseWrap: {
      paddingTop: Space.xl,
      paddingBottom: Space.lg,
      alignItems: 'center',
    },
    phaseTitle: {
      fontFamily: FontFamily.bold,
      fontSize: Type.title.size,
      lineHeight: Type.title.lineHeight,
      letterSpacing: Type.title.letterSpacing,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    phaseCount: {
      marginTop: Space.sm,
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    phaseReason: {
      marginTop: Space.sm,
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.danger,
      textAlign: 'center',
    },
    barWrap: {
      paddingTop: Space.md,
    },
    receiptSummary: {
      paddingTop: Space.lg,
    },
    receiptErrorText: {
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.danger,
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
    dockButton: {
      height: DockConstants.primaryButtonHeight,
      borderRadius: Radius.sm,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dockButtonDisabled: {
      opacity: 0.4,
    },
    dockButtonText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.bodyEmphasis.size,
      lineHeight: Type.bodyEmphasis.lineHeight,
      color: colors.textInverse,
    },
    cancelButton: {
      alignSelf: 'center',
      paddingVertical: Space.smMd,
      paddingHorizontal: Space.lg,
      marginTop: Space.sm,
    },
    cancelText: {
      fontFamily: FontFamily.medium,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.danger,
    },
  });
