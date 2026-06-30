import React from 'react';
import { Typography } from '../../theme/designTokens';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Animated,
  Dimensions,
} from 'react-native';

const { height: SCREEN_H } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_H * 0.55;

export type LayoutType =
  | 'single'
  | 'split-h'
  | 'split-v'
  | 'triple-h'
  | 'grid-2x2'
  | 'photo-booth';

interface LayoutPickerProps {
  visible: boolean;
  currentLayout: LayoutType;
  onSelect: (layout: LayoutType) => void;
  onClose: () => void;
  previewUri?: string;
}

const LAYOUTS: { type: LayoutType; label: string; slots: number }[] = [
  { type: 'single', label: 'Full', slots: 1 },
  { type: 'split-h', label: 'Split H', slots: 2 },
  { type: 'split-v', label: 'Split V', slots: 2 },
  { type: 'triple-h', label: 'Triple H', slots: 3 },
  { type: 'grid-2x2', label: '2x2 Grid', slots: 4 },
  { type: 'photo-booth', label: 'Photo Booth', slots: 4 },
];

function LayoutPreview({ type }: { type: LayoutType }) {
  const boxStyle = { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, flex: 1 };
  const boxStyleRound = { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4, flex: 1 };

  switch (type) {
    case 'single':
      return <View style={boxStyle} />;
    case 'split-h':
      return (
        <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
          <View style={boxStyle} /><View style={boxStyle} />
        </View>
      );
    case 'split-v':
      return (
        <View style={{ flex: 1, flexDirection: 'column', gap: 2 }}>
          <View style={boxStyle} /><View style={boxStyle} />
        </View>
      );
    case 'triple-h':
      return (
        <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
          <View style={boxStyle} /><View style={boxStyle} /><View style={boxStyle} />
        </View>
      );
    case 'grid-2x2':
      return (
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
            <View style={boxStyle} /><View style={boxStyle} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
            <View style={boxStyle} /><View style={boxStyle} />
          </View>
        </View>
      );
    case 'photo-booth':
      return (
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
            <View style={boxStyleRound} /><View style={boxStyleRound} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
            <View style={boxStyleRound} /><View style={boxStyleRound} />
          </View>
        </View>
      );
  }
}

export default function LayoutPicker({ visible, currentLayout, onSelect, onClose }: LayoutPickerProps) {
  const translateY = React.useRef(new Animated.Value(DRAWER_HEIGHT)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(translateY, { toValue: DRAWER_HEIGHT, useNativeDriver: true, friction: 8 }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, { transform: [{ translateY }] }]}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <Text style={styles.title}>Layout</Text>

        <View style={styles.layoutGrid}>
          {LAYOUTS.map((layout) => {
            const isActive = currentLayout === layout.type;
            return (
              <Pressable
                key={layout.type}
                style={[styles.layoutCard, isActive && styles.layoutCardActive]}
                onPress={() => {
                  onSelect(layout.type);
                  onClose();
                }}
              >
                <View style={[styles.layoutPreview, isActive && styles.layoutPreviewActive]}>
                  <LayoutPreview type={layout.type} />
                </View>
                <Text style={[styles.layoutLabel, isActive && styles.layoutLabelActive]}>
                  {layout.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: 'rgba(18,18,22,0.98)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: 24,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  title: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  layoutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  layoutCard: {
    width: 90,
    alignItems: 'center',
    gap: 8,
  },
  layoutCardActive: {
    // no special bg
  },
  layoutPreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 4,
    overflow: 'hidden',
  },
  layoutPreviewActive: {
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  layoutLabel: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.6)',
  },
  layoutLabelActive: {
    color: '#fff',
  },
});