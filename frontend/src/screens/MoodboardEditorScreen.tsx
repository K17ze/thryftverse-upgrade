/**
 * MoodboardEditorScreen — creative composition surface
 *
 * The editor is the authoring surface for a ThryftVerse Moodboard: a themed
 * canvas where users arrange marketplace listings into an editorial collage.
 *
 * Layout:
 *  - Canvas (top ~70% of screen) — themed background with pan/pinch/rotate items
 *  - Bottom panel (~30%) — item picker rail; tap to add to canvas center
 *  - Selected item shows delete + layer-order controls
 *
 * Truthful UI (AGENTS.md §11):
 *  Every operation flows through the real moodboards API — there is no
 *  in-memory demo path. Sync state is reported honestly via the per-operation
 *  status machine (syncing / synced / conflict / error); an unknown outcome
 *  is never presented as success.
 *
 * Structure:
 *  This file is the orchestrator only. Canvas items, picker tiles, theme
 *  chips, selection controls, and the sync overlay live in
 *  `components/moodboard/`; board state, selection, and mutations live in
 *  the colocated hooks (`useMoodboardBoard`, `useMoodboardSelection`,
 *  `useMoodboardMutations`).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Pressable,
  LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Control, PressScale } from '../theme/designTokens';
import { useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps, RootStackParamList, NativeStackNavigationProp } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { HorizontalRail } from '../components/HorizontalRail';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState } from '../components/flagship';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { OfflineBanner } from '../components/OfflineBanner';
import { MoodboardCollaboratorSheet } from '../components/MoodboardCollaboratorSheet';
import { MoodboardCommentsSheet } from '../components/MoodboardCommentsSheet';
import { MoodboardVersionHistorySheet } from '../components/MoodboardVersionHistorySheet';
import { MoodboardConflictCompareSheet } from '../components/MoodboardConflictCompareSheet';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  CanvasItem,
  ThemeChip,
  SelectionControls,
  MultiSelectBadge,
  MoodboardSyncOverlay,
  MoodboardSourcePicker,
  useMoodboardBoard,
  useMoodboardSelection,
  useMoodboardMutations,
  useMoodboardImport,
  PICKER_TILE_SIZE,
  PICKER_TILE_GAP } from '../components/moodboard';
import { addItemToMoodboard, type Moodboard } from '../services/moodboardApi';

type Props = NativeStackScreenProps<RootStackParamList, 'MoodboardEditor'>;

// ── Layout constants ──
const CANVAS_HEIGHT_RATIO = 0.7;

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
// Props are optional: CreatorStudioShell embeds this screen directly
// (no route/navigation injection), so fall back to the navigator context.
export default function MoodboardEditorScreen({ route, navigation }: Partial<Props>) {
  const contextNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const nav = navigation ?? contextNavigation;
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const CANVAS_HEIGHT = Math.round(SCREEN_H * CANVAS_HEIGHT_RATIO);
  const styles = useStyles();

  const moodboardId = route?.params?.moodboardId;

  // ── Board state, selection, and mutations (extracted feature hooks) ──
  const board = useMoodboardBoard({ moodboardId });
  const selection = useMoodboardSelection();
  const mutations = useMoodboardMutations({ board, selection });
  // Media-import job tray (Photos tab) — reconciles the board after each
  // uploaded item lands; offline jobs queue and auto-resume.
  const importController = useMoodboardImport({
    moodboardId: board.moodboard?.id ?? '',
    onItemAdded: board.reconcileBoard,
  });

  const {
    moodboard,
    themes,
    pickerItems,
    loading,
    error,
    saving,
    syncStatus,
    conflictDetail,
    activeThemeId,
    activeTheme,
    collaboratorsOnline,
    isOwner,
    loadAll,
    setSyncStatus,
    setConflictDetail } = board;
  const {
    selectedItemId,
    multiSelectMode,
    selectedItemIds,
    handleSelect,
    handleLongPress,
    handleCancelMultiSelect,
    handleCanvasBackgroundPress } = selection;
  const {
    publishing,
    handlePositionCommit,
    handleAddItem,
    handleDeleteItem,
    handleReorder,
    handleDeleteSelected,
    handleBringAllToFront,
    handleThemeChange,
    handlePublishAsPoster } = mutations;

  const [canvasWidth, setCanvasWidth] = useState(SCREEN_W);
  const [canvasHeight, setCanvasHeight] = useState(CANVAS_HEIGHT);

  // ── Collaboration sheet state ──
  const [collaboratorSheetVisible, setCollaboratorSheetVisible] = useState(false);
  const [commentsSheetVisible, setCommentsSheetVisible] = useState(false);
  const [commentsItemId, setCommentsItemId] = useState<string | undefined>(undefined);
  const [versionHistoryVisible, setVersionHistoryVisible] = useState(false);
  const [conflictCompareVisible, setConflictCompareVisible] = useState(false);
  const [localConflictSnapshot, setLocalConflictSnapshot] = useState<Moodboard | null>(null);

  // ── Handlers ──
  const handleGoBack = useCallback(() => {
    if (nav.canGoBack()) {
      nav.goBack();
    } else {
      nav.navigate('MoodboardHome');
    }
  }, [nav]);

  const handleCanvasLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setCanvasWidth(width);
      setCanvasHeight(height);
    }
  }, []);

  // Add a published look to the canvas. Errors propagate so the picker can
  // surface an honest failure; the board refresh is the picker's
  // onItemAdded callback (reconcileBoard).
  const handleAddLook = useCallback(
    async (lookId: string) => {
      if (!moodboard) return;
      await addItemToMoodboard(moodboard.id, { source: 'look', lookId });
    },
    [moodboard],
  );

  // ── Derived ──
  const selectedItem = useMemo(
    () => moodboard?.items.find((it) => it.id === selectedItemId) ?? null,
    [moodboard, selectedItemId],
  );

  const canvasA11yLabel = useMemo(() => {
    if (!moodboard || moodboard.items.length === 0) {
      return 'Moodboard canvas, empty. Add items from the picker below.';
    }
    const count = moodboard.items.length;
    if (selectedItem) {
      return `Moodboard canvas with ${count} item${count === 1 ? '' : 's'}. Selected: ${selectedItem.title}.`;
    }
    return `Moodboard canvas with ${count} item${count === 1 ? '' : 's'}. Tap an item to select it.`;
  }, [moodboard, selectedItem]);

  // ── Header actions — transparent 44pt icon targets (AGENTS.md §4) ──
  const headerActions = (
    <View style={styles.headerActions}>
      {collaboratorsOnline && (
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
        </View>
      )}
      <AnimatedPressable
        style={styles.headerActionButton}
        onPress={() => {
          haptic.selection();
          setCommentsItemId(undefined);
          setCommentsSheetVisible(true);
        }}
        activeOpacity={0.7}
        scaleValue={PressScale.icon}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel="Comments"
        accessibilityHint="View and add comments on this moodboard"
      >
        <AppIcon name="chatbubble-outline" size={IconSize.md} color="textPrimary" accessible={false} />
      </AnimatedPressable>
      <AnimatedPressable
        style={styles.headerActionButton}
        onPress={() => {
          haptic.selection();
          setVersionHistoryVisible(true);
        }}
        activeOpacity={0.7}
        scaleValue={PressScale.icon}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel="Version history"
        accessibilityHint="View saved versions and restore"
      >
        <AppIcon name="time-outline" size={IconSize.md} color="textPrimary" accessible={false} />
      </AnimatedPressable>
      <AnimatedPressable
        style={styles.headerActionButton}
        onPress={() => {
          haptic.selection();
          setCollaboratorSheetVisible(true);
        }}
        activeOpacity={0.7}
        scaleValue={PressScale.icon}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel="Collaborators"
        accessibilityHint="Invite collaborators and manage roles"
      >
        <AppIcon name="people-outline" size={IconSize.md} color="textPrimary" accessible={false} />
      </AnimatedPressable>
      <AnimatedPressable
        style={styles.headerActionButton}
        onPress={handlePublishAsPoster}
        activeOpacity={0.7}
        scaleValue={PressScale.icon}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel="Publish as poster"
        accessibilityHint="Publishes this moodboard as a poster to your feed"
        disabled={publishing}
      >
        <AppIcon
          name="share-outline"
          size={IconSize.md}
          color={publishing ? 'textMuted' : 'textPrimary'}
          accessible={false}
        />
      </AnimatedPressable>
    </View>
  );

  // ── Loading state — skeleton mirrors final canvas + picker geometry ──
  if (loading) {
    return (
      <FlagshipScreen
        testID="moodboard-editor-screen"
        scrollEnabled={false}
        contentStyle={styles.screenContent}
        header={
          <FlagshipHeader title="Moodboard" onBack={handleGoBack} />
        }
      >
        <View style={styles.canvasSkeleton}>
          <PremiumSkeletonTile width="100%" height="100%" borderRadius={Radius.lg} />
        </View>
        <View style={styles.pickerSkeletonRail}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={[styles.pickerTile, { width: PICKER_TILE_SIZE }]}>
              <PremiumSkeletonTile width={PICKER_TILE_SIZE} height={PICKER_TILE_SIZE} borderRadius={Radius.md} />
              <PremiumSkeletonTile width="80%" height={10} borderRadius={Radius.sm} />
              <PremiumSkeletonTile width={40} height={9} borderRadius={Radius.sm} />
            </View>
          ))}
        </View>
      </FlagshipScreen>
    );
  }

  // ── Error state ──
  if (error && !moodboard) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        contentStyle={styles.screenContent}
        header={
          <FlagshipHeader title="Moodboard" onBack={handleGoBack} />
        }
      >
        <View style={styles.stateContainer}>
          <FlagshipState
            variant="error"
            icon="cloud-offline-outline"
            title="Editor unavailable"
            subtitle={error}
            actionLabel="Retry"
            onAction={() => void loadAll()}
          />
        </View>
      </FlagshipScreen>
    );
  }

  return (
    <GestureHandlerRootView style={styles.rootContainer}>
      <FlagshipScreen
        testID="moodboard-editor-screen"
        scrollEnabled={false}
        contentStyle={styles.screenContent}
        header={
          <FlagshipHeader
            title={moodboard?.title ?? 'Moodboard'}
            onBack={handleGoBack}
            rightAction={headerActions}
          />
        }
      >
      {/* Offline banner */}
      {isOffline && (
        <OfflineBanner message="Offline — changes are not saved. Reconnect to persist your work." />
      )}

      {/* ── Canvas (top ~70%) ── */}
      <Pressable
        style={[styles.canvas, { backgroundColor: activeTheme.backgroundColor }]}
        onLayout={handleCanvasLayout}
        onPress={handleCanvasBackgroundPress}
        accessibilityLabel={canvasA11yLabel}
        accessibilityRole="image"
      >
        {/* Empty canvas prompt */}
        {moodboard && moodboard.items.length === 0 && (
          <View style={styles.canvasEmpty} pointerEvents="box-none">
            <FlagshipState
              variant="empty"
              icon="create-outline"
              title="Start your moodboard"
              subtitle="Tap a listing below to begin."
              actionLabel={pickerItems.length > 0 ? 'Add items' : undefined}
              onAction={pickerItems.length > 0 ? () => void handleAddItem(pickerItems[0]) : undefined}
            />
          </View>
        )}

        {/* Canvas items — rendered in layer order (array order = back→front) */}
        {moodboard?.items.map((item) => (
          <CanvasItem
            key={item.id}
            item={item}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            isSelected={multiSelectMode ? selectedItemIds.has(item.id) : selectedItemId === item.id}
            multiSelectMode={multiSelectMode}
            reducedMotion={reducedMotion}
            onSelect={handleSelect}
            onPositionCommit={handlePositionCommit}
            onLongPress={handleLongPress}
          />
        ))}

        {/* Multi-select badge — count + cancel, overlaid at the top of the canvas */}
        {multiSelectMode && (
          <MultiSelectBadge count={selectedItemIds.size} onCancel={handleCancelMultiSelect} />
        )}

        {/* Selection controls — overlaid on canvas, above items.
            In multi-select mode, batch controls replace the single-item controls. */}
        <SelectionControls
          multiSelectMode={multiSelectMode}
          selectedCount={selectedItemIds.size}
          selectedItem={selectedItem}
          onBringAllToFront={handleBringAllToFront}
          onDeleteSelected={handleDeleteSelected}
          onReorder={handleReorder}
          onComment={(itemId) => {
            setCommentsItemId(itemId);
            setCommentsSheetVisible(true);
          }}
          onDeleteItem={handleDeleteItem}
        />

        {/* Sync status indicator — honest per-operation status.
            Replaces the global "Saving…" pill. Shows syncing, synced,
            conflict, or error states for position/theme operations.
            The saving boolean still drives the pill for add/delete/reorder
            (heavier operations that re-fetch the full board). */}
        <MoodboardSyncOverlay
          saving={saving}
          syncStatus={syncStatus}
          conflictDetail={conflictDetail}
          onRetrySync={() => void board.retrySync()}
          onCompareConflict={() => {
            setLocalConflictSnapshot(moodboard);
            setConflictCompareVisible(true);
          }}
          onDismissConflict={() => {
            setSyncStatus('idle');
            setConflictDetail(null);
          }}
        />
      </Pressable>

      {/* ── Bottom panel (~30%) — picker + themes ── */}
      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom || Space.sm }]}>
        {/* Theme selector rail */}
        {themes.length > 0 && (
          <View style={styles.themeRailWrap}>
            <HorizontalRail
              contentContainerStyle={styles.themeRailContent}
              showsHorizontalScrollIndicator={false}
              accessibilityLabel="Canvas theme selector"
            >
              {themes.map((theme) => (
                <ThemeChip
                  key={theme.id}
                  theme={theme}
                  selected={theme.id === activeThemeId}
                  onPress={() => handleThemeChange(theme.id)}
                />
              ))}
            </HorizontalRail>
          </View>
        )}

        {/* Source picker — Listings / Looks / Photos tabs + import tray */}
        {moodboard && (
          <MoodboardSourcePicker
            moodboardId={moodboard.id}
            pickerItems={pickerItems}
            onAddListing={handleAddItem}
            onAddLook={handleAddLook}
            importHook={importController}
            onItemAdded={board.reconcileBoard}
          />
        )}
      </View>

      {/* ── Collaboration sheets ── */}
      {moodboard && (
        <>
          <MoodboardCollaboratorSheet
            visible={collaboratorSheetVisible}
            onDismiss={() => setCollaboratorSheetVisible(false)}
            moodboardId={moodboard.id}
            isOwner={isOwner}
          />
          <MoodboardCommentsSheet
            visible={commentsSheetVisible}
            onDismiss={() => setCommentsSheetVisible(false)}
            moodboardId={moodboard.id}
            itemId={commentsItemId}
          />
          <MoodboardVersionHistorySheet
            visible={versionHistoryVisible}
            onDismiss={() => setVersionHistoryVisible(false)}
            moodboardId={moodboard.id}
            isOwner={isOwner}
            onRestored={() => void loadAll()}
          />
          <MoodboardConflictCompareSheet
            visible={conflictCompareVisible}
            onDismiss={() => setConflictCompareVisible(false)}
            localVersion={board.conflictLocalSnapshot ?? localConflictSnapshot}
            serverVersion={moodboard}
            onKeepLocal={() => {
              setConflictCompareVisible(false);
              // Honest "keep mine": the snapshot is re-applied to the server
              // via ops (outbox + drain), not just dismissed.
              void mutations.handleKeepLocalVersion(
                board.conflictLocalSnapshot ?? localConflictSnapshot,
              );
            }}
            onKeepServer={() => {
              setConflictCompareVisible(false);
              // Discards queued local ops for this board, then re-fetches.
              void mutations.handleKeepServerVersion();
            }}
          />
        </>
      )}
      </FlagshipScreen>
    </GestureHandlerRootView>
  );
}

