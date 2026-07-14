import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  useWindowDimensions,
  StatusBar,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import CreatorCamera from '../creator/CreatorCamera';
import { useHaptic } from '../hooks/useHaptic';
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
  { key: 'sell', label: 'List an item', route: 'Sell' as const },
  { key: 'auction', label: 'Create auction', route: 'CreateAuction' as const },
  { key: 'coown', label: 'Create Co-Own', route: 'CreateCoOwn' as const },
];

export default function CreateCameraScreen({ navigation, route }: Props) {
  const initialMode: CreateMode =
    route.params?.mode === 'visual-search' || route.params?.mode === 'poster'
      ? route.params.mode
      : 'look';
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { show } = useToast();
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();

  const [mode, setMode] = useState<CreateMode>(initialMode);
  const [showOverflow, setShowOverflow] = useState(false);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [opacity]);

  const activeIndex = MODES.findIndex((m) => m.key === mode);

  const handleModeChange = useCallback((newMode: CreateMode, index: number) => {
    haptic.selection();
    setMode(newMode);
    Animated.spring(indicatorX, {
      toValue: index * (screenWidth / MODES.length),
      useNativeDriver: true,
      friction: 8,
      tension: 60,
    }).start();
  }, [haptic, indicatorX, screenWidth]);

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
    setShowOverflow(false);
    navigation.navigate(route as any);
  }, [navigation]);

  const renderModeSwitcher = useCallback(() => {
    const segmentWidth = screenWidth / MODES.length;
    return (
      <View style={[s.modeSwitcher, { bottom: Math.max(insets.bottom, 16) + 110 }]} pointerEvents="box-none">
        <Animated.View style={[s.switcherContainer, { opacity }]}>
          <Animated.View
            style={[
              s.activeIndicator,
              {
                width: segmentWidth - Space.sm,
                backgroundColor: 'rgba(255,255,255,0.25)',
                transform: [{ translateX: indicatorX }],
              },
            ]}
          />
          {MODES.map((m, index) => (
            <Pressable
              key={m.key}
              style={s.modeButton}
              onPress={() => handleModeChange(m.key, index)}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === m.key }}
              accessibilityLabel={m.label}
            >
              <Ionicons
                name={m.icon}
                size={16}
                color={mode === m.key ? '#fff' : 'rgba(255,255,255,0.7)'}
                style={s.modeIcon}
              />
              <Text
                style={[
                  s.modeLabel,
                  { color: mode === m.key ? '#fff' : 'rgba(255,255,255,0.7)' },
                ]}
              >
                {m.label}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      </View>
    );
  }, [mode, handleModeChange, indicatorX, insets.bottom, opacity, screenWidth]);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <CreatorCamera
        mode={mode}
        onCapture={handleCapture}
        onGallery={handleGallery}
        onClose={handleClose}
        renderBottomOverlay={renderModeSwitcher}
      />

      {/* Top-right overflow menu for other create actions */}
      <View
        style={[
          s.overflowWrap,
          { paddingTop: Math.max(insets.top, 16) + 8, paddingRight: 12 },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          style={s.overflowBtn}
          onPress={() => { haptic.light(); setShowOverflow((v) => !v); }}
          accessibilityLabel="More create options"
          accessibilityRole="button"
        >
          <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
        </Pressable>
      </View>

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
  modeSwitcher: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  switcherContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    padding: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  activeIndicator: {
    position: 'absolute',
    top: Space.xs,
    bottom: Space.xs,
    borderRadius: 20,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.sm,
    zIndex: 1,
  },
  modeIcon: {
    marginRight: 4,
  },
  modeLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  overflowWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 10,
  },
  overflowBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
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
