/**
 * TextEditorSheet — bottom sheet for text editing.
 *
 * Per spec 06_TEXT_TYPOGRAPHY_EDITORIAL_SYSTEM §1:
 *   - Real text model with fill (CreatorColor), stroke, shadow, background
 *   - Every visible UI control maps to a distinct persisted value
 *   - Thin/Thick and Soft/Strong render materially differently
 *
 * Provides:
 *   - TextInput (auto-focus on open)
 *   - FontChooserRail using curated FontRegistry (spec §2, §3)
 *   - Fill color via CreatorColorPicker (spec §1)
 *   - Alignment toggle (left/center/right)
 *   - Stroke controls: enable, width slider, color picker
 *   - Shadow controls: enable, blur slider, offset X/Y, color picker
 *   - Background controls: enable, color picker, padding, radius
 *   - Animation selector (fade/rise/type/pop/slide)
 *   - Done button
 *
 * Backward compat: if a layer has old textColor/textEffect/backgroundColor,
 * they are migrated to the new fill/stroke/shadow/background fields on open.
 *
 * Decomposition (pure extraction, zero behavior change):
 *   - useTextEditorState.ts — state, migration, underline anims, handlers
 *   - textEditorShared.ts — types, option sets, helpers
 *   - textEditorStyles.ts — shared StyleSheet
 *   - textEditorPreview.tsx — live preview block
 *   - textEditorTabs.tsx — alignment + animation underline tab bars
 *   - textEditorControls.tsx — MiniSlider, EffectSectionHeader, EffectColorRow
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput } from 'react-native';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../shared/CreatorAnimations';
import { KeyboardAwareScrollView } from '../../../platform/keyboard/KeyboardProvider';
import { FontChooserRail } from './FontChooserRail';
import { CURATED_FONTS } from './FontRegistry';
import type { TextStyleConfig } from './textStylePresets';
import { CreatorColorPicker } from '../../color';
import { useTextEditorState } from './useTextEditorState';
import { useEditorStyles } from './textEditorStyles';
import { TextEditorPreview } from './textEditorPreview';
import { AlignmentTabBar, AnimationTabBar } from './textEditorTabs';
import {
  MiniSlider,
  EffectSectionHeader,
  EffectColorRow } from './textEditorControls';

export interface TextEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  initialText: string;
  initialStyle?: Partial<TextStyleConfig>;
  onConfirm: (text: string, style: TextStyleConfig) => void;
}

// ── Component ─────────────────────────────────────────────────────────

export function TextEditorSheet({
  visible,
  onClose,
  initialText,
  initialStyle,
  onConfirm }: TextEditorSheetProps) {
  const { colors } = useAppTheme();
  const styles = useEditorStyles(colors);
  const {
    inputRef,
    recents,
    addRecent,
    text,
    setText,
    fontId,
    setFontId,
    fillColor,
    setFillColor,
    strokeEnabled,
    setStrokeEnabled,
    strokeWidth,
    setStrokeWidth,
    strokeColor,
    setStrokeColor,
    shadowEnabled,
    setShadowEnabled,
    shadowBlur,
    setShadowBlur,
    shadowOffsetX,
    setShadowOffsetX,
    shadowOffsetY,
    setShadowOffsetY,
    shadowColor,
    setShadowColor,
    bgEnabled,
    setBgEnabled,
    bgRadius,
    setBgRadius,
    bgPaddingX,
    setBgPaddingX,
    bgPaddingY,
    setBgPaddingY,
    bgColor,
    setBgColor,
    animation,
    setAnimation,
    expandedColor,
    alignment,
    setAlignment,
    alignmentLayouts,
    alignmentUnderlineLeft,
    alignmentUnderlineWidth,
    animLayouts,
    animUnderlineLeft,
    animUnderlineWidth,
    animateUnderline,
    handleFillCommit,
    handleStrokeCommit,
    handleShadowCommit,
    handleBgCommit,
    toggleColorSection,
    handleConfirm,
    canConfirm,
    previewTextBase,
    previewShadow,
    strokeOffsets,
    previewText } = useTextEditorState({ visible, initialText, initialStyle, onConfirm });

  return (
    <SheetContainer visible={visible} onClose={onClose} maxHeight={0.9}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ maxHeight: '100%' }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Edit Text</Text>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close text editor"
            accessibilityHint="Closes the text editor sheet"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <AppIcon name="close" size={IconSize.lg} color="textPrimary" opticalCenter={true} accessible={false} />
          </PressScale>
        </View>

        <View style={styles.body}>
          {/* ── Live preview ── */}
          <TextEditorPreview
            previewText={previewText}
            previewTextBase={previewTextBase}
            previewShadow={previewShadow}
            strokeEnabled={strokeEnabled}
            strokeColor={strokeColor}
            strokeOffsets={strokeOffsets}
            bgEnabled={bgEnabled}
            bgColor={bgColor}
            bgRadius={bgRadius}
            bgPaddingX={bgPaddingX}
            bgPaddingY={bgPaddingY}
            colors={colors}
          />

          {/* ── Text input ── */}
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Type your text..."
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={200}
            accessibilityLabel="Text content"
            accessibilityHint="Type the layer text"
          />

          {/* ── Font chooser rail ── */}
          <Text style={styles.sectionLabel}>Font</Text>
          <FontChooserRail
            text={text}
            fonts={CURATED_FONTS}
            selectedId={fontId}
            onSelect={setFontId}
          />

          {/* ── Fill color ── */}
          <Text style={styles.sectionLabel}>Text Color</Text>
          <CreatorColorPicker
            color={fillColor}
            onChange={setFillColor}
            onCommit={handleFillCommit}
            mode={expandedColor === 'fill' ? 'expanded' : 'compact'}
            recents={recents}
            onCommitRecent={addRecent}
            accessibilityLabel="Text fill color picker"
            accessibilityHint="Choose a fill color"
            style={styles.colorPicker}
          />

          {/* ── Alignment ── */}
          <Text style={styles.sectionLabel}>Alignment</Text>
          <AlignmentTabBar
            alignment={alignment}
            onSelect={setAlignment}
            layouts={alignmentLayouts}
            underlineLeft={alignmentUnderlineLeft}
            underlineWidth={alignmentUnderlineWidth}
            animateUnderline={animateUnderline}
            colors={colors}
          />

          {/* ── Stroke section ── */}
          <EffectSectionHeader
            label="Stroke"
            enabled={strokeEnabled}
            onToggle={() => setStrokeEnabled((v) => !v)}
            colors={colors}
          />

          {strokeEnabled && (
            <View style={styles.effectControls}>
              <MiniSlider
                label="Width"
                value={strokeWidth}
                min={0}
                max={20}
                step={0.5}
                valueFormatter={(v) => `${v.toFixed(1)}px`}
                onChange={setStrokeWidth}
                colors={colors}
              />
              <EffectColorRow
                label="Stroke"
                color={strokeColor}
                expanded={expandedColor === 'stroke'}
                onToggle={() => toggleColorSection('stroke')}
                onChange={setStrokeColor}
                onCommit={handleStrokeCommit}
                recents={recents}
                onCommitRecent={addRecent}
                colors={colors}
              />
            </View>
          )}

          {/* ── Shadow section ── */}
          <EffectSectionHeader
            label="Shadow"
            enabled={shadowEnabled}
            onToggle={() => setShadowEnabled((v) => !v)}
            colors={colors}
          />

          {shadowEnabled && (
            <View style={styles.effectControls}>
              <MiniSlider
                label="Blur"
                value={shadowBlur}
                min={0}
                max={30}
                step={0.5}
                valueFormatter={(v) => `${v.toFixed(1)}px`}
                onChange={setShadowBlur}
                colors={colors}
              />
              <MiniSlider
                label="Offset X"
                value={shadowOffsetX}
                min={-20}
                max={20}
                step={1}
                valueFormatter={(v) => `${v}px`}
                onChange={setShadowOffsetX}
                colors={colors}
              />
              <MiniSlider
                label="Offset Y"
                value={shadowOffsetY}
                min={-20}
                max={20}
                step={1}
                valueFormatter={(v) => `${v}px`}
                onChange={setShadowOffsetY}
                colors={colors}
              />
              <EffectColorRow
                label="Shadow"
                color={shadowColor}
                expanded={expandedColor === 'shadow'}
                onToggle={() => toggleColorSection('shadow')}
                onChange={setShadowColor}
                onCommit={handleShadowCommit}
                recents={recents}
                onCommitRecent={addRecent}
                colors={colors}
              />
            </View>
          )}

          {/* ── Background section ── */}
          <EffectSectionHeader
            label="Background"
            enabled={bgEnabled}
            onToggle={() => setBgEnabled((v) => !v)}
            colors={colors}
          />

          {bgEnabled && (
            <View style={styles.effectControls}>
              <MiniSlider
                label="Padding H"
                value={bgPaddingX}
                min={0}
                max={40}
                step={1}
                valueFormatter={(v) => `${v}px`}
                onChange={setBgPaddingX}
                colors={colors}
              />
              <MiniSlider
                label="Padding V"
                value={bgPaddingY}
                min={0}
                max={40}
                step={1}
                valueFormatter={(v) => `${v}px`}
                onChange={setBgPaddingY}
                colors={colors}
              />
              <MiniSlider
                label="Radius"
                value={bgRadius}
                min={0}
                max={30}
                step={1}
                valueFormatter={(v) => `${v}px`}
                onChange={setBgRadius}
                colors={colors}
              />
              <EffectColorRow
                label="Background"
                color={bgColor}
                expanded={expandedColor === 'background'}
                onToggle={() => toggleColorSection('background')}
                onChange={setBgColor}
                onCommit={handleBgCommit}
                recents={recents}
                onCommitRecent={addRecent}
                colors={colors}
              />
            </View>
          )}

          {/* ── Animation selector ── */}
          <Text style={styles.sectionLabel}>Animation</Text>
          <AnimationTabBar
            animation={animation}
            onSelect={setAnimation}
            layouts={animLayouts}
            underlineLeft={animUnderlineLeft}
            underlineWidth={animUnderlineWidth}
            animateUnderline={animateUnderline}
            colors={colors}
          />

          {/* ── Done button ── */}
          <Pressable
            onPress={handleConfirm}
            style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
            disabled={!canConfirm}
            accessibilityLabel="Done"
            accessibilityHint="Applies the text changes"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirm }}
          >
            <Text style={[styles.confirmBtnText, !canConfirm && { color: colors.textMuted }]}>Done</Text>
            <AppIcon
              name="check"
              size={IconSize.sm}
              color={canConfirm ? 'textInverse' : 'textMuted'}
              opticalCenter={true}
              accessible={false}
            />
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </SheetContainer>
  );
}
