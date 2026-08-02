import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  useWindowDimensions,
  StatusBar,
  Easing,
  PanResponder,
  GestureResponderEvent,
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
  { key: 'poster', label: 'Poster', icon: 'images-outline' },
];

const OVERFLOW_ACTIONS = [
  { key: 'auction', label: 'Create auction', route: 'CreateAuction' as const },
  { key: 'coown', label: 'Create Co-Own', route: 'CreateCoOwn' as const },
];

const MODE_CONTEXT: Record<CreateMode, string> = {
  'visual-search': 'Find an item',
  look: 'Build a look',
  poster: 'Create a poster',
};

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
  const { width: screenWidth } = useWindowDimensions();

  const [mode, setMode] = useState<CreateMode>(initialMode);
  const [showOverflow, setShowOverflow] = useState(false);
  const indicatorX = useRef(new Animated.Value(0)).current;
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

  const activeIndex = MODES.findIndex((m) => m.key === mode);
  const deckWidth = Math.min(screenWidth - (Space.md * 2), 520);
  const segmentWidth = (deckWidth - (Space.xs * 2)) / MODES.length;

  useEffect(() => {
    if (reducedMotion) {
      indicatorX.setValue(activeIndex * segmentWidth);
      return;
    }
    Animated.spring(indicatorX, {
      toValue: activeIndex * segmentWidth,
      useNativeDriver: true,
      friction: 9,
      tension: 70,
    }).start();
  }, [activeIndex, indicatorX, reducedMotion, segmentWidth]);

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
          s.creatorDeck,
          {
            bottom: Math.max(insets.bottom, 12) + 126,
            width: deckWidth,
            opacity,
          },
        ]}
      >
        {/* Elevated context header — upgraded typography hierarchy */}
        <View style={s.contextHeader}>
          <Text style={s.contextTitle}>{MODE_CONTEXT[mode]}</Text>
          <View style={s.toolRow}>
            {contextualTools.map((tool) => (
              <Pressable
                key={tool.key}
                style={({ pressed }) => [s.toolButton, pressed && s.controlPressed]}
                onPress={tool.onPress}
                accessibilityRole="button"
                accessibilityLabel={tool.label}
              >
                <Ionicons name={tool.icon} size={17} color="#fff" />
                <Text style={s.toolLabel} numberOfLines={1}>{tool.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[s.switcherContainer, { width: deckWidth }]} accessibilityRole="radiogroup">
          <Animated.View
            style={[
              s.activeIndicator,
              {
                width: segmentWidth,
                transform: [{ translateX: indicatorX }],
              },
            ]}
          />
          {MODES.map((m) => (
            <Pressable
              key={m.key}
              style={({ pressed }) => [
                s.modeButton,
                { width: segmentWidth },
                pressed && s.controlPressed,
              ]}
              onPress={() => handleModeChange(m.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === m.key }}
              accessibilityLabel={m.label}
            >
              <Ionicons
                name={m.icon}
                size={16}
                color={mode === m.key ? '#fff' : 'rgba(255,255,255,0.55)'}
                style={s.modeIcon}
              />
              <Text
                style={[
                  s.modeLabel,
                  { color: mode === m.key ? '#fff' : 'rgba(255,255,255,0.55)' },
                ]}
              >
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    );
  }, [contextualTools, deckWidth, handleModeChange, indicatorX, insets.bottom, mode, opacity, segmentWidth]);

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

      {/* Crossfade layer for mode transitions */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: modeTransition }]} pointerEvents="none">
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
  creatorDeck: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: Radius.xl,
    padding: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  contextHeader: {
    paddingHorizontal: Space.xs,
    paddingTop: 2,
    paddingBottom: Space.xs,
  },
  // Elevated context title — upgraded from Type.meta to Type.bodyEmphasis for visual weight
  contextTitle: {
    paddingHorizontal: 4,
    paddingBottom: 6,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  toolRow: {
    minHeight: 40,
    flexDirection: 'row',
    gap: Space.xs,
  },
  // Tool buttons — flat, no background (AGENTS.md §4: no card-on-card)
  toolButton: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Space.xs,
  },
  toolLabel: {
    color: '#fff',
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
  },
  // Switcher — flat within the deck, no nested background (AGENTS.md §4)
  switcherContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: Radius.lg,
    padding: Space.xs,
  },
  activeIndicator: {
    position: 'absolute',
    left: Space.xs,
    top: Space.xs,
    bottom: Space.xs,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  modeButton: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
    zIndex: 1,
  },
  modeIcon: {
    marginRight: 4,
  },
  modeLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
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
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 20,
  },
  overflowItem: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
  },
  overflowItemText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
});
