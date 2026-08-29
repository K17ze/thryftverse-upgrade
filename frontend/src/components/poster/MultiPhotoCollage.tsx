import React, { memo, useCallback, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  Modal,
  Text,
  ScrollView,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LayoutType } from './LayoutPicker';
import { useToast } from '../../context/ToastContext';
import { Radius, Space, Type, Typography, Stroke } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMotionConfig } from '../../hooks/useMotionConfig';

import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

const { width: SCREEN_W } = Dimensions.get('window');

const ReanimatedImage = Reanimated.createAnimatedComponent(
  require('expo-image').Image as typeof import('expo-image').Image,
);

interface MultiPhotoCollageProps {
  layout: LayoutType;
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  canvasSize: { width: number; height: number };
}

// ── ActionSheet for long-press cell actions ──────────────────────────
interface CellAction {
  id: 'swap' | 'remove' | 'replace';
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
}

const CELL_ACTIONS: CellAction[] = [
  { id: 'swap', icon: 'swap-horizontal-outline', label: 'Swap photo' },
  { id: 'replace', icon: 'image-outline', label: 'Replace from library' },
  { id: 'remove', icon: 'trash-outline', label: 'Remove photo' },
];

function CellActionSheet({
  visible,
  onClose,
  onAction,
  slotIndex,
}: {
  visible: boolean;
  onClose: () => void;
  onAction: (action: CellAction['id'], slotIndex: number) => void;
  slotIndex: number;
}) {
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const actionSheetStyles = React.useMemo(() => createActionSheetStyles(colors), [colors]);

  const handlePress = useCallback(
    (action: CellAction['id']) => {
      haptic.light();
      onAction(action, slotIndex);
      onClose();
    },
    [haptic, onAction, slotIndex, onClose],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={actionSheetStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={actionSheetStyles.sheet}>
          <View style={actionSheetStyles.handle} />
          <Text style={actionSheetStyles.title}>Photo options</Text>
          {CELL_ACTIONS.map((action) => (
            <Pressable
              key={action.id}
              style={({ pressed }) => [
                actionSheetStyles.actionRow,
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => handlePress(action.id)}
              accessibilityLabel={action.label}
              accessibilityRole="button"
            >
              <Ionicons name={action.icon} size={20} color={colors.textInverse} />
              <Text style={actionSheetStyles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function createActionSheetStyles(colors: ThemeColors) {
  return StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingBottom: 40,
    paddingTop: Space.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.sm,
    backgroundColor: colors.borderSubtle,
    alignSelf: 'center',
    marginBottom: Space.sm,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: colors.textInverse,
    textAlign: 'center',
    marginBottom: Space.md,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
  },
  actionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textInverse,
  },
  });
}

// ── Memoized cell component ──────────────────────────────────────────
interface CollageCellProps {
  slotIndex: number;
  uri: string | undefined;
  cellStyle: ViewStyle;
  cellRadius: number;
  selectedIndex: number | null;
  reducedMotion: boolean;
  onPickPhoto: (slotIndex: number) => void;
  onLongPressCell: (slotIndex: number) => void;
  onPressCell: (slotIndex: number) => void;
  springEntrance: { damping: number; stiffness: number; mass: number };
  springTap: { damping: number; stiffness: number; mass: number };
  springPress: { damping: number; stiffness: number; mass: number };
}

// Import Motion for spring config typing
import { Motion } from '../../theme/motionTokens';

const CollageCell = memo(function CollageCell({
  slotIndex,
  uri,
  cellStyle,
  cellRadius,
  selectedIndex,
  reducedMotion,
  onPickPhoto,
  onLongPressCell,
  onPressCell,
  springEntrance,
  springTap,
  springPress,
}: CollageCellProps) {
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createCollageStyles(colors), [colors]);

  // Spring entrance: stagger by index (80ms delay)
  const entrance = useSharedValue(reducedMotion ? 1 : 0);

  React.useEffect(() => {
    if (reducedMotion) {
      entrance.value = 1;
    } else {
      entrance.value = withDelay(slotIndex * 80, withSpring(1, springEntrance));
    }
  }, [slotIndex, reducedMotion, springEntrance, entrance]);

  // Press scale for tap feedback
  const pressScale = useSharedValue(1);
  const isSelected = selectedIndex === slotIndex;

  // Selection accent scale
  const selectionScale = useSharedValue(isSelected ? 1 : 0);

  React.useEffect(() => {
    selectionScale.value = withSpring(isSelected ? 1 : 0, springTap);
  }, [isSelected, springTap, selectionScale]);

  const entranceStyle = useAnimatedStyle(() => {
    'worklet';
    const scale = interpolate(
      entrance.value,
      [0, 1],
      [0.8, 1],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      entrance.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ scale: scale * pressScale.value }],
      opacity,
    };
  });

  // Selection border style
  const selectionStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: selectionScale.value,
      borderColor: colors.commerceTrust,
      borderWidth: Stroke.emphasis,
    };
  });

  const handlePress = useCallback(() => {
    if (uri) {
      haptic.light();
      onPressCell(slotIndex);
    } else {
      haptic.light();
      onPickPhoto(slotIndex);
    }
  }, [uri, haptic, onPressCell, onPickPhoto, slotIndex]);

  const handleLongPress = useCallback(() => {
    if (uri) {
      haptic.medium();
      onLongPressCell(slotIndex);
    }
  }, [uri, haptic, onLongPressCell, slotIndex]);

  const cellContainer: ViewStyle = {
    ...cellStyle,
    borderRadius: cellRadius,
  };

  const content = (
    <Reanimated.View
      style={[
        styles.slot,
        cellContainer,
        !uri && styles.slotEmpty,
        entranceStyle,
      ]}
    >
      {uri ? (
        <>
          <ReanimatedImage
            source={{ uri }}
            style={[StyleSheet.absoluteFill, { borderRadius: cellRadius }]}
            contentFit="cover"
          />
          {/* Selection accent border */}
          <Reanimated.View
            style={[StyleSheet.absoluteFill, selectionStyle, { borderRadius: cellRadius }]}
            pointerEvents="none"
          />
        </>
      ) : (
        <Pressable
          style={styles.addBtn}
          onPress={handlePress}
          android_ripple={{ color: 'rgba(255,255,255,0.06)', radius: 60 }}
          accessibilityLabel={`Add photo to slot ${slotIndex + 1}`}
          accessibilityHint="Opens your photo library to choose a photo"
          accessibilityRole="button"
        >
          <View style={styles.addCircle}>
            <Ionicons name="add" size={22} color={colors.textSecondary} />
          </View>
        </Pressable>
      )}
    </Reanimated.View>
  );

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={400}
      accessibilityLabel={uri ? `Photo in slot ${slotIndex + 1}` : `Add photo to slot ${slotIndex + 1}`}
      accessibilityRole="button"
    >
      {content}
    </Pressable>
  );
});

