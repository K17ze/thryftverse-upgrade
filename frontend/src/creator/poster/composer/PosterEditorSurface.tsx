/**
 * PosterEditorSurface — the editor JSX tree for the Poster composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Renders the full editor content: crash recovery banner,
 * canvas stage, performance overlay, top bar, frame segments, timeline
 * dock, tool rail dock, frame tray, overflow surface, and the sheet
 * stack. All state/handlers arrive pre-built via the composer hooks.
 */
import React from 'react';
import { View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { RouteProp } from '@react-navigation/native';
import type { PanGesture } from 'react-native-gesture-handler';
import type { useAnimatedStyle } from 'react-native-reanimated';

import type { ThemeColors } from '../../../theme/ThemeContext';
import type { RootStackParamList } from '../../../navigation/types';
import type { CreatorPage } from '../../core/projectStore/composition';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { useHaptic } from '../../../hooks/useHaptic';
import { FrameTray } from '../../studio/FrameTray';
import { BOTTOM_CHROME_HEIGHT } from '../../shared/safeZone';
import { PerformanceOverlay } from '../../core/performance/PerformanceOverlay';
import { createStyles } from '../PosterComposerStyles';
import { PosterTopBar } from '../PosterTopBar';
import { PosterSheetStack } from '../PosterSheetStack';
import type { usePosterEffects } from '../usePosterEffects';
import type { UsePosterEntryTransitionResult } from '../usePosterEntryTransition';
import type { UsePosterTopBarActionsResult } from '../usePosterTopBarActions';
import type { UsePosterPlaybackResult } from '../usePosterPlayback';
import type { UsePosterTimelineResult } from '../usePosterTimeline';
import { PosterRecoveryBanner } from './PosterRecoveryBanner';
import { PosterCanvasStage } from './PosterCanvasStage';
import { PosterPageSegments } from './PosterPageSegments';
import { PosterTimelineDock, PosterTimelineEmptyDock } from './PosterTimelineDock';
import { PosterToolRailDock } from './PosterToolRailDock';
import { PosterOverflowSurface } from './PosterOverflowSurface';
import type { PosterComposerUiState } from './usePosterComposerUiState';
import type { PosterLayerEditFlow } from './usePosterLayerEditFlow';
import type { PosterCropCutout } from './usePosterCropCutout';
import type { PosterMultiSelectOps } from './usePosterMultiSelectOps';
import type { PosterCanvasInteraction } from './usePosterCanvasInteraction';
import type { PosterMediaDerived } from './usePosterMediaDerived';
import type { PosterTimelineZoom } from './usePosterTimelineZoom';
import type { PosterToolActions } from './usePosterToolActions';
import type { PosterLayerSheetOps } from './usePosterLayerSheetOps';
import type { PosterToolRail } from './usePosterToolRail';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

export interface PosterEditorSurfaceProps {
  /** Screen styles (the parent's full createStyles() object). */
  styles: ReturnType<typeof createStyles>;
  /** Theme colors. */
  colors: ThemeColors;
  /** Safe-area insets. */
  insets: EdgeInsets;
  /** The active navigation route (canvas stage reads route.params). */
  route: RouteProp<RootStackParamList, 'CreatorStudio'>;
  /** Viewport dimensions. */
  screenWidth: number;
  screenHeight: number;
  /** Authored canvas geometry. */
  canvasWidth: number;
  canvasHeight: number;
  canvasVerticalOffset: number;
  /** Haptic engine. */
  haptic: Haptic;
  /** The CreatorContext value (document + mutations + selection). */
  creator: CreatorContextValue;
  /** The active page being edited. */
  page: CreatorPage;
  /** Total number of pages in the document. */
  pageCount: number;
  /** Whether the document has more than one page. */
  hasMultipleFrames: boolean;
  /** Canonical page-change handler (from usePosterFrameNavigation). */
  goToPage: (index: number) => void;
  /** Frame-swipe pan gesture (canvas stage). */
  frameSwipeGesture: PanGesture;
  /** Chrome fade animated style (top bar + tool rail recede). */
  chromeFadeStyle: ReturnType<typeof useAnimatedStyle>;
  /** Composer hook groups. */
  ui: PosterComposerUiState;
  topBar: UsePosterTopBarActionsResult;
  multi: PosterMultiSelectOps;
  canvas: PosterCanvasInteraction;
  crop: PosterCropCutout;
  edit: PosterLayerEditFlow;
  media: PosterMediaDerived;
  entry: UsePosterEntryTransitionResult;
  playback: UsePosterPlaybackResult;
  timeline: UsePosterTimelineResult;
  zoom: PosterTimelineZoom;
  effects: ReturnType<typeof usePosterEffects>;
  toolActions: PosterToolActions;
  sheetOps: PosterLayerSheetOps;
  toolRail: PosterToolRail;
}

// ── Component ────────────────────────────────────────────────────────

export function PosterEditorSurface({
  styles,
  colors,
  insets,
  route,
  screenWidth,
  screenHeight,
  canvasWidth,
  canvasHeight,
  canvasVerticalOffset,
  haptic,
  creator,
  page,
  pageCount,
  hasMultipleFrames,
  goToPage,
  frameSwipeGesture,
  chromeFadeStyle,
  ui,
  topBar,
  multi,
  canvas,
  crop,
  edit,
  media,
  entry,
  playback,
  timeline,
  zoom,
  effects,
  toolActions,
  sheetOps,
  toolRail,
}: PosterEditorSurfaceProps) {
  const {
    document,
    activePageIndex,
    setActivePageIndex,
    selectedLayerId,
    selectedLayerIds,
    selectLayer,
    selectLayers,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    isDirty,
    removeLayer,
    reorderLayer,
    updateLayer,
    updatePageDuration,
    duplicatePage,
    removePage,
    reorderPages,
    commitLayerTransform,
    isLoadingDraft,
    draftError,
    retryDraftLoad,
    setDocument,
    hasPendingRecovery,
    recoverCrashedProject,
    dismissRecovery,
  } = creator;

  const { selectedLayer } = canvas;

  return (
    <View style={styles.container}>
      {/* ── Crash recovery banner ── */}
      {hasPendingRecovery && (
        <PosterRecoveryBanner
          styles={styles}
          colors={colors}
          recoverCrashedProject={recoverCrashedProject}
          dismissRecovery={dismissRecovery}
        />
      )}
      {/* ── Full-screen frame canvas ── */}
      {/* One current frame fills the viewport. Horizontal swipe navigates
          between frames. Chrome floats over it with gradient/blur. */}
      <PosterCanvasStage
        frameSwipeGesture={frameSwipeGesture}
        styles={styles}
        colors={colors}
        insets={insets}
        document={document}
        page={page}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        canvasVerticalOffset={canvasVerticalOffset}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        selectedLayerId={selectedLayerId}
        selectedLayerIds={selectedLayerIds}
        selectedLayer={selectedLayer}
        multiSelectMode={ui.multiSelectMode}
        haptic={haptic}
        handleLayerPress={canvas.handleLayerPress}
        handleCanvasPress={canvas.handleCanvasPress}
        commitLayerTransform={commitLayerTransform}
        handleOverlapCycle={multi.handleOverlapCycle}
        setEditingTextLayerId={ui.setEditingTextLayerId}
        setMultiSelectMode={ui.setMultiSelectMode}
        selectLayers={selectLayers}
        handleMultiDragStart={multi.handleMultiDragStart}
        handleMultiDragCommit={multi.handleMultiDragCommit}
        removeLayer={removeLayer}
        playbackClock={playback.playbackClock}
        playbackState={playback.playbackState}
        canvasActiveClip={zoom.canvasActiveClip}
        videoPlayerRef={ui.videoPlayerRef}
        manipulationActiveSV={ui.manipulationActiveSV}
        setIsManipulating={ui.setIsManipulating}
        isInTrashZoneSV={ui.isInTrashZoneSV}
        compareOriginal={ui.compareOriginal}
        setCompareOriginal={ui.setCompareOriginal}
        floatingMenuVisible={canvas.floatingMenuVisible}
        isManipulating={ui.isManipulating}
        floatingMenuActions={canvas.floatingMenuActions}
        floatingMenuPos={canvas.floatingMenuPos}
        filterHudName={effects.filterHudName}
        filterHudAnimatedStyle={effects.filterHudAnimatedStyle}
        editingTextLayerId={ui.editingTextLayerId}
        updateLayer={updateLayer}
        isLoadingDraft={isLoadingDraft}
        hasContent={media.hasContent}
        draftError={draftError}
        entryComplete={entry.entryComplete}
        route={route}
        retryDraftLoad={retryDraftLoad}
        showSafeZone={ui.showSafeZone}
      />

      {/* ── Performance overlay (dev-only) ── */}
      {/* Renders a semi-transparent FPS / frame-time / jank panel at the
          top-right corner. The overlay is gated on __DEV__ both here and
          inside PerformanceOverlay itself, so it never appears in
          production. pointerEvents="box-none" ensures it does not
          intercept canvas gestures except on its own toggle button. */}
      {__DEV__ && <PerformanceOverlay />}

      {/* ── Top bar ── */}
      {/* Wrapped in Reanimated.View with chromeFadeStyle so the top bar
          recedes (fades to 0.15 opacity) during active layer manipulation,
          making the canvas feel infinite (Snapchat/Instagram pattern). */}
      <PosterTopBar
        styles={styles}
        colors={colors}
        topInset={insets.top}
        chromeFadeStyle={chromeFadeStyle}
        isManipulating={ui.isManipulating}
        hasSelection={!!selectedLayer}
        haptic={haptic}
        selectLayer={selectLayer}
        openSheet={ui.openSheet}
        handleBack={topBar.handleBack}
        isDirty={isDirty}
        hasAudioContent={media.hasAudioContent}
        hasVideoContent={media.hasVideoContent}
        handleToggleAudioMute={topBar.handleToggleAudioMute}
        isAudioMuted={topBar.isAudioMuted}
        handleQuickSaveDraft={topBar.handleQuickSaveDraft}
        isQuickSaving={topBar.isQuickSaving}
        isAutosaving={ui.isAutosaving}
        lastAutosaveAt={ui.lastAutosaveAt}
        handleUndo={topBar.handleUndo}
        canUndo={canUndo}
        undoLabel={undoLabel}
        handleRedo={topBar.handleRedo}
        canRedo={canRedo}
        redoLabel={redoLabel}
        multiSelectCount={ui.multiSelectMode ? selectedLayerIds.length : undefined}
        onExitMultiSelect={multi.exitMultiSelect}
        onSelectAll={() => {
          const visible = (page?.layers ?? []).filter((l) => !l.hidden);
          selectLayers(visible.map((l) => l.id));
        }}
      />

      {/* ── Frame progress segments (quieter in editor) ── */}
      {/* Instagram-style progress segments at the very top, but quieter
          in the editor: thinner tracks, lower contrast. Only shown when
          there are multiple frames. Tapping a segment switches frames;
          long-press opens frame options. The frame-tray toggle and add-
          frame control sit at the end of the row. */}
      {hasMultipleFrames && !selectedLayer && (
        <PosterPageSegments
          styles={styles}
          colors={colors}
          topInset={insets.top}
          pages={document.pages}
          activePageIndex={activePageIndex}
          goToPage={goToPage}
          haptic={haptic}
          setPageMenuIndex={ui.setPageMenuIndex}
          pageCount={pageCount}
          handleAddFrame={toolActions.handleAddFrame}
        />
      )}

      {/* ── Poster timeline (conditional — spec: no permanent timeline for single photo) ── */}
      {/* The timeline expands for video, multiple clips, or explicit user
          request. For a single-photo poster the timeline is hidden by
          default so the canvas remains dominant. When another bottom
          surface (effects) is active, the timeline is suppressed. */}
      {zoom.shouldShowTimeline && timeline.timelineClips.length > 0 && (
        <PosterTimelineDock
          styles={styles}
          colors={colors}
          bottomInset={insets.bottom}
          screenWidth={screenWidth}
          playbackState={playback.playbackState}
          handleTimelineOperation={timeline.handleTimelineOperation}
          handleUndo={topBar.handleUndo}
          canUndo={canUndo}
          undoLabel={undoLabel}
          handleRedo={topBar.handleRedo}
          canRedo={canRedo}
          redoLabel={redoLabel}
          handleTimelineDone={toolActions.handleTimelineDone}
          timelinePinchGesture={zoom.timelinePinchGesture}
          timelineScrollRef={zoom.timelineScrollRef}
          timelineZoomScale={zoom.timelineZoomScale}
          timelineScrollHandler={zoom.timelineScrollHandler}
          scaledTrackWidth={zoom.scaledTrackWidth}
          timelineContentAnimStyle={zoom.timelineContentAnimStyle}
          zoomIndicatorAnimStyle={zoom.zoomIndicatorAnimStyle}
          timelineTotalDurationMs={timeline.timelineTotalDurationMs}
          timelineScrubMsSV={zoom.timelineScrubMsSV}
          timelineScrollXSV={zoom.timelineScrollXSV}
          timelineClips={timeline.timelineClips}
          clipPageIndices={timeline.clipPageIndices}
          clipTransitionIds={timeline.clipTransitionIds}
          timelineOverlays={timeline.timelineOverlays}
          selectedClip={timeline.selectedClip}
          selectedClipId={ui.selectedClipId}
          selectedOverlayId={ui.selectedOverlayId}
          setSelectedClipId={ui.setSelectedClipId}
          setSelectedOverlayId={ui.setSelectedOverlayId}
          activePageIndex={activePageIndex}
          setActivePageIndex={setActivePageIndex}
          handleTimelineTransitionTap={timeline.handleTimelineTransitionTap}
          hasAudioContent={media.hasAudioContent}
          audioUri={media.audioUri}
          haptic={haptic}
          openSheet={ui.openSheet}
          toggleClipLock={timeline.toggleClipLock}
        />
      )}

      {ui.bottomSurface === 'timeline' && timeline.timelineClips.length === 0 && media.hasContent && (
        <PosterTimelineEmptyDock
          styles={styles}
          colors={colors}
          bottomInset={insets.bottom}
          haptic={haptic}
          setPickerMode={edit.setPickerMode}
        />
      )}

      {/* ── Bottom tool rail — ContextToolRail (context-sensitive) ── */}
      {/* The ContextToolRail is the single bottom surface for both default
          and selection states. It adapts its visible tool set based on the
          active ToolContext (editor mode + selection state). Up to 4
          primary actions are always visible; additional tools (including
          Edit Clip for video, z-order, duplicate, delete, opacity) are
          revealed under the trailing "More" button. The legacy context
          toolbar was removed — it duplicated tools already in the rail
          and competed with the canvas per the surface budget constraint. */}
      {/* Replaces the static tool dock. The rail adapts its visible tool set
          based on the active ToolContext (editor mode + selection state).
          Up to 4 primary actions are always visible; additional tools are
          revealed under the trailing "More" button.
          Frame count indicator sits at the start when multiple frames. */}
      {/* ── Bottom tool rail — only when bottomSurface === 'tools' ── */}
      {/* The tool rail is the default bottom surface. When the timeline or
          effects sheet is active, the tool rail is unmounted — one bottom
          surface at a time per the spec. The timeline has its own Done
          button to return here; the effects sheet has its own Done button. */}
      {ui.bottomSurface === 'tools' && (
        <PosterToolRailDock
          styles={styles}
          colors={colors}
          bottomInset={insets.bottom}
          chromeFadeStyle={chromeFadeStyle}
          isManipulating={ui.isManipulating}
          hasMultipleFrames={hasMultipleFrames}
          selectedLayer={selectedLayer}
          activePageIndex={activePageIndex}
          pageCount={pageCount}
          activeToolContext={toolRail.activeToolContext}
          toolGroups={toolRail.toolGroups}
          openSheet={ui.openSheet}
          haptic={haptic}
        />
      )}

      {/* ── Frame organizer (transient) ── */}
      {/* Per Design.md: the frame organizer is a transient surface for
          reorder/duplicate/delete. It opens from the overflow menu or
          long-press on page dots, not as a persistent navigation aid.
          Page dots at the top are the persistent position indicator. */}
      {hasMultipleFrames && ui.showFrameTray && (
        <FrameTray
          pages={document.pages}
          activePageIndex={activePageIndex}
          onSelectPage={(i) => { selectLayer(null); setActivePageIndex(i); }}
          onLongPressPage={(i) => ui.setPageMenuIndex(i)}
          onAddPage={toolActions.handleAddFrame}
          onCollapse={() => { ui.setShowFrameTray(false); ui.setVideoInfoFrameIndex(null); }}
          onReorderPage={reorderPages}
          bottomOffset={insets.bottom + BOTTOM_CHROME_HEIGHT}
          onVideoBadgePress={(i) => {
            ui.setVideoInfoFrameIndex((prev) => (prev === i ? null : i));
          }}
          videoInfoFrameIndex={ui.videoInfoFrameIndex}
        />
      )}

      {/* ── Overflow menu (More) ── */}
      {/* Dynamic overflow: renders the actual overflow tools from the active
          context's ToolGroup (Draw, Timeline, Cutout, Animation, etc.) plus
          persistent items (Accessibility, Help) that aren't in the tool
          groups. This replaces the former hardcoded list that ignored the
          ContextToolRail's overflowTools array — tools moved to overflow are
          now actually accessible. */}
      {ui.showOverflow && (
        <PosterOverflowSurface
          styles={styles}
          colors={colors}
          screenHeight={screenHeight}
          bottomInset={insets.bottom}
          closeSheet={ui.closeSheet}
          openSheet={ui.openSheet}
          overflowSections={toolRail.overflowSections}
          overflowDestructive={toolRail.overflowDestructive}
        />
      )}

      {/* ── Sheets ── */}
      <PosterSheetStack
        styles={styles}
        colors={colors}
        bottomInset={insets.bottom}
        haptic={haptic}
        closeSheet={ui.closeSheet}
        openSheet={ui.openSheet}
        manipulationActiveSV={ui.manipulationActiveSV}
        selectedLayerId={selectedLayerId}
        selectedLayer={selectedLayer}
        page={page}
        document={document}
        updateLayer={updateLayer}
        reorderLayer={reorderLayer}
        showPreview={ui.showPreview}
        showLayers={ui.showLayers}
        showPublish={ui.showPublish}
        showSettings={ui.showSettings}
        showHelp={ui.showHelp}
        showA11yMove={ui.showA11yMove}
        showA11yZOrder={ui.showA11yZOrder}
        showA11yTransform={ui.showA11yTransform}
        showTransitions={ui.showTransitions}
        showKeyframes={ui.showKeyframes}
        showSpeedCurve={ui.showSpeedCurve}
        showReverse={ui.showReverse}
        showFreezeFrame={ui.showFreezeFrame}
        showAudioFade={ui.showAudioFade}
        showTextColorPicker={ui.showTextColorPicker}
        showTemplates={ui.showTemplates}
        setShowPreview={ui.setShowPreview}
        currentTransitionId={sheetOps.currentTransitionId}
        handleTransitionSelect={sheetOps.handleTransitionSelect}
        selectedLayerKeyframes={sheetOps.selectedLayerKeyframes}
        handleAddKeyframe={sheetOps.handleAddKeyframe}
        handleUpdateKeyframe={sheetOps.handleUpdateKeyframe}
        handleRemoveKeyframe={sheetOps.handleRemoveKeyframe}
        selectedMediaSpeedCurve={sheetOps.selectedMediaSpeedCurve}
        handleSpeedCurveChange={timeline.handleSpeedCurveChange}
        setShowTextColorPicker={ui.setShowTextColorPicker}
        colorRecents={ui.colorRecents}
        commitRecentColor={ui.commitRecentColor}
        cropMode={crop.cropMode}
        setCropMode={crop.setCropMode}
        cutoutPreviewTarget={crop.cutoutPreviewTarget}
        setCutoutPreviewTarget={crop.setCutoutPreviewTarget}
        setShowTemplates={ui.setShowTemplates}
        setDocument={setDocument}
        pickerMode={edit.pickerMode}
        editingLayer={edit.editingLayer}
        backgroundMediaUri={media.backgroundMediaUri}
        handlePickerClose={edit.handlePickerClose}
        handlePickerAddLayer={edit.handlePickerAddLayer}
        pageMenuIndex={ui.pageMenuIndex}
        pageCount={pageCount}
        setPageMenuIndex={ui.setPageMenuIndex}
        updatePageDuration={updatePageDuration}
        duplicatePage={duplicatePage}
        removePage={removePage}
        reorderPages={reorderPages}
        setActivePageIndex={setActivePageIndex}
        showEffectsSheet={ui.bottomSurface === 'effects'}
        selectedMediaLayer={effects.selectedMediaLayer}
        effectsSourceUri={effects.effectsSourceUri}
        selectedFilterId={effects.selectedFilterId}
        handleEffectFilterSelect={effects.handleEffectFilterSelect}
        autoAdjustActive={effects.autoAdjustActive}
        handleAutoAdjust={effects.handleAutoAdjust}
        currentAdjustments={effects.currentAdjustments}
        handleEffectAdjustChange={effects.handleEffectAdjustChange}
        handleEffectAdjustCommit={effects.handleEffectAdjustCommit}
        handleEffectReset={effects.handleEffectReset}
        filterAmount={effects.filterAmount}
        handleEffectIntensityChange={effects.handleEffectIntensityChange}
        handleEffectIntensityCommit={effects.handleEffectIntensityCommit}
        activeAIEffectId={effects.activeAIEffectId}
        handleAIEffectApply={effects.handleAIEffectApply}
        handleAIEffectRemove={effects.handleAIEffectRemove}
        setBottomSurface={ui.setBottomSurface}
        confirmSheet={topBar.confirmSheet}
        setConfirmSheet={topBar.setConfirmSheet}
      />
    </View>
  );
}
