/**
 * OutfitBuilderScreen — Build outfits from saved/owned items
 * Uses StyleGraph for heuristic compatibility scoring (color, formality,
 * season, and style-tag matching rules — not ML) and rule-based
 * completion suggestions.
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  StatusBar,
  useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { OfflineBanner } from '../components/OfflineBanner';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { DockConstants, Space } from '../theme/designTokens';
import {
  useOutfitBuilderActions,
  useOutfitBuilderData,
  useOutfitBuilderSelection } from '../hooks/outfitbuilder';
import { OutfitBuilderHeader } from '../components/outfitbuilder/OutfitBuilderHeader';
import { OutfitBuilderUndoRedoBar } from '../components/outfitbuilder/OutfitBuilderUndoRedoBar';
import { OutfitBuilderPreview } from '../components/outfitbuilder/OutfitBuilderPreview';
import { OutfitBuilderSuggestionCard } from '../components/outfitbuilder/OutfitBuilderSuggestionCard';
import { OutfitBuilderItemSection } from '../components/outfitbuilder/OutfitBuilderItemSection';
import { OutfitBuilderFooter } from '../components/outfitbuilder/OutfitBuilderFooter';
import {
  OutfitBuilderEmptyState,
  OutfitBuilderErrorState,
  OutfitBuilderLoadingState } from '../components/outfitbuilder/OutfitBuilderStates';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// ── Main Screen ──

export default function OutfitBuilderScreen() {
  const navigation = useNavigation<NavT>();
  const { width: SCREEN_W } = useWindowDimensions();
  const SLOT_SIZE = (SCREEN_W - Space.md * 2 - Space.sm * 4) / 5;
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Domain hooks — the screen orchestrates, the hooks own the state ──
  const {
    availableItems,
    lastError,
    showLoading,
    showError,
    showEmpty,
    showContent,
    handleRetry } = useOutfitBuilderData();

  const {
    activeSlot,
    setActiveSlot,
    outfitItems,
    backgroundColor,
    setBackgroundColor,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    toggleItem,
    slotItems,
    compatibility,
    aiSuggestion,
    filledCount,
    handleAiSuggest,
    clearSelection } = useOutfitBuilderSelection(availableItems);

  const {
    confirmSheet,
    setConfirmSheet,
    handleSave,
    handleShare,
    handleClear } = useOutfitBuilderActions({
    outfitItems,
    backgroundColor,
    filledCount,
    clearSelection });

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      {/* Header */}
      <OutfitBuilderHeader onClose={goBack} onClear={handleClear} />

      {/* Offline banner — non-blocking; cached items may still be visible */}
      <OfflineBanner onRetry={handleRetry} />

      {/* Undo / Redo toolbar — progressive disclosure: only visible when
          there is history to traverse. Disabled states are truthful. */}
      {showContent && (canUndo || canRedo) && (
        <OutfitBuilderUndoRedoBar
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
      )}

      {/* ── Loading state ── */}
      {showLoading && <OutfitBuilderLoadingState />}

      {/* ── Error state ── */}
      {showError && (
        <OutfitBuilderErrorState lastError={lastError} onRetry={handleRetry} />
      )}

      {/* ── Empty state ── */}
      {showEmpty && <OutfitBuilderEmptyState onBack={goBack} />}

      {/* ── Populated content ── */}
      {showContent && (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Outfit Preview */}
        <OutfitBuilderPreview
          outfitItems={outfitItems}
          activeSlot={activeSlot}
          onSlotPress={setActiveSlot}
          slotSize={SLOT_SIZE}
          compatibility={compatibility}
          filledCount={filledCount}
          backgroundColor={backgroundColor}
          onBackgroundChange={setBackgroundColor}
        />

        {/* Style suggestion — heuristic, not ML */}
        {aiSuggestion && (
          <OutfitBuilderSuggestionCard
            suggestion={aiSuggestion}
            onApply={handleAiSuggest}
          />
        )}

        {/* Section Header + Item Grid */}
        <OutfitBuilderItemSection
          activeSlot={activeSlot}
          slotItems={slotItems}
          selectedItemId={outfitItems[activeSlot]?.id}
          onToggleItem={toggleItem}
          screenWidth={SCREEN_W}
        />

        <View style={{ height: DockConstants.singleActionHeight }} />
      </ScrollView>
      )}

      {/* Footer CTA */}
      {showContent && (
      <OutfitBuilderFooter
        filledCount={filledCount}
        onSave={handleSave}
        onShare={handleShare}
      />
      )}

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background },
  scrollContent: {
    paddingTop: Space.sm } });
}