// ── Main component ───────────────────────────────────────────────────
export default function MultiPhotoCollage({
  layout,
  photos,
  onPhotosChange,
  canvasSize,
}: MultiPhotoCollageProps) {
  const { show } = useToast();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const { colors } = useAppTheme();

  const [actionSheetSlot, setActionSheetSlot] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handlePickPhoto = useCallback(
    async (slotIndex: number) => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Allow photo library access', 'error');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.92,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const newPhotos = [...photos];
        newPhotos[slotIndex] = result.assets[0].uri;
        onPhotosChange(newPhotos);
        haptic.success();
      }
    },
    [photos, onPhotosChange, show, haptic],
  );

  const handleCellAction = useCallback(
    (action: CellAction['id'], slotIndex: number) => {
      if (action === 'remove') {
        const cleared = [...photos];
        cleared[slotIndex] = '';
        onPhotosChange(cleared);
        haptic.light();
      } else if (action === 'replace' || action === 'swap') {
        handlePickPhoto(slotIndex);
      }
    },
    [photos, onPhotosChange, haptic, handlePickPhoto],
  );

  const handleLongPressCell = useCallback(
    (slotIndex: number) => {
      setActionSheetSlot(slotIndex);
    },
    [],
  );

  const handlePressCell = useCallback(
    (slotIndex: number) => {
      setSelectedIndex((prev) => (prev === slotIndex ? null : slotIndex));
    },
    [],
  );

  const renderSlot = useCallback(
    (slotIndex: number, slotStyle: ViewStyle, cellRadius: number = Radius.sm) => {
      const uri = photos[slotIndex];
      return (
        <CollageCell
          key={slotIndex}
          slotIndex={slotIndex}
          uri={uri || undefined}
          cellStyle={slotStyle}
          cellRadius={cellRadius}
          selectedIndex={selectedIndex}
          reducedMotion={reducedMotion}
          onPickPhoto={handlePickPhoto}
          onLongPressCell={handleLongPressCell}
          onPressCell={handlePressCell}
          springEntrance={spring.entrance}
          springTap={spring.tap}
          springPress={spring.press}
        />
      );
    },
    [
      photos,
      selectedIndex,
      reducedMotion,
      handlePickPhoto,
      handleLongPressCell,
      handlePressCell,
      spring.entrance,
      spring.tap,
      spring.press,
    ],
  );

  if (layout === 'single') return null;

  const slotGap = 3;

  return (
    <>
      {(() => {
        switch (layout) {
          case 'split-h':
            return (
              <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', gap: slotGap }]}>
                {renderSlot(0, { flex: 1 })}
                {renderSlot(1, { flex: 1 })}
              </View>
            );
          case 'split-v':
            return (
              <View style={[StyleSheet.absoluteFill, { flexDirection: 'column', gap: slotGap }]}>
                {renderSlot(0, { flex: 1 })}
                {renderSlot(1, { flex: 1 })}
              </View>
            );
          case 'triple-h':
            return (
              <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', gap: slotGap }]}>
                {renderSlot(0, { flex: 1 })}
                {renderSlot(1, { flex: 1 })}
                {renderSlot(2, { flex: 1 })}
              </View>
            );
          case 'grid-2x2':
            return (
              <View style={[StyleSheet.absoluteFill, { gap: slotGap }]}>
                <View style={{ flex: 1, flexDirection: 'row', gap: slotGap }}>
                  {renderSlot(0, { flex: 1 })}
                  {renderSlot(1, { flex: 1 })}
                </View>
                <View style={{ flex: 1, flexDirection: 'row', gap: slotGap }}>
                  {renderSlot(2, { flex: 1 })}
                  {renderSlot(3, { flex: 1 })}
                </View>
              </View>
            );
          case 'photo-booth':
            return (
              <View style={[StyleSheet.absoluteFill, { gap: slotGap, padding: 20, backgroundColor: colors.background }]}>
                <View style={{ flex: 1, flexDirection: 'row', gap: slotGap }}>
                  {renderSlot(0, { flex: 1 })}
                  {renderSlot(1, { flex: 1 })}
                </View>
                <View style={{ flex: 1, flexDirection: 'row', gap: slotGap }}>
                  {renderSlot(2, { flex: 1 })}
                  {renderSlot(3, { flex: 1 })}
                </View>
              </View>
            );
          default:
            return null;
        }
      })()}

      <CellActionSheet
        visible={actionSheetSlot !== null}
        onClose={() => setActionSheetSlot(null)}
        onAction={handleCellAction}
        slotIndex={actionSheetSlot ?? 0}
      />
    </>
  );
}

function createCollageStyles(colors: ThemeColors) {
  return StyleSheet.create({
  slot: {
    overflow: 'hidden',
    backgroundColor: colors.overlay,
  },
  slotEmpty: {
    borderWidth: Stroke.standard,
    borderColor: colors.borderSubtle,
  },
  addBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCircle: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  });
}
