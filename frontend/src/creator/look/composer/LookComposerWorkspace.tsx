/**
 * LookComposerWorkspace — presentational shell for the Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * Renders the entry screen (camera capture) and the editor workspace
 * (canvas stage, top bar, bottom surfaces, overflow menu, sheet host)
 * inside the CreatorEntryEditorCrossfade transition. All state and
 * handlers come from useLookComposerController via the `vm` bag.
 */

import React from 'react';
import { View } from 'react-native';
import { CreatorEntryScreen } from '../../studio/CreatorEntryScreen';
import { CreatorEntryEditorCrossfade } from '../../studio/CreatorEntryEditorCrossfade';
import { lookComposerStyles as styles } from '../LookComposerStyles';
import { LookRecoveryBanner } from './LookRecoveryBanner';
import { LookCanvasStage } from './LookCanvasStage';
import { LookTopBar } from './LookTopBar';
import { LookBottomSurfaces } from './LookBottomSurfaces';
import { LookOverflowMenu } from './LookOverflowMenu';
import { LookSheetHost } from './LookSheetHost';
import type { LookComposerControllerResult } from './useLookComposerController';

export function LookComposerWorkspace({
  vm,
  onEntryTypeChange,
}: {
  vm: LookComposerControllerResult;
  onEntryTypeChange: (type: 'look' | 'poster' | 'moodboard') => void;
}) {
  const {
    navigation,
    colors,
    insets,
    haptic,
    screenWidth,
    screenHeight,
    canvasWidth,
    canvasHeight,
    canvasVerticalOffset,
    page,
    selectedLayer,
    showEntryScreen,
    backgroundMediaUri,
    // creator context
    document,
    selectedLayerId,
    selectedLayerIds,
    selectLayer,
    selectLayers,
    commitLayerTransform,
    removeLayer,
    updateLayer,
    updateCanvas,
    setDocument,
    isLoadingDraft,
    isDirty,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    swapLookAsset,
    addLayer,
    reorderLayer,
    hasPendingRecovery,
    recoverCrashedProject,
    dismissRecovery,
    // composer state machine + local UI state
    state,
    showSafeZone,
    showOverflow,
    setShowOverflow,
    pickerMode,
    setPickerMode,
    editingLayer,
    setEditingLayer,
    editingTextLayerId,
    setEditingTextLayerId,
    cropTarget,
    setCropTarget,
    cutoutTarget,
    setCutoutTarget,
    showTextColorPicker,
    colorRecents,
    commitRecentColor,
    cutoutPreviewTarget,
    setCutoutPreviewTarget,
    editingLookId,
    isLoadingSourceLook,
    sourceLookError,
    bottomSurface,
    confirmSheet,
    setConfirmSheet,
    multiSelectMode,
    setMultiSelectMode,
    handleCanvasLayout,
    setShowLayers,
    setShowPreview,
    setShowPublish,
    setShowSettings,
    setShowHelp,
    setShowBackground,
    setShowTemplates,
    setShowAIEffects,
    setShowA11yMove,
    setShowA11yZOrder,
    setShowA11yTransform,
    // domain hooks
    handleRetrySourceLook,
    handleBack,
    exitMultiSelect,
    handleCanvasPress,
    handleLayerPress,
    handleUndo,
    handleRedo,
    floatingMenuVisible,
    floatingMenuPos,
    floatingMenuActions,
    instantCutVisible,
    setInstantCutVisible,
    manipulationActiveSV,
    isManipulating,
    setIsManipulating,
    isInTrashZoneSV,
    chromeFadeStyle,
    entryPinnedUri,
    entryPinnedKind,
    entryPinnedDestination,
    entrySourceTransform,
    cameraViewportRef,
    handleEntryMediaSelected,
    handleEntryBlankStart,
    handleEntryClose,
    handleOpenItems,
    handleCloseSurface,
    handleSourceTrayAddItem,
    handleDropProduct,
    selectedMediaLayer,
    effectsSourceUri,
    selectedFilterId,
    activeAIEffectId,
    currentAdjustments,
    filterAmount,
    handleEffectFilterSelect,
    handleEffectIntensityChange,
    handleEffectIntensityCommit,
    handleEffectAdjustChange,
    handleEffectAdjustCommit,
    handleEffectReset,
    autoAdjustActive,
    handleAutoAdjust,
    handleAIEffectApply,
    handleAIEffectRemove,
    handleMultiDragStart,
    handleMultiDragCommit,
    handleOverlapCycle,
    activeToolContext,
    toolGroups,
    overflowContextTools,
    globalOverflowGroups,
    mediaLayers,
    onCanvasListingIds,
    sourcePeekThumbs,
    mediaAssetUris,
    mediaFocalPoints,
    hasMultipleMedia,
    allLayouts,
    selectedLayoutId,
    handleLayoutSelect,
    handleLayoutPreview,
    handleLayoutPreviewEnd,
  } = vm;

  // ── Camera → Editor crossfade ────────────────────────────────────────
  // Per the human-flow reconstruction spec, the captured/selected media
  // should appear to stay in place while editor chrome fades in around it.
  // Both the entry (camera) and editor are mounted simultaneously during a
  // 200ms crossfade so the media reads as continuous. See
  // CreatorEntryEditorCrossfade for the transition implementation.
  const entryContent = showEntryScreen ? (
    <CreatorEntryScreen
      documentType="look"
      onDocumentTypeChange={onEntryTypeChange}
      onClose={handleEntryClose}
      onMediaSelected={handleEntryMediaSelected}
      onBlankStart={handleEntryBlankStart}
      onViewportChange={(vp) => { cameraViewportRef.current = vp; }}
      onVisualSearchCapture={(uri: string) => {
        navigation.navigate('VisualSearch', { initialImageUri: uri });
      }}
    />
  ) : null;

  const editorContent = (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Crash recovery banner ──────────────────────────────────── */}
      <LookRecoveryBanner
        hasPendingRecovery={hasPendingRecovery}
        recoverCrashedProject={recoverCrashedProject}
        dismissRecovery={dismissRecovery}
        colors={colors}
      />
      {/* ── Neutral workspace canvas ────────────────────────────────── */}
      <LookCanvasStage
        canvasVerticalOffset={canvasVerticalOffset}
        handleCanvasLayout={handleCanvasLayout}
        document={document}
        page={page}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        selectedLayerId={selectedLayerId}
        selectedLayerIds={selectedLayerIds}
        handleLayerPress={handleLayerPress}
        handleCanvasPress={handleCanvasPress}
        commitLayerTransform={commitLayerTransform}
        multiSelectMode={multiSelectMode}
        handleOverlapCycle={handleOverlapCycle}
        setEditingTextLayerId={setEditingTextLayerId}
        haptic={haptic}
        setMultiSelectMode={setMultiSelectMode}
        selectLayers={selectLayers}
        handleMultiDragStart={handleMultiDragStart}
        handleMultiDragCommit={handleMultiDragCommit}
        removeLayer={removeLayer}
        showSafeZone={showSafeZone}
        insets={insets}
        manipulationActiveSV={manipulationActiveSV}
        setIsManipulating={setIsManipulating}
        isInTrashZoneSV={isInTrashZoneSV}
        floatingMenuVisible={floatingMenuVisible}
        isManipulating={isManipulating}
        floatingMenuActions={floatingMenuActions}
        floatingMenuPos={floatingMenuPos}
        editingTextLayerId={editingTextLayerId}
        updateLayer={updateLayer}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        isLoadingSourceLook={isLoadingSourceLook}
        isLoadingDraft={isLoadingDraft}
        sourceLookError={sourceLookError}
        handleRetrySourceLook={handleRetrySourceLook}
        colors={colors}
      />

      {/* ── Top bar — minimal, neutral ──────────────────────────────── */}
      <LookTopBar
        topInset={insets.top}
        chromeFadeStyle={chromeFadeStyle}
        isManipulating={isManipulating}
        multiSelectMode={multiSelectMode}
        exitMultiSelect={exitMultiSelect}
        selectedLayerIds={selectedLayerIds}
        page={page}
        selectLayers={selectLayers}
        haptic={haptic}
        selectedLayer={selectedLayer}
        selectLayer={selectLayer}
        setShowOverflow={setShowOverflow}
        handleBack={handleBack}
        isDirty={isDirty}
        handleUndo={handleUndo}
        canUndo={canUndo}
        undoLabel={undoLabel}
        handleRedo={handleRedo}
        canRedo={canRedo}
        redoLabel={redoLabel}
        hasMultipleMedia={hasMultipleMedia}
        setInstantCutVisible={setInstantCutVisible}
        setShowPublish={setShowPublish}
        colors={colors}
      />

      {/* ── Bottom surface state machine ────────────────────────────── */}
      <LookBottomSurfaces
        bottomSurface={bottomSurface}
        insets={insets}
        chromeFadeStyle={chromeFadeStyle}
        isManipulating={isManipulating}
        sourcePeekThumbs={sourcePeekThumbs}
        selectedLayerId={selectedLayerId}
        handleOpenItems={handleOpenItems}
        activeToolContext={activeToolContext}
        toolGroups={toolGroups}
        haptic={haptic}
        setShowOverflow={setShowOverflow}
        handleCloseSurface={handleCloseSurface}
        handleSourceTrayAddItem={handleSourceTrayAddItem}
        handleDropProduct={handleDropProduct}
        onCanvasListingIds={onCanvasListingIds}
        colors={colors}
        mediaLayers={mediaLayers}
        mediaAssetUris={mediaAssetUris}
        mediaFocalPoints={mediaFocalPoints}
        allLayouts={allLayouts}
        selectedLayoutId={selectedLayoutId}
        handleLayoutSelect={handleLayoutSelect}
        handleLayoutPreview={handleLayoutPreview}
        handleLayoutPreviewEnd={handleLayoutPreviewEnd}
        selectedMediaLayer={selectedMediaLayer}
        effectsSourceUri={effectsSourceUri}
        selectedFilterId={selectedFilterId}
        handleEffectFilterSelect={handleEffectFilterSelect}
        filterAmount={filterAmount}
        handleEffectIntensityChange={handleEffectIntensityChange}
        handleEffectIntensityCommit={handleEffectIntensityCommit}
        setShowAIEffects={setShowAIEffects}
        autoAdjustActive={autoAdjustActive}
        handleAutoAdjust={handleAutoAdjust}
        currentAdjustments={currentAdjustments}
        handleEffectAdjustChange={handleEffectAdjustChange}
        handleEffectAdjustCommit={handleEffectAdjustCommit}
        handleEffectReset={handleEffectReset}
      />

      {/* ── Overflow menu (context tools, then grouped global tools) ── */}
      <LookOverflowMenu
        showOverflow={showOverflow}
        topInset={insets.top}
        screenHeight={screenHeight}
        overflowContextTools={overflowContextTools}
        globalOverflowGroups={globalOverflowGroups}
        setShowOverflow={setShowOverflow}
        colors={colors}
      />

      {/* ── Sheets ──────────────────────────────────────────────────── */}
      <LookSheetHost
        state={state}
        setShowPreview={setShowPreview}
        setShowPublish={setShowPublish}
        setShowLayers={setShowLayers}
        setShowSettings={setShowSettings}
        setShowHelp={setShowHelp}
        setShowTemplates={setShowTemplates}
        setShowBackground={setShowBackground}
        setShowAIEffects={setShowAIEffects}
        setShowA11yMove={setShowA11yMove}
        setShowA11yZOrder={setShowA11yZOrder}
        setShowA11yTransform={setShowA11yTransform}
        editingLookId={editingLookId}
        instantCutVisible={instantCutVisible}
        setInstantCutVisible={setInstantCutVisible}
        mediaAssetUris={mediaAssetUris}
        handleLayoutSelect={handleLayoutSelect}
        document={document}
        mediaLayers={mediaLayers}
        updateCanvas={updateCanvas}
        setDocument={setDocument}
        activeAIEffectId={activeAIEffectId}
        effectsSourceUri={effectsSourceUri}
        handleAIEffectApply={handleAIEffectApply}
        handleAIEffectRemove={handleAIEffectRemove}
        selectedLayerId={selectedLayerId}
        selectedLayer={selectedLayer}
        updateLayer={updateLayer}
        page={page}
        reorderLayer={reorderLayer}
        cropTarget={cropTarget}
        setCropTarget={setCropTarget}
        cutoutTarget={cutoutTarget}
        setCutoutTarget={setCutoutTarget}
        cutoutPreviewTarget={cutoutPreviewTarget}
        setCutoutPreviewTarget={setCutoutPreviewTarget}
        showTextColorPicker={showTextColorPicker}
        colorRecents={colorRecents}
        commitRecentColor={commitRecentColor}
        haptic={haptic}
        pickerMode={pickerMode}
        editingLayer={editingLayer}
        backgroundMediaUri={backgroundMediaUri}
        setPickerMode={setPickerMode}
        setEditingLayer={setEditingLayer}
        swapLookAsset={swapLookAsset}
        addLayer={addLayer}
        confirmSheet={confirmSheet}
        setConfirmSheet={setConfirmSheet}
      />
    </View>
  );

  return (
    <CreatorEntryEditorCrossfade
      showEntry={showEntryScreen}
      entryElement={entryContent}
      editorElement={editorContent}
      pinnedMediaUri={entryPinnedUri}
      pinnedMediaKind={entryPinnedKind}
      pinnedMediaDestination={entryPinnedDestination}
      sourceContentTransform={entrySourceTransform}
      destinationContentTransform={entryPinnedDestination ? {
        frame: entryPinnedDestination } : null}
    />
  );
}
