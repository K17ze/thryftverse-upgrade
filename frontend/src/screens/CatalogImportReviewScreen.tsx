/**
 * CatalogImportReviewScreen — the review workbench.
 *
 * The dominant object is listing media and readiness, not a dashboard of
 * metric cards. A single summary line carries the counts; the rest of the
 * viewport belongs to the media grid. Filter tabs are restrained — a thin
 * brand underline marks the selected tab, nothing more. The bottom dock
 * holds the single approve action, gated by outstanding issues.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import {
  Space,
  Radius,
  FontFamily,
  Stroke,
  Control,
  DockConstants } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { ImportListingTile } from '../components/catalogImport/ImportListingTile';
import { useCatalogImportItems } from '../hooks/useCatalogImportItems';
import {
  approveImportBatch,
  CatalogImportError,
  type ImportItemDTO,
  type ItemReadiness,
  type SellerDecision } from '../services/catalogImportApi';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CatalogImportReview'>;
type ReviewRoute = RouteProp<RootStackParamList, 'CatalogImportReview'>;

type FilterKey = 'all' | 'ready' | 'needs_input' | 'duplicate' | 'excluded';

interface FilterTab {
  key: FilterKey;
  label: string;
  filter: { readiness?: ItemReadiness; decision?: SellerDecision };
}

const FILTER_TABS: FilterTab[] = [
  { key: 'all', label: 'Ready', filter: { readiness: 'ready' } },
  { key: 'needs_input', label: 'Needs input', filter: { readiness: 'needs_input' } },
  { key: 'duplicate', label: 'Duplicates', filter: { readiness: 'probable_duplicate' } },
  { key: 'excluded', label: 'Excluded', filter: { readiness: 'excluded' } },
];

const TILE_SKELETON_COUNT = 6;

export default function CatalogImportReviewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<ReviewRoute>();
  const { batchId } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { items, summary, loading, error, hasMore, loadMore, refresh, filter, setFilter } =
    useCatalogImportItems(batchId);

  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── Active filter key — derived from the hook's filter object ──
  const activeFilterKey = useMemo<FilterKey>(() => {
    const f = filter;
    if (f.readiness === 'needs_input') return 'needs_input';
    if (f.readiness === 'probable_duplicate') return 'duplicate';
    if (f.readiness === 'excluded') return 'excluded';
    return 'all';
  }, [filter]);

  const handleSelectFilter = useCallback(
    (tab: FilterTab) => {
      setFilter(tab.filter);
    },
    [setFilter],
  );

  const handleItemPress = useCallback(
    (itemId: string) => {
      navigation.navigate('CatalogImportItem', { itemId, batchId });
    },
    [navigation, batchId],
  );

  // ── Counts for the summary line and dock ──
  const readyCount = summary?.ready ?? 0;
  const needsInputCount = summary?.needsInput ?? 0;
  const issueCount = needsInputCount;

  const handleApprove = useCallback(async () => {
    if (approving) return;
    if (issueCount > 0) return;
    setApproving(true);
    setApproveError(null);
    try {
      // Approve every currently-loaded item. The backend treats this as the
      // seller's selection of all ready drafts.
      const itemIds = items.map((i) => i.id);
      await approveImportBatch(batchId, {
        itemIds,
        attestation: {
          ownsRights: true,
          accurateFacts: true,
          noBuyerData: true } });
      if (!isMountedRef.current) return;
      navigation.navigate('CatalogImportProgress', { batchId });
    } catch (cause) {
      if (!isMountedRef.current) return;
      const message =
        cause instanceof CatalogImportError ? cause.message : 'Couldn’t approve drafts.';
      setApproveError(message);
    } finally {
      if (isMountedRef.current) setApproving(false);
    }
  }, [approving, issueCount, items, batchId, navigation]);

  const renderItem = useCallback<ListRenderItem<ImportItemDTO>>(
    ({ item }) => (
      <View style={styles.tileCell}>
        <ImportListingTile item={item} onPress={handleItemPress} />
      </View>
    ),
    [handleItemPress, styles.tileCell],
  );

  const renderSkeleton = useCallback<ListRenderItem<number>>(
    ({ index }) => <SkeletonTile colors={colors} index={index} />,
    [colors],
  );

  const summaryText = useMemo(() => {
    const parts: string[] = [];
    if (readyCount > 0) parts.push(`${readyCount} ready`);
    if (needsInputCount > 0) parts.push(`${needsInputCount} need attention`);
    if (parts.length === 0) return 'No items yet';
    return parts.join(' · ');
  }, [readyCount, needsInputCount]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading && items.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.summaryWrap}>
          <Text style={styles.summaryText}>Loading…</Text>
        </View>
        <View style={styles.gridWrap}>
          <FlashList
            data={Array.from({ length: TILE_SKELETON_COUNT }, (_, i) => i)}
            renderItem={renderSkeleton}
            numColumns={2}
            contentContainerStyle={styles.gridContent}
            keyExtractor={(item) => String(item)}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error && items.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} onPress={() => navigation.goBack()} />
        </View>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load items"
          subtitle="Check your connection and try again."
          ctaLabel="Try again"
          onCtaPress={() => { void refresh(); }}
        />
      </View>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (!loading && items.length === 0 && !error) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} onPress={() => navigation.goBack()} />
        </View>
        <EmptyState
          icon="checkmark-done-outline"
          title="No items to review"
          subtitle="All items have been processed."
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <BackButton colors={colors} onPress={() => navigation.goBack()} />
      </View>

      {/* ── Summary line — single line, not metric cards ── */}
      <View style={styles.summaryWrap}>
        <Text style={styles.summaryText} numberOfLines={1}>
          {summaryText}
        </Text>
      </View>

      {/* ── Filter tabs — restrained underline ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContent}
        style={styles.tabsScroll}
      >
        {FILTER_TABS.map((tab) => (
          <FilterTabButton
            key={tab.key}
            label={tab.label}
            active={activeFilterKey === tab.key}
            colors={colors}
            onPress={() => handleSelectFilter(tab)}
          />
        ))}
      </ScrollView>

      {/* ── Media grid — the dominant object ── */}
      <FlashList
        data={items}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={{
          paddingHorizontal: Space.sm,
          paddingVertical: Space.sm,
          paddingBottom: insets.bottom + DockConstants.singleActionHeight + Space.md }}
        keyExtractor={(item) => item.id}
        onEndReached={() => { if (hasMore) void loadMore(); }}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
      />

      {/* ── Bottom dock ── */}
      <View
        style={[
          styles.dock,
          {
            paddingBottom: insets.bottom + Space.sm,
            backgroundColor: colors.background,
            borderTopColor: colors.borderSubtle },
        ]}
      >
        {issueCount > 0 ? (
          <Text style={styles.issueLine} numberOfLines={1}>
            {`Review ${issueCount} issue${issueCount === 1 ? '' : 's'}`}
          </Text>
        ) : null}

        {approveError ? (
          <Text style={styles.approveErrorText} numberOfLines={1}>
            {approveError}
          </Text>
        ) : null}

        <AnimatedPressable
          style={[
            styles.dockButton,
            (issueCount > 0 || approving) && styles.dockButtonDisabled,
          ]}
          onPress={handleApprove}
          disabled={issueCount > 0 || approving}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel={`Approve ${readyCount} drafts`}
          accessibilityState={{ disabled: issueCount > 0 || approving }}
        >
          {approving ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={styles.dockButtonText}>
              {`Approve ${readyCount} draft${readyCount === 1 ? '' : 's'}`}
            </Text>
          )}
        </AnimatedPressable>
      </View>
    </View>
  );
}

