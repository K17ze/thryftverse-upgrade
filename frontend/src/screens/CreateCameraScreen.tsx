import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  StatusBar,
  PanResponder,
  Modal,
  AccessibilityInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { SlideInDown } from 'react-native-reanimated';
import CreatorCamera from '../creator/CreatorCamera';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, FontFamily, Control, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { Motion } from '../theme/motionTokens';
import type { RootStackParamList, CreatorInitialMedia } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateCamera'>;

type CreateMode = 'visual-search' | 'look' | 'poster';

const MODES: { key: CreateMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'visual-search', label: 'Search', icon: 'search-outline' },
  { key: 'look', label: 'Look', icon: 'shirt-outline' },
  { key: 'poster', label: 'Poster', icon: 'images-outline' },
];

const MODE_CONTEXT: Record<CreateMode, string> = {
  'visual-search': 'Find an item',
  look: 'Build a look',
  poster: 'Create a story',
};

// Mode-specific hints shown under the mode switcher.
// Kept to a single short line per audit §A: "reduce explanatory text after
// first use." The mode label + context label already communicate intent;
// the hint is a quiet affordance, not an instruction manual.
const MODE_HINT: Record<CreateMode, string> = {
  'visual-search': 'Point at an item to search',
  look: 'Capture or upload',
  poster: 'Capture or upload',
};

const OVERFLOW_ACTIONS = [
  { key: 'auction', label: 'Create Auction', icon: 'trophy-outline' as const, route: 'CreateAuction' as const },
  { key: 'coown', label: 'Create Co-Own', icon: 'people-outline' as const, route: 'CreateCoOwn' as const },
];

// Mode chip geometry — used to compute the sliding indicator position.
// Matches the modeTab style (horizontal padding 16 + gap 8 between chips).
const MODE_CHIP_HORIZONTAL_PADDING = 16;
const MODE_CHIP_GAP = 8;

// Swipe threshold — how far the user needs to swipe to trigger a mode change
const SWIPE_THRESHOLD = 60;

