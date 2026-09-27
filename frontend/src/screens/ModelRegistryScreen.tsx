/**
 * ModelRegistryScreen — operator view of the model artifact registry.
 *
 * The dominant object is the artifact list itself: flat rows separated by
 * hairlines, one summary line carrying the count, and restrained underline
 * tabs for lifecycle filtering. Tapping a row opens a detail sheet with the
 * artifact's lineage and the status transitions the registry API supports
 * (shadow / active / retire / block, plus rollback to the recorded target).
 * There is no registration UI — artifact registration is a pipeline concern.
 *
 * Backend: GET/PATCH /admin/model-artifacts (admin-gated; migration 144).
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import {
  Space,
  FontFamily,
  Stroke,
  Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import {
  fetchModelArtifacts,
  transitionModelArtifactStatus,
  ModelRegistryError,
  type ModelArtifactDTO,
  type ModelArtifactStatus,
  type ModelArtifactTask,
  type ModelArtifactCriticality } from '../services/modelRegistryApi';
import { formatShortDate } from '../utils/dateFormat';
import { t, type TranslationKey } from '../i18n';
import { useStore } from '../store/useStore';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ModelRegistry'>;

type FilterKey = 'all' | ModelArtifactStatus;

const FILTER_TABS: FilterKey[] = [
  'all',
  'candidate',
  'shadow',
  'active',
  'retired',
  'blocked',
];

const PAGE_SIZE = 50;
const SKELETON_ROW_COUNT = 8;

const TASK_LABEL_KEYS: Record<ModelArtifactTask, TranslationKey> = {
  recommendation_ranking: 'modelRegistry.task.recommendationRanking',
  visual_search: 'modelRegistry.task.visualSearch',
  catalogue_import: 'modelRegistry.task.catalogueImport',
  fraud_scoring: 'modelRegistry.task.fraudScoring',
  moderation_triage: 'modelRegistry.task.moderationTriage',
};

const CRITICALITY_LABEL_KEYS: Record<ModelArtifactCriticality, TranslationKey> = {
  low: 'modelRegistry.criticality.low',
  medium: 'modelRegistry.criticality.medium',
  high: 'modelRegistry.criticality.high',
};

const STATUS_LABEL_KEYS: Record<ModelArtifactStatus, TranslationKey> = {
  candidate: 'modelRegistry.filter.candidate',
  shadow: 'modelRegistry.filter.shadow',
  active: 'modelRegistry.filter.active',
  retired: 'modelRegistry.filter.retired',
  blocked: 'modelRegistry.filter.blocked',
};

export default function ModelRegistryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentUser = useStore((s) => s.currentUser);

  const [artifacts, setArtifacts] = useState<ModelArtifactDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  const [selected, setSelected] = useState<ModelArtifactDTO | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const filterRef = useRef<FilterKey>(filter);
  filterRef.current = filter;
  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchPage = useCallback(async (offset: number) => {
    const status = filterRef.current === 'all' ? undefined : filterRef.current;
    return fetchModelArtifacts({ status, limit: PAGE_SIZE, offset });
  }, []);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    offsetRef.current = 0;
    try {
      const result = await fetchPage(0);
      if (!isMountedRef.current) return;
      setArtifacts(result.artifacts);
      offsetRef.current = result.artifacts.length;
      setHasMore(result.artifacts.length === PAGE_SIZE);
    } catch (cause) {
      if (!isMountedRef.current) return;
      setError(
        cause instanceof ModelRegistryError
          ? cause.message
          : t('modelRegistry.error.loadTitle'));
      setArtifacts([]);
      setHasMore(false);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [fetchPage]);

  // Initial load.
  React.useEffect(() => {
    void loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectFilter = useCallback(
    (key: FilterKey) => {
      if (key === filterRef.current) return;
      setFilter(key);
      filterRef.current = key;
      void loadFirstPage();
    },
    [loadFirstPage],
  );

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const result = await fetchPage(offsetRef.current);
      if (!isMountedRef.current) return;
      setArtifacts((prev) => [...prev, ...result.artifacts]);
      offsetRef.current += result.artifacts.length;
      setHasMore(result.artifacts.length === PAGE_SIZE);
    } catch {
      // Pagination failure is non-fatal — the loaded page stays visible and
      // the next onEndReached pass can retry.
    } finally {
      loadingMoreRef.current = false;
      if (isMountedRef.current) setLoadingMore(false);
    }
  }, [fetchPage, hasMore]);

  const openDetail = useCallback((artifact: ModelArtifactDTO) => {
    setActionError(null);
    setSelected(artifact);
  }, []);

  const closeDetail = useCallback(() => {
    if (actionPending) return;
    setSelected(null);
    setActionError(null);
  }, [actionPending]);

  // ── Status transitions — all real PATCH /status calls ──────────────────────
  const runTransition = useCallback(
    async (
      target: { modelId: string; modelVersion: string },
      next: ModelArtifactStatus,
      rollbackModelVersion?: string,
    ) => {
      if (actionPending) return;
      // Promotion to active requires an approvalActor — the operator's own
      // user id is the honest actor record.
      const approvalActor = currentUser?.id;
      if (next === 'active' && !approvalActor) {
        setActionError(t('modelRegistry.error.action'));
        return;
      }
      setActionPending(true);
      setActionError(null);
      try {
        await transitionModelArtifactStatus(target.modelId, target.modelVersion, {
          status: next,
          approvalActor: next === 'active' ? approvalActor : undefined,
          rollbackModelVersion,
        });
        if (!isMountedRef.current) return;
        setSelected(null);
        void loadFirstPage();
      } catch (cause) {
        if (!isMountedRef.current) return;
        setActionError(
          cause instanceof ModelRegistryError
            ? cause.message
            : t('modelRegistry.error.action'));
      } finally {
        if (isMountedRef.current) setActionPending(false);
      }
    },
    [actionPending, currentUser?.id, loadFirstPage],
  );

  const renderItem = useCallback<ListRenderItem<ModelArtifactDTO>>(
    ({ item }) => (
      <ArtifactRow colors={colors} artifact={item} onPress={() => openDetail(item)} />
    ),
    [colors, openDetail],
  );

  const renderSeparator = useCallback(
    () => <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />,
    [colors.borderSubtle, styles.separator],
  );

  const renderSkeleton = useCallback<ListRenderItem<number>>(
    () => <SkeletonRow colors={colors} />,
    [colors],
  );

  const summaryText = useMemo(
    () => t('modelRegistry.summary.count', { count: artifacts.length }),
    [artifacts.length],
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading && artifacts.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} onPress={() => navigation.goBack()} />
          <Text style={styles.topBarTitle}>{t('modelRegistry.title')}</Text>
        </View>
        <View style={styles.summaryWrap}>
          <Text style={styles.summaryText}>{t('modelRegistry.loading')}</Text>
        </View>
        <FlashList
          data={Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => i)}
          renderItem={renderSkeleton}
          ItemSeparatorComponent={renderSeparator}
          keyExtractor={(item) => String(item)}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error && artifacts.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} onPress={() => navigation.goBack()} />
          <Text style={styles.topBarTitle}>{t('modelRegistry.title')}</Text>
        </View>
        <EmptyState
          icon="cloud-offline-outline"
          title={t('modelRegistry.error.loadTitle')}
          subtitle={t('modelRegistry.error.loadSubtitle')}
          ctaLabel={t('modelRegistry.error.retry')}
          onCtaPress={() => { void loadFirstPage(); }}
        />
      </View>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (!loading && artifacts.length === 0 && !error) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <BackButton colors={colors} onPress={() => navigation.goBack()} />
          <Text style={styles.topBarTitle}>{t('modelRegistry.title')}</Text>
        </View>
        <FilterTabBar
          tabs={FILTER_TABS}
          active={filter}
          colors={colors}
          onSelect={handleSelectFilter}
        />
        <EmptyState
          icon="cube-outline"
          title={t('modelRegistry.empty.title')}
          subtitle={t('modelRegistry.empty.subtitle')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <BackButton colors={colors} onPress={() => navigation.goBack()} />
        <Text style={styles.topBarTitle}>{t('modelRegistry.title')}</Text>
      </View>

      {/* ── Summary line — single line, not metric cards ── */}
      <View style={styles.summaryWrap}>
        <Text style={styles.summaryText} numberOfLines={1}>
          {summaryText}
        </Text>
      </View>

      <FilterTabBar
        tabs={FILTER_TABS}
        active={filter}
        colors={colors}
        onSelect={handleSelectFilter}
      />

      {/* ── Artifact list — flat rows, hairline separators ── */}
      <FlashList
        data={artifacts}
        renderItem={renderItem}
        ItemSeparatorComponent={renderSeparator}
        contentContainerStyle={{ paddingBottom: insets.bottom + Space.md }}
        keyExtractor={(item) => `${item.modelId}@${item.modelVersion}`}
        onEndReached={() => { void loadMore(); }}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              size="small"
              color={colors.textMuted}
              style={styles.footerSpinner}
            />
          ) : null
        }
      />

      {/* ── Detail sheet — lineage + lifecycle transitions ── */}
      <BottomSheet
        visible={selected !== null}
        onDismiss={closeDetail}
        snapPoint={0.72}
        variant="transaction"
      >
        {selected ? (
          <ArtifactDetail
            artifact={selected}
            colors={colors}
            styles={styles}
            actionPending={actionPending}
            actionError={actionError}
            canApprove={Boolean(currentUser?.id)}
            onTransition={runTransition}
          />
        ) : null}
      </BottomSheet>
    </View>
  );
}

