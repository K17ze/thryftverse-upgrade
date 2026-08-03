import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  StatusBar,
  Easing,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import CreatorCamera from '../creator/CreatorCamera';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import type { RootStackParamList } from '../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'CreateCamera'>;

type CreateMode = 'visual-search' | 'look' | 'poster';

const MODES: { key: CreateMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'visual-search', label: 'Search', icon: 'search-outline' },
  { key: 'look', label: 'Look', icon: 'shirt-outline' },
  { key: 'poster', label: 'Story', icon: 'images-outline' },
];

const MODE_CONTEXT: Record<CreateMode, string> = {
  'visual-search': 'Find an item',
  look: 'Build a look',
  poster: 'Create a story',
};

const OVERFLOW_ACTIONS = [
  { key: 'auction', label: 'Create auction', route: 'CreateAuction' as const },
  { key: 'coown', label: 'Create Co-Own', route: 'CreateCoOwn' as const },
];

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
  const opacity = useRef(new Animated.Value(0)).current;
  const modeTransition = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [opacity, reducedMotion]);

  // ── Swipe gesture to switch modes (Snapchat/TikTok pattern) ──
  // Use a ref to hold the current mode so the PanResponder doesn't capture
  // a stale closure of switchMode.
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const switchMode = useCallback((direction: -1 | 1) => {
    const currentIndex = MODES.findIndex((m) => m.key === modeRef.current);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= MODES.length) return;
    haptic.selection();
    // Crossfade the camera content on mode change
    if (!reducedMotion) {
      Animated.sequence([
        Animated.timing(modeTransition, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.timing(modeTransition, { toValue: 1, duration: 160, useNativeDriver: true }),
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
    if (!reducedMotion) {
      Animated.sequence([
        Animated.timing(modeTransition, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.timing(modeTransition, { toValue: 1, duration: 160, useNativeDriver: true }),
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
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Photo library access required', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.92,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        handleCapture(result.assets[0].uri);
      }
    } catch {
      show('Failed to open gallery', 'error');
    }
  }, [handleCapture, show]);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleOverflowAction = useCallback((route: string) => {
    haptic.selection();
    setShowOverflow(false);
    navigation.navigate(route as any);
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
      { key: 'templates', label: 'Templates', icon: 'grid-outline' as const, onPress: handleOpenTemplates },
      { key: 'blank', label: 'Blank', icon: 'add-outline' as const, onPress: handleBlankCanvas },
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
            // including safe area padding + shutter + gallery thumbnail)
            bottom: Math.max(insets.bottom, 16) + 156,
            opacity,
          },
        ]}
        pointerEvents="box-none"
        accessibilityRole="radiogroup"
      >
        {/* Contextual tool cards — visible entry points for look/poster modes.
            These expose the blank-canvas and gallery-upload flows without
            requiring the user to open the overflow menu. */}
        {mode !== 'visual-search' && (
          <View style={s.contextCardsRow} pointerEvents="box-none">
            <Pressable
              style={({ pressed }) => [s.contextCard, pressed && s.controlPressed]}
              onPress={handleBlankCanvas}
              accessibilityLabel="Start with blank canvas"
              accessibilityRole="button"
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={s.contextCardText} numberOfLines={1}>Start Blank</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [s.contextCard, pressed && s.controlPressed]}
              onPress={handleGallery}
              accessibilityLabel="Upload from gallery"
              accessibilityRole="button"
            >
              <Ionicons name="images-outline" size={18} color="#fff" />
              <Text style={s.contextCardText} numberOfLines={1}>Gallery</Text>
            </Pressable>
          </View>
        )}

        {/* Context label — flat transparent text, no grey deck */}
        <Text style={s.modeContextText}>{MODE_CONTEXT[mode]}</Text>

        <View style={s.modeTabsRow}>
          {MODES.map((m) => {
            const isActive = mode === m.key;
            return (
              <Pressable
                key={m.key}
                style={({ pressed }) => [
                  s.modeTab,
                  { backgroundColor: isActive ? colors.brand : colors.surfaceAlt },
                  pressed && s.controlPressed,
                ]}
                onPress={() => handleModeChange(m.key)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`Switch to ${m.label} mode`}
              >
                <Text
                  style={[
                    s.modeTabText,
                    { color: isActive ? colors.textInverse : colors.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    );
  }, [colors.brand, colors.surfaceAlt, colors.textInverse, colors.textSecondary, handleBlankCanvas, handleGallery, handleModeChange, insets.bottom, mode, opacity]);

  const renderOverflowButton = useCallback(() => (
    <Pressable
      style={({ pressed }) => [s.topIconBtn, pressed && s.controlPressed]}
      onPress={() => { haptic.light(); setShowOverflow((value) => !value); }}
      accessibilityLabel="More create options"
      accessibilityRole="button"
      accessibilityState={{ expanded: showOverflow }}
    >
      <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
    </Pressable>
  ), [haptic, showOverflow]);

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

      {showOverflow && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowOverflow(false)}
            pointerEvents="auto"
          />
          <View
            style={[
              s.overflowMenu,
              { top: Math.max(insets.top, 16) + 52, right: 12, backgroundColor: colors.surface },
            ]}
          >
            {/* Contextual creator tools */}
            {contextualTools.map((tool) => (
              <Pressable
                key={tool.key}
                style={({ pressed }) => [
                  s.overflowItem,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  haptic.selection();
                  setShowOverflow(false);
                  tool.onPress();
                }}
                accessibilityRole="menuitem"
                accessibilityLabel={tool.label}
              >
                <Ionicons name={tool.icon} size={18} color={colors.textSecondary} style={s.overflowIcon} />
                <Text style={[s.overflowItemText, { color: colors.textPrimary }]}>
                  {tool.label}
                </Text>
              </Pressable>
            ))}

            {/* Divider between creator tools and other actions */}
            {contextualTools.length > 0 && OVERFLOW_ACTIONS.length > 0 && (
              <View style={[s.overflowDivider, { backgroundColor: colors.border }]} />
            )}

            {/* Other create actions */}
            {OVERFLOW_ACTIONS.map((action) => (
              <Pressable
                key={action.key}
                style={({ pressed }) => [
                  s.overflowItem,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => handleOverflowAction(action.route)}
                accessibilityRole="menuitem"
                accessibilityLabel={action.label}
              >
                <Text style={[s.overflowItemText, { color: colors.textPrimary }]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
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
    gap: 8,
    zIndex: 10,
  },
  modeContextText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.3,
  },
  // ── Contextual tool cards (Start Blank / Gallery) ──
  // Semi-transparent dark pills over the camera feed — the standard pattern
  // for camera overlays (Instagram/Snapchat). White text + icon for legibility
  // against any camera background.
  contextCardsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  contextCardText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    color: '#fff',
    letterSpacing: 0.2,
  },
  modeTabsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  modeTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  modeTabText: {
    fontFamily: Typography.family.semibold,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  overflowMenu: {
    position: 'absolute',
    borderRadius: Radius.lg,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 20,
  },
  overflowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
  },
  overflowIcon: {
    width: 20,
  },
  overflowItemText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
  overflowDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.xs,
    marginHorizontal: Space.sm,
  },
});
