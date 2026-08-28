/**
 * CatalogImportStartScreen — entry point for the Concierge Catalogue Importer.
 *
 * The first viewport is an authored choice, not a grid of equal integration
 * cards. A single hero statement carries the screen; the available source is
 * the dominant object and unavailable sources recede as a flat hairline list.
 * The single obvious action lives in a persistent bottom dock.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Reanimated, { FadeInUp } from 'react-native-reanimated';
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
import {
  fetchImportSources,
  CatalogImportError,
  type SourceCapabilityDTO,
  type CatalogSource,
} from '../services/catalogImportApi';

// ── Navigation param list (registered separately by the main agent) ──────────
export type CatalogImportStackParamList = {
  CatalogImportStart: undefined;
  CatalogImportConsent: { source: CatalogSource };
  CatalogImportProgress: { batchId: string };
  CatalogImportReview: { batchId: string };
  CatalogImportSummary: { batchId: string };
  CatalogImportItem: { itemId: string; batchId: string };
};

type Nav = NativeStackNavigationProp<CatalogImportStackParamList, 'CatalogImportStart'>;

const SOURCE_LABEL: Record<CatalogSource, string> = {
  seller_package: 'Send your catalogue',
  ebay: 'eBay',
  depop: 'Depop',
  vinted: 'Vinted',
};

export default function CatalogImportStartScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [sources, setSources] = useState<SourceCapabilityDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchImportSources();
      if (!isMountedRef.current) return;
      setSources(data);
    } catch (cause) {
      if (!isMountedRef.current) return;
      const message =
        cause instanceof CatalogImportError ? cause.message : 'Couldn’t load sources.';
      setError(message);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const handleSendCatalogue = useCallback(() => {
    navigation.navigate('CatalogImportConsent', { source: 'seller_package' });
  }, [navigation]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const availableSource = useMemo(
    () => sources.find((s) => s.available) ?? null,
    [sources]
  );
  const unavailableSources = useMemo(
    () => sources.filter((s) => !s.available),
    [sources]
  );

  const enter = reducedMotion ? undefined : FadeInUp.duration(280).springify().damping(24).stiffness(220);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} styles={styles} onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.loadingText}>Loading sources…</Text>
        </View>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} styles={styles} onPress={() => navigation.goBack()} />
        </View>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load sources"
          subtitle="Check your connection and try again."
          ctaLabel="Try again"
          onCtaPress={() => { setLoading(true); void load(); }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <BackButton colors={colors} styles={styles} onPress={() => navigation.goBack()} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + DockConstants.singleActionHeight + Space.md },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.textSecondary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — the hero IS the title ── */}
        <Reanimated.View entering={enter} style={styles.hero}>
          <Text style={styles.heroTitle}>Bring your shop to ThryftVerse</Text>
          <Text style={styles.heroSubtitle}>
            We prepare the drafts. You decide what goes live.
          </Text>
        </Reanimated.View>

        {/* ── Available source — the dominant object ── */}
        {availableSource && (
          <Reanimated.View entering={enter} style={styles.section}>
            <AnimatedPressable
              style={styles.primarySourceCard}
              onPress={handleSendCatalogue}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={`${SOURCE_LABEL[availableSource.source]} — start import`}
            >
              <View style={styles.primarySourceText}>
                <Text style={styles.primarySourceTitle}>
                  {SOURCE_LABEL[availableSource.source]}
                </Text>
                <Text style={styles.primarySourceDesc}>
                  Upload a CSV or export from your current platform. We’ll turn it into private drafts.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={Control.icon}
                color={colors.textSecondary}
              />
            </AnimatedPressable>
          </Reanimated.View>
        )}

        {/* ── Unavailable sources — recede, never equal-weight ── */}
        {unavailableSources.length > 0 && (
          <View style={styles.unavailableSection}>
            <Text style={styles.unavailableHeading}>Selling somewhere else?</Text>
            {unavailableSources.map((src, i) => (
              <View
                key={src.source}
                style={[
                  styles.unavailableRow,
                  i < unavailableSources.length - 1 && styles.unavailableRowBorder,
                ]}
              >
                <Text style={styles.unavailableLabel}>{SOURCE_LABEL[src.source]}</Text>
                <Text style={styles.unavailableReason} numberOfLines={1}>
                  {src.unavailableReason ?? 'Coming soon'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Persistent primary action ── */}
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
        <AnimatedPressable
          style={styles.dockButton}
          onPress={handleSendCatalogue}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel="Send a catalogue"
        >
          <Text style={styles.dockButtonText}>Send a catalogue</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

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
    hero: {
      paddingTop: Space.xl,
      paddingBottom: Space.lg,
    },
    heroTitle: {
      fontFamily: FontFamily.bold,
      fontSize: Type.title.size,
      lineHeight: Type.title.lineHeight,
      letterSpacing: Type.title.letterSpacing,
      color: colors.textPrimary,
    },
    heroSubtitle: {
      marginTop: Space.sm,
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      letterSpacing: Type.body.letterSpacing,
      color: colors.textSecondary,
    },
    section: {
      marginBottom: Space.xl,
    },
    primarySourceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingVertical: Space.lg,
      paddingHorizontal: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
    },
    primarySourceText: {
      flex: 1,
    },
    primarySourceTitle: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.subtitle.size,
      lineHeight: Type.subtitle.lineHeight,
      letterSpacing: Type.subtitle.letterSpacing,
      color: colors.textPrimary,
    },
    primarySourceDesc: {
      marginTop: Space.xxs,
      fontFamily: FontFamily.regular,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textSecondary,
    },
    unavailableSection: {
      paddingTop: Space.md,
    },
    unavailableHeading: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textSecondary,
      marginBottom: Space.sm,
    },
    unavailableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.smMd,
      gap: Space.md,
    },
    unavailableRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    unavailableLabel: {
      fontFamily: FontFamily.medium,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      color: colors.textPrimary,
    },
    unavailableReason: {
      flexShrink: 1,
      fontFamily: FontFamily.regular,
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      color: colors.textMuted,
      textAlign: 'right',
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
    dockButtonText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.bodyEmphasis.size,
      lineHeight: Type.bodyEmphasis.lineHeight,
      color: colors.textInverse,
    },
  });