// ── Filter tab bar — underline style, no filled pills ────────────────────────
function FilterTabBar({
  tabs,
  active,
  colors,
  onSelect }: {
  tabs: FilterKey[];
  active: FilterKey;
  colors: ThemeColors;
  onSelect: (key: FilterKey) => void;
}) {
  const styles = useMemo(() => createTabStyles(colors), [colors]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabsContent}
      style={styles.tabsScroll}
    >
      {tabs.map((key) => (
        <AnimatedPressable
          key={key}
          style={styles.tab}
          onPress={() => onSelect(key)}
          hapticFeedback="selection"
          accessibilityRole="tab"
          accessibilityState={{ selected: active === key }}
          accessibilityLabel={
            key === 'all' ? t('modelRegistry.filter.all') : t(STATUS_LABEL_KEYS[key])
          }
        >
          <Text style={[styles.tabLabel, active !== key && styles.tabLabelInactive]}>
            {key === 'all' ? t('modelRegistry.filter.all') : t(STATUS_LABEL_KEYS[key])}
          </Text>
          {active === key ? <View style={styles.tabUnderline} /> : null}
        </AnimatedPressable>
      ))}
    </ScrollView>
  );
}

const createTabStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    tabsScroll: {
      flexGrow: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },
    tabsContent: {
      paddingHorizontal: Space.sm,
      gap: Space.xs },
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