export default function CreateCameraScreen({ navigation, route }: Props) {
  const initialMode: CreateMode =
    route.params?.mode === 'visual-search' || route.params?.mode === 'poster'
      ? route.params.mode
      : 'look';
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { show } = useToast();
  const { colors } = useAppTheme();

  const [mode, setMode] = useState<CreateMode>(initialMode);
  const [showOverflow, setShowOverflow] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const modeTransition = useRef(new Animated.Value(1)).current;

  // ── Animated sliding mode indicator ──
  // Tracks each chip's measured width so the indicator can slide and resize
  // to sit exactly under the active chip.
  const [chipWidths, setChipWidths] = useState<number[]>(MODES.map(() => 0));
  const modeIndicatorX = useRef(new Animated.Value(0)).current;
  const modeIndicatorWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.spring(opacity, {
      toValue: 1,
      ...Motion.spring.entrance,
      useNativeDriver: false,
    }).start();
  }, [opacity, reducedMotion]);

  // ── Slide + resize the mode indicator under the active chip ──
  useEffect(() => {
    const activeIndex = MODES.findIndex((m) => m.key === mode);
    if (activeIndex < 0) return;
    // Compute the x offset as the sum of preceding chip widths + gaps
    let xOffset = 0;
    for (let i = 0; i < activeIndex; i++) {
      xOffset += (chipWidths[i] || 0) + MODE_CHIP_GAP;
    }
    const targetWidth = chipWidths[activeIndex] || 0;
    if (reducedMotion) {
      modeIndicatorX.setValue(xOffset);
      modeIndicatorWidth.setValue(targetWidth);
      return;
    }
    Animated.spring(modeIndicatorX, {
      toValue: xOffset,
      ...Motion.spring.indicator,
      useNativeDriver: false,
    }).start();
    Animated.spring(modeIndicatorWidth, {
      toValue: targetWidth,
      ...Motion.spring.indicator,
      useNativeDriver: false,
    }).start();
  }, [mode, chipWidths, modeIndicatorX, modeIndicatorWidth, reducedMotion]);

  // ── Swipe gesture to switch modes ──
  // Use a ref to hold the current mode so the PanResponder doesn't capture
  // a stale closure of switchMode.
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const switchMode = useCallback((direction: -1 | 1) => {
    const currentIndex = MODES.findIndex((m) => m.key === modeRef.current);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= MODES.length) return;
    haptic.selection();
    AccessibilityInfo.announceForAccessibility(`Switched to ${MODES[nextIndex].label} mode`);
    // Crossfade the camera content on mode change
    if (!reducedMotion) {
      Animated.sequence([
        Animated.spring(modeTransition, { toValue: 0, ...Motion.spring.glide, useNativeDriver: true }),
        Animated.spring(modeTransition, { toValue: 1, ...Motion.spring.glide, useNativeDriver: true }),
      ]).start();
    }
    setMode(MODES[nextIndex].key);
  }, [haptic, modeTransition, reducedMotion]);

  const panResponder = useRef(
    PanResponder.create({
      // Use capture phase to intercept swipes BEFORE the camera's tap-to-focus
      // Pressable claims the touch responder. This is the key fix — without
      // capture, the inner Pressable eats all touches and swipe never fires.
      onMoveShouldSetPanResponderCapture: (_evt, gestureState) => {
        // Only capture horizontal swipes (not vertical, not taps)
        return Math.abs(gestureState.dx) > SWIPE_THRESHOLD &&
               Math.abs(gestureState.dy) < 40 &&
               Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (gestureState.dx > SWIPE_THRESHOLD) {
          switchMode(-1); // Swipe right → previous mode
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          switchMode(1); // Swipe left → next mode
        }
      },
    })
  ).current;

  const handleModeChange = useCallback((newMode: CreateMode) => {
    haptic.selection();
    const modeLabel = MODES.find((m) => m.key === newMode)?.label ?? newMode;
    AccessibilityInfo.announceForAccessibility(`Switched to ${modeLabel} mode`);
    if (!reducedMotion) {
      Animated.sequence([
        Animated.spring(modeTransition, { toValue: 0, ...Motion.spring.glide, useNativeDriver: true }),
        Animated.spring(modeTransition, { toValue: 1, ...Motion.spring.glide, useNativeDriver: true }),
      ]).start();
    }
    setMode(newMode);
  }, [haptic, modeTransition, reducedMotion]);

  const handleCapture = useCallback((uri: string) => {
    if (mode === 'visual-search') {
      navigation.navigate('VisualSearch', { initialImageUri: uri });
    } else {
      navigation.navigate('CreatorStudio', {
        type: mode,
        initialMediaUri: uri,
      });
    }
  }, [mode, navigation]);

  const handleGallery = useCallback(async () => {
    haptic.selection();
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Photo library access required', 'error');
        return;
      }
      // Gallery supports photos AND videos with ordered multi-select (up to
      // 10). Every selected ImagePickerAsset is mapped into the typed
      // CreatorInitialMedia payload — preserving kind, dimensions and video
      // duration (in ms) — so the studio receives the full selection.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.92,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        orderedSelection: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        if (mode === 'visual-search') {
          navigation.navigate('VisualSearch', { initialImageUri: result.assets[0].uri });
          return;
        }
        const initialMedia: CreatorInitialMedia[] = result.assets.map((a, i) => ({
          // ImagePicker does not expose a stable id; derive one from the
          // ordered selection index + uri so deterministic seeding is stable.
          id: a.uri ? `picker_${i}_${a.uri}` : `picker_${i}`,
          uri: a.uri,
          kind: a.type === 'video' ? 'video' : 'image',
          width: a.width,
          height: a.height,
          // ImagePicker returns video duration in milliseconds.
          durationMs: a.type === 'video' ? a.duration ?? undefined : undefined,
          mimeType: a.mimeType,
        }));
        navigation.navigate('CreatorStudio', {
          type: mode,
          initialMedia,
        });
      }
    } catch {
      show('Failed to open gallery', 'error');
    }
  }, [show, navigation, mode, haptic]);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleOverflowAction = useCallback((route: 'CreateAuction' | 'CreateCoOwn') => {
    haptic.selection();
    setShowOverflow(false);
    if (route === 'CreateAuction') {
      navigation.navigate('CreateAuction');
    } else {
      navigation.navigate('CreateCoOwn');
    }
  }, [haptic, navigation]);

  const handleOpenTemplates = useCallback(() => {
    if (mode === 'visual-search') return;
    haptic.selection();
    navigation.navigate('CreatorStudio', {
      type: mode,
      startBlank: true,
      openTemplates: true,
    });
  }, [haptic, mode, navigation]);

  const handleBlankCanvas = useCallback(() => {
    if (mode === 'visual-search') return;
    haptic.selection();
    navigation.navigate('CreatorStudio', { type: mode, startBlank: true });
  }, [haptic, mode, navigation]);

  const handleDrafts = useCallback(() => {
    haptic.selection();
    navigation.navigate('CreatorDraftList');
  }, [haptic, navigation]);

  const handleSavedSearches = useCallback(() => {
    haptic.selection();
    navigation.navigate('SavedSearches');
  }, [haptic, navigation]);

  const contextualTools = useMemo(() => {
    if (mode === 'visual-search') {
      return [
        { key: 'saved', label: 'Saved searches', icon: 'bookmark-outline' as const, onPress: handleSavedSearches },
      ];
    }

    return [
      { key: 'gallery', label: 'Gallery', icon: 'images-outline' as const, onPress: handleGallery },
      { key: 'templates', label: 'Templates', icon: 'grid-outline' as const, onPress: handleOpenTemplates },
      { key: 'blank', label: 'Blank canvas', icon: 'add-outline' as const, onPress: handleBlankCanvas },
      { key: 'drafts', label: 'Drafts', icon: 'document-text-outline' as const, onPress: handleDrafts },
    ];
  }, [handleBlankCanvas, handleDrafts, handleOpenTemplates, handleSavedSearches, mode]);

  const renderModeSwitcher = useCallback(() => {
    return (
      <Animated.View
        style={[
          s.modeBar,
          {
            // Position ABOVE the bottom bar (bottom bar is ~140pt tall
            // including safe area padding + shutter + gallery thumbnail).
            // Kept tight to the shutter so the mode switcher reads as part
            // of the capture cluster, not a disconnected floating deck.
            bottom: Math.max(insets.bottom, 16) + 132,
            opacity,
          },
        ]}
        pointerEvents="box-none"
        accessibilityRole="radiogroup"
      >
        {/* Context label — flat transparent text, no grey deck.
            Per audit §A: the quick camera shows only close/back, flash,
            flip, shutter, gallery thumbnail, and one tools disclosure.
            Templates/drafts/blank live in the overflow menu, not as
            context cards competing with the viewfinder. */}
        <Text style={s.modeContextText}>{MODE_CONTEXT[mode]}</Text>

        {/* Mode chips with animated sliding indicator */}
        <View style={s.modeTabsContainer}>
          {/* Sliding white pill — sits behind the active chip for a clean,
              Instagram-style active state. Chips themselves are transparent
              text-only targets so the pill reads as the selection. */}
          <Animated.View
            style={[
              s.modeIndicator,
              {
                transform: [{ translateX: modeIndicatorX }],
                width: modeIndicatorWidth,
              },
            ]}
            pointerEvents="none"
          />
          <View style={s.modeTabsRow}>
            {MODES.map((m, index) => {
              const isActive = mode === m.key;
              return (
                <Pressable
                  key={m.key}
                  style={({ pressed }) => [
                    s.modeTab,
                    pressed && s.controlPressed,
                  ]}
                  onLayout={(e) => {
                    const w = e.nativeEvent.layout.width;
                    setChipWidths((prev) => {
                      if (prev[index] === w) return prev;
                      const next = [...prev];
                      next[index] = w;
                      return next;
                    });
                  }}
                  onPress={() => handleModeChange(m.key)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`Switch to ${m.label} mode`}
                  accessibilityHint={`Switches to ${m.label} capture mode`}
                >
                  <Text
                    style={[
                      s.modeTabText,
                      { color: isActive ? '#000' : 'rgba(255,255,255,0.9)' },
                    ]}
                    numberOfLines={1}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Mode-specific hint text */}
        <Text style={s.modeHintText}>{MODE_HINT[mode]}</Text>
      </Animated.View>
    );
  }, [handleModeChange, insets.bottom, mode, modeIndicatorX, modeIndicatorWidth, opacity]);

  const renderOverflowButton = useCallback(() => (
    <View style={s.topRightRow}>
      {/* Grid overlay toggle — rule of thirds composition aid */}
      <Pressable
        style={({ pressed }) => [s.topIconBtn, pressed && s.controlPressed]}
        onPress={() => {
          haptic.patterns.toggle();
          setShowGrid((g) => !g);
          AccessibilityInfo.announceForAccessibility(showGrid ? 'Grid hidden' : 'Grid shown');
        }}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel={showGrid ? 'Hide grid overlay' : 'Show grid overlay'}
        accessibilityHint="Toggles rule-of-thirds composition grid"
        accessibilityRole="button"
        accessibilityState={{ selected: showGrid }}
      >
        <Ionicons name={showGrid ? 'grid' : 'grid-outline'} size={22} color="#fff" />
      </Pressable>
      <Pressable
        style={({ pressed }) => [s.topIconBtn, pressed && s.controlPressed]}
        onPress={() => { haptic.light(); setShowOverflow((value) => !value); }}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="More create options"
        accessibilityHint="Opens a menu with additional creation options"
        accessibilityRole="button"
        accessibilityState={{ expanded: showOverflow }}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
      </Pressable>
    </View>
  ), [haptic, showOverflow, showGrid]);

  return (
    <View style={s.container} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Camera — full interaction. The crossfade opacity is applied
          via modeTransition but pointer events must stay enabled so
          the shutter, mode switcher, and all controls remain tappable. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: modeTransition }]} pointerEvents="box-none">
        <CreatorCamera
          mode={mode}
          onCapture={handleCapture}
          onGallery={handleGallery}
          onClose={handleClose}
          renderBottomOverlay={renderModeSwitcher}
          renderTopRightAccessory={renderOverflowButton}
        />
      </Animated.View>

      {/* Rule-of-thirds grid overlay — composition aid, toggled by grid button */}
      {showGrid && (
        <View style={s.gridOverlay} pointerEvents="none">
          <View style={s.gridLineVerticalLeft} />
          <View style={s.gridLineVerticalRight} />
          <View style={s.gridLineHorizontalTop} />
          <View style={s.gridLineHorizontalBottom} />
        </View>
      )}

      {showOverflow && (
        <Modal
          visible={showOverflow}
          transparent
          animationType="none"
          onRequestClose={() => setShowOverflow(false)}
          statusBarTranslucent
        >
          <View style={s.overflowRoot}>
            {/* Backdrop — tap to dismiss */}
            <Pressable
              style={s.overflowBackdrop}
              onPress={() => { haptic.light(); setShowOverflow(false); }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close menu"
              accessibilityHint="Dismisses the overflow menu"
              accessibilityRole="button"
            />
            {/* Bottom sheet */}
            <Reanimated.View
              style={[s.overflowSheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, Space.md) }]}
              entering={reducedMotion ? undefined : SlideInDown.duration(280)}
            >
            {/* Grab handle — neutral, visible on both light/dark sheets */}
            <View style={[s.overflowGrabHandle, { backgroundColor: colors.border }]} />

            {/* Contextual creator tools */}
            {contextualTools.map((tool) => (
              <Pressable
                key={tool.key}
                style={({ pressed }) => [
                  s.overflowOption,
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => {
                  haptic.selection();
                  setShowOverflow(false);
                  tool.onPress();
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="menuitem"
                accessibilityLabel={tool.label}
                accessibilityHint={`Opens ${tool.label}`}
              >
                <Ionicons name={tool.icon} size={22} color={colors.textSecondary} style={s.overflowOptionIcon} />
                <Text style={[s.overflowOptionText, { color: colors.textPrimary }]}>
                  {tool.label}
                </Text>
              </Pressable>
            ))}

            {/* Hairline divider between creator tools and other actions */}
            {contextualTools.length > 0 && OVERFLOW_ACTIONS.length > 0 && (
              <View style={[s.overflowHairline, { backgroundColor: colors.border }]} />
            )}

            {/* Other create actions */}
            {OVERFLOW_ACTIONS.map((action) => (
              <Pressable
                key={action.key}
                style={({ pressed }) => [
                  s.overflowOption,
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => handleOverflowAction(action.route)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="menuitem"
                accessibilityLabel={action.label}
                accessibilityHint={`Opens ${action.label} creation flow`}
              >
                <Ionicons name={action.icon} size={22} color={colors.textSecondary} style={s.overflowOptionIcon} />
                <Text style={[s.overflowOptionText, { color: colors.textPrimary }]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}

            {/* Cancel — separated, secondary colour */}
            <View style={[s.overflowHairline, { backgroundColor: colors.border }]} />
            <Pressable
              style={({ pressed }) => [
                s.overflowOption,
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => {
                haptic.light();
                setShowOverflow(false);
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              accessibilityHint="Closes the overflow menu without selecting an option"
            >
              <Text style={[s.overflowOptionText, { color: colors.textSecondary, flex: 1 }]}>
                Cancel
              </Text>
            </Pressable>
          </Reanimated.View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // ── Mode bar + contextual cards ────────────────────────────────────
  // Overlays the camera feed above the shutter. Contextual tool cards
  // (Start Blank / Gallery) appear for look/poster modes. Mode chips
  // use filled brand/surfaceAlt backgrounds for clear active/inactive
  // distinction over any camera background.
  modeBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.sm,
    zIndex: 10,
  },
  modeContextText: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: LetterSpacing.wide + 0.18,
  },
  // ── Mode tabs with sliding indicator ──
  modeTabsContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: MODE_CHIP_GAP,
  },
  modeTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: MODE_CHIP_HORIZONTAL_PADDING,
    paddingVertical: Space.sm + 2,
    borderRadius: RadiusRoleValue.dominantPanel,
    zIndex: 1,
  },
  modeTabText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    letterSpacing: LetterSpacing.wide + 0.18,
  },
  // Sliding white pill — fills the active chip area from behind for a
  // clean Instagram-style selection. Chips are transparent text targets.
  modeIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: RadiusRoleValue.dominantPanel,
  },
  // Mode-specific hint text
  modeHintText: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: Space.xs,
    letterSpacing: LetterSpacing.wide + 0.08,
  },
  topIconBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: RadiusRoleValue.dominantPanel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  // Top-right row — grid toggle + overflow button
  topRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  // Rule-of-thirds grid overlay — semi-transparent white lines
  gridOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
  },
  gridLineVerticalLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33.33%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  gridLineVerticalRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '66.66%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  gridLineHorizontalTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '33.33%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  gridLineHorizontalBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '66.66%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  // ── Overflow bottom sheet ──
  overflowRoot: {
    flex: 1,
  },
  overflowBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overflowSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: RadiusRoleValue.dominantPanel,
    borderTopRightRadius: RadiusRoleValue.dominantPanel,
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 16,
  },
  overflowGrabHandle: {
    width: Space.xl + Space.sm,
    height: Space.xs,
    borderRadius: RadiusRoleValue.compactControl,
    alignSelf: 'center',
    marginBottom: Space.md,
  },
  overflowOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md + 2,
  },
  overflowOptionIcon: {
    width: Space.lg,
    textAlign: 'center',
  },
  overflowOptionText: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
  },
  overflowHairline: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.xs,
  },
});
