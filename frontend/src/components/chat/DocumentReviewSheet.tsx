import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  useWindowDimensions,
  Pressable } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppTranslation } from '../../i18n/useAppTranslation';

interface DocumentReviewSheetProps {
  visible: boolean;
  fileName: string;
  mimeType?: string;
  onClose: () => void;
  onSend: (caption: string) => void;
}

function getFileIcon(mimeType?: string): string {
  if (!mimeType) return 'document-outline';
  if (mimeType.includes('pdf')) return 'document-text-outline';
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('rar')) return 'archive-outline';
  if (mimeType.includes('word') || mimeType.includes('msword')) return 'document-text-outline';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'document-text-outline';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'document-text-outline';
  if (mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('text')) return 'document-text-outline';
  return 'document-outline';
}

export function DocumentReviewSheet({
  visible,
  fileName,
  mimeType,
  onClose,
  onSend }: DocumentReviewSheetProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  const { height } = useWindowDimensions();
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
      const timer = setTimeout(() => setShouldRender(false), reducedMotion ? 0 : 300);
      return () => clearTimeout(timer);
    }
  }, [visible, reducedMotion]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: 1 - translateY.value / height }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }] }));

  if (!shouldRender) return null;

  const icon = getFileIcon(mimeType);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <Reanimated.View style={[styles.overlay, { backgroundColor: colors.overlay }, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Reanimated.View>
      <Reanimated.View style={[styles.sheet, { backgroundColor: colors.surface, maxHeight: height * 0.6 }, sheetStyle]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {t('attachments.reviewTitle')}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel={t('attachments.cancelAttachment')}
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={[styles.fileWrap, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.fileIconWrap, { backgroundColor: colors.brandSubtle }]}>
            <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={32} color={colors.brand} />
          </View>
          <View style={styles.fileInfo}>
            <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={2}>
              {fileName}
            </Text>
            {mimeType ? (
              <Text style={[styles.fileMeta, { color: colors.textMuted }]} numberOfLines={1}>
                {mimeType}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.captionRow}>
          <TextInput
            style={[styles.captionInput, { backgroundColor: colors.surfaceAlt, color: colors.textPrimary }]}
            value={caption}
            onChangeText={setCaption}
            placeholder={t('attachments.captionPlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            accessibilityLabel={t('attachments.captionAccessibility')}
            accessibilityRole="text"
          />
          <Pressable
            onPress={() => onSend(caption.trim())}
            style={[styles.sendBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel={t('attachments.sendAttachment')}
            accessibilityRole="button"
          >
            <Ionicons name="send" size={18} color={colors.textInverse} />
          </Pressable>
        </View>
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Space.xxl + Space.sm },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginTop: Space.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
    minHeight: 44 },
  headerTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  fileWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginHorizontal: Space.md,
    marginVertical: Space.sm,
    borderRadius: Radius.md,
    padding: Space.md },
  fileIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  fileInfo: {
    flex: 1,
    gap: 2 },
  fileName: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight },
  fileMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.xs },
  captionInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' } });