// ── Artifact row — flat two-line row, status as trailing text ────────────────
function statusColor(status: ModelArtifactStatus, colors: ThemeColors): string {
  switch (status) {
    case 'active':
      return colors.successText;
    case 'blocked':
      return colors.dangerText;
    case 'shadow':
      return colors.warningText;
    case 'retired':
      return colors.textMuted;
    default:
      return colors.textSecondary;
  }
}

function ArtifactRow({
  artifact,
  colors,
  onPress }: {
  artifact: ModelArtifactDTO;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const styles = useMemo(() => createRowStyles(colors), [colors]);
  const meta = t('modelRegistry.row.meta', {
    task: t(TASK_LABEL_KEYS[artifact.task]),
    owner: artifact.owner,
    date: formatShortDate(artifact.createdAt),
  });
  return (
    <AnimatedPressable
      style={styles.row}
      onPress={onPress}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`${artifact.modelId} ${artifact.modelVersion}`}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {artifact.modelId}
          <Text style={styles.rowVersion}>{`  ${artifact.modelVersion}`}</Text>
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text
        style={[
          styles.rowStatus,
          { color: statusColor(artifact.status, colors) }]}
      >
        {t(STATUS_LABEL_KEYS[artifact.status])}
      </Text>
    </AnimatedPressable>
  );
}

const createRowStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: Control.hit + Space.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.smMd,
      gap: Space.smMd },
    rowText: {
      flex: 1,
      gap: Space.xxs },
    rowTitle: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.itemTitle.size,
      lineHeight: TypographyV2.itemTitle.lineHeight,
      color: colors.textPrimary },
    rowVersion: {
      fontFamily: FontFamily.regular,
      color: colors.textSecondary },
    rowMeta: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textMuted },
    rowStatus: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight } });

