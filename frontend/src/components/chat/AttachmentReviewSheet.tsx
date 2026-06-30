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
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';

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
      const t = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(t);
    }
  }, [visible]);

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
      <Reanimated.View style={[styles.sheet, sheetStyle]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Review attachment</Text>
          <AnimatedPressable
            onPress={onClose}
            scaleValue={0.9}
            hapticFeedback="light"
            accessibilityLabel="Cancel attachment"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </AnimatedPressable>
        </View>

        <View style={styles.previewWrap}>
          <CachedImage
            uri={uri}
            style={styles.preview}
            contentFit="contain"
          />
          {mediaType === 'video' && (
            <View style={styles.videoBadge}>
              <Ionicons name="play-circle" size={32} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.captionRow}>
          <TextInput
            style={styles.captionInput}
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            accessibilityLabel="Attachment caption"
            accessibilityRole="text"
          />
          <AnimatedPressable
            onPress={() => onSend(caption.trim())}
            scaleValue={0.9}
            hapticFeedback="medium"
            style={styles.sendBtn}
            accessibilityLabel="Send attachment"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-up" size={20} color={Colors.textInverse} />
          </AnimatedPressable>
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
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingBottom: 40,
    maxHeight: height * 0.85,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
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
  },
  headerTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
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
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.sm,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