// ---------------------------------------------------------------------------
// Themed styles (depend on useAppTheme colors)
// ---------------------------------------------------------------------------
function useStyles() {
  const { colors } = useAppTheme();
  return React.useMemo(
    () =>
      StyleSheet.create({
        rootContainer: {
          flex: 1 },
        screenContent: {
          paddingHorizontal: 0,
          paddingTop: 0 },
        stateContainer: {
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: Space.lg },
        canvas: {
          flex: 1,
          marginHorizontal: Space.md,
          borderRadius: Radius.lg,
          overflow: 'hidden',
          position: 'relative' },
        bottomPanel: {
          paddingTop: Space.md,
          gap: Space.xs,
          backgroundColor: colors.background },
        themeRailWrap: {
          marginBottom: Space.xs },
        themeRailContent: {
          paddingHorizontal: Space.md,
          gap: Space.sm },
        canvasSkeleton: {
          flex: 1,
          marginHorizontal: Space.md,
          borderRadius: Radius.lg,
          overflow: 'hidden',
          backgroundColor: colors.surfaceAlt },
        headerActions: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs },
        headerActionButton: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center' },
        liveIndicator: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center' },
        liveDot: {
          width: Space.sm,
          height: Space.sm,
          borderRadius: Radius.sm,
          backgroundColor: colors.success },
        pickerSkeletonRail: {
          flexDirection: 'row',
          gap: PICKER_TILE_GAP,
          paddingHorizontal: Space.md,
          paddingVertical: Space.md },
        pickerTile: {
          alignItems: 'flex-start',
          gap: Space.xs / 2 },
        canvasEmpty: {
          ...StyleSheet.absoluteFill,
          alignItems: 'center',
          justifyContent: 'center',
          gap: Space.sm } }),
    [colors],
  );
}
