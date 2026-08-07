import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Dimensions,
  Pressable,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const { height } = Dimensions.get('window');

interface AttachmentReviewSheetProps {
  visible: boolean;
  uri: string;
  mediaType: 'image' | 'video';
  onClose: () => void;
  onSend: (caption: string) => void;
}

export function AttachmentReviewSheet({
  visible,
  uri,
  mediaType,
  onClose,
  onSend,
}: AttachmentReviewSheetProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const [caption, setCaption] = useState('');
  const [shouldRender, setShouldRender] = useState(visible);
  const translateY = useSharedValue(height);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      setCaption('');
      translateY.value = 0;
    } else if (shouldRender) {
      translateY.value = height;
      const t = setTimeout(() => setShouldRender(false), reducedMotion ? 0 : 300);
      return () => clearTimeout(t);
    }
  }, [visible, reducedMotion]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: 1 - translateY.value / height,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!shouldRender) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <Reanimated.View style={[styles.overlay, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Reanimated.View>
      <Reanimated.View style={[styles.sheet, { backgroundColor: colors.surface }, sheetStyle]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Review attachment
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Cancel attachment"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.previewWrap}>
          <CachedImage
            uri={uri}
            style={styles.preview}
            contentFit="contain"
          />
          {mediaType === 'video' && (
            <View style={styles.videoBadge}>
              <Ionicons name="play-circle" size={32} color={colors.textInverse} />
            </View>
          )}
        </View>

        <View style={styles.captionRow}>
          <TextInput
            style={[styles.captionInput, { backgroundColor: colors.surfaceAlt, color: colors.textPrimary }]}
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            accessibilityLabel="Attachment caption"
            accessibilityRole="text"
          />
          <Pressable
            onPress={() => onSend(caption.trim())}
            style={[styles.sendBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Send attachment"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-up" size={20} color={colors.textInverse} />
          </Pressable>
        </View>
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Space.xxl + Space.sm,
    maxHeight: height * 0.85,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginTop: Space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
    minHeight: 44,
  },
  headerTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  previewWrap: {
    marginHorizontal: Space.md,
    marginVertical: Space.sm,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
    minHeight: 200,
    maxHeight: 350,
    justifyContent: 'center',
    alignItems: 'center',
  },
  preview: {
    width: '100%',
    height: '100%',
    minHeight: 200,
    maxHeight: 350,
  },
  videoBadge: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
  },
  captionInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
