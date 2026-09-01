import React, { useCallback, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming } from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import { Motion } from '../theme/motionTokens';
import { Space, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { IconGrammar } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useCreator } from './CreatorContext';
import { PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import { ToolButton, type RailTool } from './dock/ToolButton';
import type { CreatorLayer } from './composition';
import type { AssetPickerMode } from './CreatorAssetPicker';

// ── Contextual tool definitions ────────────────────────────────────
// Instagram-grade tool dock: grouped tools with visual hierarchy.
// Primary tools (Media, Text) get filled icon backgrounds.
// Secondary tools (stickers) get outline icons only.
// Groups are separated by subtle dividers, not flat scrolly bars.

export interface CreatorToolDockProps {
  selectedLayer: CreatorLayer | null;
  onPublish: () => void;
  onSettings: () => void;
  onToolPress: (mode: AssetPickerMode) => void;
  onEditLayer: (layer: CreatorLayer) => void;
  onDeleteLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onReorderLayer: (id: string, direction: 'forward' | 'backward') => void;
  onMore: () => void;
  floating?: boolean;
  /** Page-level actions — Poster: add page, Look: layout presets */
  onAddPage?: () => void;
  onLayoutPresets?: () => void;
  /** Look-specific: crop a media layer */
  onCropLayer?: (layer: CreatorLayer) => void;
  /** Look-specific: cutout a media layer */
  onCutoutLayer?: (layer: CreatorLayer) => void;
  /** Document type — drives Poster-specific Instagram-style tool set.
   *  Falls back to the CreatorContext document type when omitted. */
  documentType?: 'poster' | 'look';
}

export function CreatorToolDock({
  selectedLayer,
  onPublish,
  onToolPress,
  onEditLayer,
  onDeleteLayer,
  onDuplicateLayer,
  onReorderLayer,
  onMore,
  floating = false,
  onAddPage,
  onLayoutPresets,
  onCropLayer,
  onCutoutLayer,
  documentType }: CreatorToolDockProps) {
  const { document } = useCreator();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const isLook = (documentType ?? document.type) === 'look';
  const isPoster = (documentType ?? document.type) === 'poster';
  const [secondaryExpanded, setSecondaryExpanded] = useState(false);
  const [secondaryWidth, setSecondaryWidth] = useState(0);

  // ── Shared values for animations ──────────────────────────────────
  const dockTranslateY = useSharedValue(0);
  const dockOpacity = useSharedValue(0); // starts invisible — refined mount fade-in
  const toolListOpacity = useSharedValue(1); // context transition refresh
  const secondaryExpandSV = useSharedValue(0); // 0 = collapsed, 1 = expanded
  const prevSelectionModeRef = useRef(false);

  const isSelectionMode = !!selectedLayer;

  // ── Refined mount animation: clean opacity fade-in (200ms, ease-out) ──
  // No slide, no spring, no haptic — just a premium fade. Flagship apps use
  // refined motion, not no motion. Respects reduceMotion.
  useEffect(() => {
    if (reduceMotion) {
      dockOpacity.value = 1;
    } else {
      dockOpacity.value = withTiming(1, { duration: Motion.tier.deliberate, easing: Motion.easing.entrance });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Refined context transition: subtle opacity refresh (0.7→1, 120ms) ──
  // When the tool context changes (selection mode vs idle), the tool list
  // fades in quietly — no flicker, no decorative slide.
  useEffect(() => {
    if (prevSelectionModeRef.current === isSelectionMode) return;
    prevSelectionModeRef.current = isSelectionMode;
    if (reduceMotion) {
      toolListOpacity.value = 1;
    } else {
      toolListOpacity.value = 0.7;
      toolListOpacity.value = withTiming(1, { duration: Motion.tier.micro });
    }
  }, [isSelectionMode, reduceMotion, toolListOpacity]);

  // ── Secondary expand/collapse animation ───────────────────────────
  // Timing-based expand/collapse (150ms ease-out) — no spring overshoot
  // for utility UI per AGENTS.md §4 / Design.md snap physics.
  const toggleSecondary = useCallback(() => {
    setSecondaryExpanded((prev) => {
      const next = !prev;
      if (reduceMotion) {
        secondaryExpandSV.value = next ? 1 : 0;
      } else {
        secondaryExpandSV.value = withTiming(next ? 1 : 0, { duration: Motion.tier.micro, easing: Motion.easing.crisp });
      }
      haptic.light();
      return next;
    });
  }, [reduceMotion, secondaryExpandSV, haptic]);

  // Build contextual tools based on selection state and mode.
  // Poster mode uses an Instagram Stories tool set; Look mode keeps the
  // collage-first editorial tool set.
  const tools: RailTool[] = selectedLayer
    ? buildSelectionTools(selectedLayer, isLook, onEditLayer, onDeleteLayer, onDuplicateLayer, onReorderLayer, onCropLayer, onCutoutLayer)
    : buildDefaultTools(isLook, isPoster, onToolPress, onAddPage, onLayoutPresets);

  // Split into primary / secondary groups so a divider can separate them.
  // In selection mode every tool is secondary (no primary weight), so no divider.
  const primaryTools = tools.filter(t => t.weight === 'primary');
  const secondaryTools = tools.filter(t => t.weight !== 'primary');
  const hasDivider = !isSelectionMode && primaryTools.length > 0 && secondaryTools.length > 0;
  // In selection mode, show all tools directly (no expand/collapse needed).
  const showSecondaryToggle = !isSelectionMode && secondaryTools.length > 0;

  const handleToolPress = useCallback((tool: RailTool) => {
    tool.action();
  }, []);

  const handlePublish = useCallback(() => {
    haptic.medium();
    onPublish();
  }, [haptic, onPublish]);

  const handleMore = useCallback(() => {
    haptic.selection();
    onMore();
  }, [haptic, onMore]);

  const toolSize = 44;
  const toolIconSize = 23;
  const toolGap = Space.sm;

  const labelColor = colors.textSecondary;

  const renderTool = (tool: RailTool) => {
    const isPrimary = tool.weight === 'primary';
    const bgColor = isPrimary ? colors.brand : 'transparent';
    const iconColor = isPrimary
      ? colors.textInverse
      : tool.danger
        ? colors.danger
        : colors.textPrimary;
    return (
      <ToolButton
        key={tool.label}
        tool={tool}
        size={toolSize}
        iconSize={toolIconSize}
        iconColor={iconColor}
        bgColor={bgColor}
        labelColor={labelColor}
        floating={floating}
        colors={colors}
        onPress={() => handleToolPress(tool)}
      />
    );
  };

  // ── Secondary tools container with spring expand/collapse ─────────
  const secondaryAnimStyle = useAnimatedStyle(() => ({
    maxWidth: secondaryWidth > 0 ? secondaryWidth * secondaryExpandSV.value : 999 * secondaryExpandSV.value,
    opacity: secondaryExpandSV.value,
    transform: [{ translateX: -16 * (1 - secondaryExpandSV.value) }],
    overflow: 'hidden' as const }));

  // ── Dock style (refined mount fade-in + static translate) ─────────
  const dockStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dockTranslateY.value }],
    opacity: dockOpacity.value }));

  // ── Tool list opacity — context transition refresh ────────────────
  const toolListAnimStyle = useAnimatedStyle(() => ({
    opacity: toolListOpacity.value }));

  const handleSecondaryLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== secondaryWidth) {
      setSecondaryWidth(w);
    }
  }, [secondaryWidth]);

  // Render the tool list with optional divider and expandable secondary tools.
  const renderToolList = () => {
    if (isSelectionMode || !hasDivider) {
      return (
        <React.Fragment>
          {tools.map(renderTool)}
        </React.Fragment>
      );
    }
    return (
      <React.Fragment>
        {primaryTools.map(renderTool)}
        {showSecondaryToggle && (
          <>
            {/* Subtle visual separator between primary and secondary groups —
                a short hairline, not a full divider line. */}
            <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
            {/* Expand/collapse toggle for secondary tools — refined chevron
                with a generous 44pt hit area showing only a 20pt glyph. */}
            <PressScale
              onPress={toggleSecondary}
              style={styles.expandToggle}
              accessibilityLabel={secondaryExpanded ? 'Show fewer tools' : 'Show more tools'}
              accessibilityHint="Expands or collapses the secondary tool tray"
              accessibilityRole="button"
              accessibilityState={{ expanded: secondaryExpanded }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={secondaryExpanded ? 'chevron-back-outline' : 'chevron-forward-outline'}
                size={IconGrammar.standard}
                color={floating ? colors.textInverse : colors.textSecondary}
              />
            </PressScale>
            {/* Secondary tools — spring expand/collapse */}
            <Reanimated.View
              style={[styles.secondaryContainer, secondaryAnimStyle]}
              onLayout={handleSecondaryLayout}
              pointerEvents={secondaryExpanded ? 'auto' : 'none'}
            >
              <View style={styles.secondaryInner}>
                {secondaryTools.map(renderTool)}
              </View>
            </Reanimated.View>
          </>
        )}
      </React.Fragment>
    );
  };

  return (
    <Reanimated.View
      style={[
        styles.container,
        floating
          ? styles.containerFloating
          : {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingTop: Space.md,
              paddingBottom: Math.max(insets.bottom, Space.sm) },
        dockStyle,
      ]}
    >
      {floating ? (
        // Floating dock — transparent background with a 1px top hairline.
        // No "blur pill" card; the tools float directly over the canvas.
        <View style={styles.floatingToolWrap}>
          <View style={[styles.hairlineTop, { backgroundColor: colors.border }]} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Reanimated.View style={[styles.toolListWrap, { gap: toolGap }, toolListAnimStyle]}>
              {renderToolList()}
            </Reanimated.View>
          </ScrollView>
        </View>
      ) : (
        <View style={styles.scrollWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Reanimated.View style={[styles.toolListWrap, { gap: toolGap }, toolListAnimStyle]}>
              {renderToolList()}
            </Reanimated.View>
          </ScrollView>
        </View>
      )}

      {/* Primary action — separated from editing tools */}
      <View style={[styles.actions, { borderLeftColor: colors.border }]}>
        <PressScale
          onPress={handleMore}
          style={styles.actionBtn}
          accessibilityLabel="More options"
          accessibilityHint="Opens the overflow menu with undo, redo, preview and more"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="ellipsis-horizontal" size={IconGrammar.hero} color={floating ? colors.textInverse : colors.textSecondary} />
        </PressScale>
        {/* Publish button — always visible, floating or solid */}
        <PressScale
          onPress={handlePublish}
          style={[styles.publishBtn, { backgroundColor: colors.brand }]}
          accessibilityLabel="Next"
          accessibilityHint="Opens the publish sheet to review and publish your creation"
          scale={0.97}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={[styles.publishBtnText, { color: colors.textInverse }]}>Next</Text>
        </PressScale>
      </View>

    </Reanimated.View>
  );
}

// ── Tool builders ──────────────────────────────────────────────────
// Per audit 9.4: 4-5 context-relevant tools, neutral icons, one accent.
// Nothing selected: Media, Text, Product, Elements, More
// Media selected: Replace, Forward, Back, Delete, More
// Text selected: Edit, Forward, Back, Delete, More
// Product selected: Edit, Forward, Back, Delete, More

function buildDefaultTools(
  isLook: boolean,
  isPoster: boolean,
  onToolPress: (mode: AssetPickerMode) => void,
  onAddPage?: () => void,
  onLayoutPresets?: () => void,
): RailTool[] {
  if (isLook) {
    // Look: collage-first tool set. Per audit doc 02/05:
    // Visible by default: add item/media, cutout, text, product, background, more.
    // Primary tools (Media, Text) lead with brand fill; secondary tools
    // (cutout, product, background, layout, draw, gif, music) follow a
    // divider and are revealed via the chevron "more" toggle. Draw, GIF,
    // and Music are preserved behind "more" rather than removed — they
    // are real creator capabilities useful for collage composition.
    return [
      { icon: 'images', label: 'Media', action: () => onToolPress('media'), weight: 'primary' as const },
      { icon: 'text', label: 'Text', action: () => onToolPress('text'), weight: 'primary' as const },
      { icon: 'crop-outline', label: 'Crop', action: () => onToolPress('media') },
      { icon: 'bag-handle-outline', label: 'Product', action: () => onToolPress('product') },
      { icon: 'color-fill-outline', label: 'Background', action: () => onToolPress('shape') },
      { icon: 'brush-outline', label: 'Draw', action: () => onToolPress('draw') },
      { icon: 'image-outline', label: 'GIF', action: () => onToolPress('gif') },
      { icon: 'musical-notes-outline', label: 'Music', action: () => onToolPress('music') },
      ...(onLayoutPresets ? [{ icon: 'grid-outline' as const, label: 'Layout', action: onLayoutPresets }] : []),
    ];
  }
  if (isPoster) {
    // Poster: Instagram Stories pattern.
    // Primary tools (Text, Stickers, Draw, Music) are always visible with
    // filled icon backgrounds. The 13 former secondary sticker-type buttons
    // (Mention, Item, Look, Vote, Quiz, Question, Location, Hashtag, Link,
    // Countdown, GIF) are collapsed behind the single Stickers entry — the
    // sticker picker sheet hosts the sub-type browser, not the dock. This
    // is the Snapchat/Instagram pattern: the dock shows ≤4 primary creative
    // tools; sticker variants live inside the sticker picker. The former
    // 13-button secondary tray was a "prove every feature exists" dock that
    // violated Hick's Law and read as an AI-assembled toolbar.
    return [
      // ── Primary (always visible) ──
      { icon: 'text', label: 'Text', action: () => onToolPress('text'), weight: 'primary' as const },
      { icon: 'happy-outline', label: 'Stickers', action: () => onToolPress('stickers'), weight: 'primary' as const },
      { icon: 'brush-outline', label: 'Draw', action: () => onToolPress('draw'), weight: 'primary' as const },
      { icon: 'musical-notes-outline', label: 'Music', action: () => onToolPress('music'), weight: 'primary' as const },
      // ── Secondary ──
      // Only Item (product tagging) and Add Page remain at the dock level —
      // they are distinct creative intents, not sticker variants. Everything
      // else is reachable via the Stickers picker.
      { icon: 'bag-handle-outline', label: 'Item', action: () => onToolPress('product') },
      ...(onAddPage ? [{ icon: 'add-circle-outline' as const, label: 'Add Page', action: onAddPage }] : []),
    ];
  }
  // Fallback (no document type resolved) — keep the legacy Poster set.
  return [
    { icon: 'images', label: 'Media', action: () => onToolPress('media'), weight: 'primary' as const },
    { icon: 'text', label: 'Text', action: () => onToolPress('text'), weight: 'primary' as const },
    { icon: 'happy-outline', label: 'Stickers', action: () => onToolPress('stickers'), weight: 'primary' as const },
    { icon: 'brush-outline', label: 'Draw', action: () => onToolPress('draw') },
    { icon: 'musical-notes-outline', label: 'Music', action: () => onToolPress('music') },
    ...(onAddPage ? [{ icon: 'add-circle-outline' as const, label: 'Add Page', action: onAddPage }] : []),
  ];
}

function buildSelectionTools(
  layer: CreatorLayer,
  isLook: boolean,
  onEditLayer: (layer: CreatorLayer) => void,
  onDeleteLayer: (id: string) => void,
  onDuplicateLayer: (id: string) => void,
  onReorderLayer: (id: string, direction: 'forward' | 'backward') => void,
  onCropLayer?: (layer: CreatorLayer) => void,
  onCutoutLayer?: (layer: CreatorLayer) => void,
): RailTool[] {
  const tools: RailTool[] = [];

  // Type-specific primary action — different per mode.
  // The first type-specific edit action is weighted primary so it gets a
  // filled backplate and leads the selection tool set.
  if (layer.type === 'text') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'media') {
    if (isLook) {
      // Look media selection: swap, remove background/refine cutout, flip.
      // Per Phase D spec: swap, remove background/refine cutout,
      // duplicate, forward/back, flip.
      tools.push({
        icon: 'swap-horizontal-outline',
        label: 'Swap',
        action: () => onEditLayer(layer),
        weight: 'primary' as const });
      tools.push({
        icon: 'crop-outline',
        label: 'Crop',
        action: () => (onCutoutLayer ? onCutoutLayer(layer) : onEditLayer(layer)) });
      tools.push({
        icon: 'crop-outline',
        label: 'Refine',
        action: () => (onCropLayer ? onCropLayer(layer) : onEditLayer(layer)) });
    } else {
      // Poster media: replace + trim (story-specific)
      tools.push({ icon: 'swap-horizontal-outline', label: 'Replace', action: () => onEditLayer(layer), weight: 'primary' as const });
      if (layer.payload && 'mediaType' in layer.payload && layer.payload.mediaType === 'video') {
        tools.push({ icon: 'cut-outline', label: 'Trim', action: () => onEditLayer(layer) });
      }
    }
  } else if (layer.type === 'product') {
    tools.push({ icon: 'bag-handle-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'mention') {
    tools.push({ icon: 'person-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'vote') {
    tools.push({ icon: 'stats-chart-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'quiz') {
    tools.push({ icon: 'help-circle-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'question') {
    tools.push({ icon: 'chatbubble-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'emojiSlider') {
    tools.push({ icon: 'happy-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'countdown') {
    tools.push({ icon: 'time-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'draw') {
    tools.push({ icon: 'brush-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'gif') {
    tools.push({ icon: 'swap-horizontal-outline', label: 'Replace', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'music') {
    tools.push({ icon: 'swap-horizontal-outline', label: 'Replace', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'link') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'location') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'hashtag') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'time') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else if (layer.type === 'weather') {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  } else {
    tools.push({ icon: 'create-outline', label: 'Edit', action: () => onEditLayer(layer), weight: 'primary' as const });
  }

  // Layer ordering
  tools.push({ icon: 'arrow-up', label: 'Forward', action: () => onReorderLayer(layer.id, 'forward') });
  tools.push({ icon: 'arrow-down', label: 'Back', action: () => onReorderLayer(layer.id, 'backward') });

  // Flip (Look only — collage direct manipulation)
  if (isLook && layer.type === 'media') {
    tools.push({ icon: 'swap-horizontal', label: 'Flip', action: () => onEditLayer(layer) });
  }

  // Duplicate
  tools.push({ icon: 'copy-outline', label: 'Copy', action: () => onDuplicateLayer(layer.id) });

  // Delete (danger, separated)
  tools.push({ icon: 'trash-outline', label: 'Delete', action: () => onDeleteLayer(layer.id), danger: true });

  return tools;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth },
  containerFloating: {
    borderTopWidth: 0,
    backgroundColor: 'transparent' },
  floatingToolWrap: {
    flexDirection: 'column',
    paddingHorizontal: Space.sm,
  },
  hairlineTop: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Space.xs,
  },
  scrollWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center' },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: Space.xs },
  // ── Tool list wrapper — carries the context transition opacity ──
  // A row container so the gap applies between tools, not between the
  // wrapper and the ScrollView content container.
  toolListWrap: {
    flexDirection: 'row',
    alignItems: 'center' },
  // ── Expand/collapse toggle for secondary tools ──
  // 44pt hit target showing only a 20pt chevron — transparent by default
  // per the containment rule (ordinary controls default to transparent).
  expandToggle: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.full },
  // ── Secondary tools container ──
  // Wraps secondary tools with animated maxWidth + opacity for spring expand.
  secondaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden' },
  secondaryInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  // Subtle vertical separator between primary and secondary tool groups —
  // a short hairline (20pt tall) rather than a full-height divider line.
  groupDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    marginHorizontal: Space.xs },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginLeft: 'auto',
    paddingLeft: Space.sm,
    borderLeftWidth: StyleSheet.hairlineWidth },
  actionBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm },
  publishBtn: {
    paddingHorizontal: 20,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  publishBtnText: {
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontSize: TypographyV2.bodyStrong.size } });