// ── Skeleton row — flat lines matching row layout ────────────────────────────
function SkeletonRow({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createSkeletonStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <View style={[styles.line, styles.lineShort]} />
    </View>
  );
}

const createSkeletonStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.smMd,
      minHeight: Control.hit + Space.md,
      justifyContent: 'center' },
    line: {
      height: 10,
      borderRadius: 4,
      backgroundColor: colors.surfaceAlt },
    lineShort: {
      width: '55%' } });

// ── Detail sheet — lineage fields + lifecycle actions ────────────────────────
type DetailStyles = ReturnType<typeof createStyles>;

function DetailField({
  label,
  value,
  styles }: {
  label: string;
  value: string | null | undefined;
  styles: DetailStyles;
}) {
  if (!value) return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} numberOfLines={2} selectable>
        {value}
      </Text>
    </View>
  );
}

function ArtifactDetail({
  artifact,
  colors,
  styles,
  actionPending,
  actionError,
  canApprove,
  onTransition }: {
  artifact: ModelArtifactDTO;
  colors: ThemeColors;
  styles: DetailStyles;
  actionPending: boolean;
  actionError: string | null;
  canApprove: boolean;
  onTransition: (
    target: { modelId: string; modelVersion: string },
    next: ModelArtifactStatus,
    rollbackModelVersion?: string,
  ) => void;
}) {
  const target = { modelId: artifact.modelId, modelVersion: artifact.modelVersion };

  // Transitions the registry API supports for the current status. 'active'
  // requires an approvalActor, so it is only offered when we have one.
  const actions = useMemo(() => {
    const list: Array<{ key: string; label: string; run: () => void; danger?: boolean }> = [];
    switch (artifact.status) {
      case 'candidate':
        list.push({
          key: 'shadow',
          label: t('modelRegistry.actions.shadow'),
          run: () => onTransition(target, 'shadow') });
        if (canApprove) {
          list.push({
            key: 'active',
            label: t('modelRegistry.actions.activate'),
            run: () => onTransition(target, 'active') });
        }
        list.push({
          key: 'blocked',
          label: t('modelRegistry.actions.block'),
          run: () => onTransition(target, 'blocked'),
          danger: true });
        break;
      case 'shadow':
        if (canApprove) {
          list.push({
            key: 'active',
            label: t('modelRegistry.actions.activate'),
            run: () => onTransition(target, 'active') });
        }
        list.push({
          key: 'retired',
          label: t('modelRegistry.actions.retire'),
          run: () => onTransition(target, 'retired') });
        list.push({
          key: 'blocked',
          label: t('modelRegistry.actions.block'),
          run: () => onTransition(target, 'blocked'),
          danger: true });
        break;
      case 'active':
        // Rollback = promote the recorded rollback target back to active;
        // the server retires this version in the same transaction.
        if (artifact.rollbackModelVersion && canApprove) {
          const rollbackVersion = artifact.rollbackModelVersion;
          list.push({
            key: 'rollback',
            label: t('modelRegistry.actions.rollback', { version: rollbackVersion }),
            run: () =>
              onTransition(
                { modelId: artifact.modelId, modelVersion: rollbackVersion },
                'active') });
        }
        list.push({
          key: 'retired',
          label: t('modelRegistry.actions.retire'),
          run: () => onTransition(target, 'retired') });
        list.push({
          key: 'blocked',
          label: t('modelRegistry.actions.block'),
          run: () => onTransition(target, 'blocked'),
          danger: true });
        break;
      case 'retired':
        if (canApprove) {
          list.push({
            key: 'active',
            label: t('modelRegistry.actions.activate'),
            run: () => onTransition(target, 'active') });
        }
        list.push({
          key: 'blocked',
          label: t('modelRegistry.actions.block'),
          run: () => onTransition(target, 'blocked'),
          danger: true });
        break;
      case 'blocked':
        list.push({
          key: 'candidate',
          label: t('modelRegistry.actions.reinstate'),
          run: () => onTransition(target, 'candidate') });
        break;
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact, canApprove, onTransition]);

  return (
    <View style={styles.sheetBody}>
      <Text style={styles.sheetTitle} numberOfLines={1}>
        {`${artifact.modelId} · ${artifact.modelVersion}`}
      </Text>
      <Text style={styles.sheetSub} numberOfLines={1}>
        {`${t(TASK_LABEL_KEYS[artifact.task])} · ${t(CRITICALITY_LABEL_KEYS[artifact.criticality])} · ${t(STATUS_LABEL_KEYS[artifact.status])}`}
      </Text>

      <DetailField label={t('modelRegistry.detail.owner')} value={artifact.owner} styles={styles} />
      <DetailField label={t('modelRegistry.detail.runtime')} value={artifact.frameworkRuntime} styles={styles} />
      <DetailField label={t('modelRegistry.detail.created')} value={formatShortDate(artifact.createdAt)} styles={styles} />
      <DetailField label={t('modelRegistry.detail.approvedBy')} value={artifact.approvalActor} styles={styles} />
      <DetailField label={t('modelRegistry.detail.approvedAt')} value={artifact.approvedAt ? formatShortDate(artifact.approvedAt) : null} styles={styles} />
      <DetailField label={t('modelRegistry.detail.rollbackTarget')} value={artifact.rollbackModelVersion} styles={styles} />
      <DetailField label={t('modelRegistry.detail.artifactUri')} value={artifact.artifactUri} styles={styles} />
      <DetailField label={t('modelRegistry.detail.sha256')} value={artifact.artifactSha256} styles={styles} />
      <DetailField label={t('modelRegistry.detail.containerDigest')} value={artifact.containerDigest} styles={styles} />
      <DetailField label={t('modelRegistry.detail.codeCommit')} value={artifact.trainingCodeCommit} styles={styles} />
      <DetailField label={t('modelRegistry.detail.datasetManifest')} value={artifact.trainingDatasetManifest} styles={styles} />
      <DetailField label={t('modelRegistry.detail.featureSchema')} value={artifact.featureSchemaVersion} styles={styles} />
      <DetailField label={t('modelRegistry.detail.preprocessing')} value={artifact.preprocessingVersion} styles={styles} />
      <DetailField label={t('modelRegistry.detail.evalReport')} value={artifact.evaluationReportUri} styles={styles} />
      <DetailField label={t('modelRegistry.detail.modelCard')} value={artifact.modelCardUri} styles={styles} />

      {actions.length > 0 ? (
        <>
          <Text style={styles.actionsTitle}>{t('modelRegistry.actions.title')}</Text>
          {actions.map((action) => (
            <AnimatedPressable
              key={action.key}
              style={styles.actionRow}
              onPress={action.run}
              disabled={actionPending}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityState={{ disabled: actionPending }}
            >
              <Text
                style={[
                  styles.actionLabel,
                  action.danger && { color: colors.dangerText }]}
              >
                {action.label}
              </Text>
              {actionPending ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Ionicons name="chevron-forward" size={Control.iconCompact} color={colors.textMuted} />
              )}
            </AnimatedPressable>
          ))}
        </>
      ) : null}

      {actionError ? (
        <Text style={styles.actionErrorText} accessibilityRole="alert">
          {actionError}
        </Text>
      ) : null}
    </View>
  );
}

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
      accessibilityLabel={t('modelRegistry.a11y.back')}
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
      minHeight: Control.hit,
      gap: Space.xxs },
    topBarTitle: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.screenTitle.size,
      lineHeight: TypographyV2.screenTitle.lineHeight,
      letterSpacing: TypographyV2.screenTitle.letterSpacing,
      color: colors.textPrimary },
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
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: Space.md },
    footerSpinner: {
      marginVertical: Space.md },
    sheetBody: {
      paddingHorizontal: Space.md,
      paddingTop: Space.xs,
      paddingBottom: Space.md },
    sheetTitle: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.itemTitle.size,
      lineHeight: TypographyV2.itemTitle.lineHeight,
      color: colors.textPrimary,
      marginBottom: Space.xxs },
    sheetSub: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textSecondary,
      marginBottom: Space.sm },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.smMd,
      paddingVertical: Space.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle },
    fieldLabel: {
      width: 112,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textMuted },
    fieldValue: {
      flex: 1,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textPrimary },
    actionsTitle: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.label.size,
      lineHeight: TypographyV2.label.lineHeight,
      letterSpacing: TypographyV2.label.letterSpacing,
      color: colors.textSecondary,
      marginTop: Space.md,
      marginBottom: Space.xxs },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: Control.hit,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle },
    actionLabel: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textPrimary },
    actionErrorText: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.dangerText,
      marginTop: Space.sm } });