// ── Filter tab — underline style, no filled pill ─────────────────────────────
function FilterTabButton({
  label,
  active,
  colors,
  onPress }: {
  label: string;
  active: boolean;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const styles = useMemo(() => createTabStyles(colors), [colors]);
  return (
    <AnimatedPressable
      style={styles.tab}
      onPress={onPress}
      hapticFeedback="selection"
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text style={[styles.tabLabel, !active && styles.tabLabelInactive]}>
        {label}
      </Text>
      {active ? <View style={styles.tabUnderline} /> : null}
    </AnimatedPressable>
  );
}

const createTabStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    tab: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit,
      paddingHorizontal: Space.smMd },
    tabLabel: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.label.size,
      lineHeight: TypographyV2.label.lineHeight,
      letterSpacing: TypographyV2.label.letterSpacing,
      color: colors.textPrimary },
    tabLabelInactive: {
      color: colors.textMuted },
    tabUnderline: {
      position: 'absolute',
      bottom: 0,
      width: 24,
      height: Stroke.emphasis,
      borderRadius: Stroke.emphasis,
      backgroundColor: colors.brand } });

// ── Skeleton tile — flat surfaceAlt square matching tile layout ──────────────
function SkeletonTile({ colors, index }: { colors: ThemeColors; index: number }) {
  const styles = useMemo(() => createSkeletonStyles(colors), [colors]);
  return (
    <View style={styles.cell}>
      <View style={styles.media} />
      <View style={styles.line} />
      <View style={[styles.line, styles.lineShort]} />
    </View>
  );
}

const createSkeletonStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    cell: {
      flex: 1,
      gap: Space.xs,
      padding: Space.sm / 2 },
    media: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt },
    line: {
      height: 10,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt },
    lineShort: {
      width: '60%' } });

// ── Back button — transparent 44pt hit, 22pt glyph, no chrome ────────────────
const backHitStyle = {
  width: Control.hit,
  height: Control.hit,
  alignItems: 'center' as const,
  justifyContent: 'center' as const };

function BackButton({
  colors,
  onPress }: {
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
      flex: 1 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.xs,
      minHeight: Control.hit },
    summaryWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.sm },
    summaryText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary },
    tabsScroll: {
      flexGrow: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },
    tabsContent: {
      paddingHorizontal: Space.sm,
      gap: Space.xs },
    gridWrap: {
      flex: 1 },
    gridContent: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm },
    tileCell: {
      flex: 1,
      padding: Space.sm / 2 },
    dock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: Space.sm,
      paddingHorizontal: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth },
    issueLine: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: Space.sm },
    approveErrorText: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: Space.xs },
    dockButton: {
      height: DockConstants.primaryButtonHeight,
      borderRadius: Radius.sm,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center' },
    dockButtonDisabled: {
      opacity: 0.4 },
    dockButtonText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textInverse } });
