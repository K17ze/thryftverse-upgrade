import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius, AspectRatio, PressScale } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';

const COLLAGE_GAP = 2;

interface ClosetBoardCardProps {
  title: string;
  itemCount: number;
  covers: string[];
  updatedAt?: number;
  isPrivate?: boolean;
  onPress: () => void;
  index?: number;
}

/**
 * Relative-time formatter for "last updated" metadata.
 * Returns compact strings: "now", "3d", "2w", "1mo", "1y".
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

export function ClosetBoardCard({
  title,
  itemCount,
  covers,
  updatedAt,
  isPrivate,
  onPress,
  index = 0 }: ClosetBoardCardProps) {
  const { colors } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const cardW = (SCREEN_W - Space.md * 2 - Space.sm) / 2;
  // 3:4 portrait cover — media-first, matches the closet mosaic geometry
  const coverH = cardW / AspectRatio.portrait;
  const styles = React.useMemo(() => createStyles(colors, cardW, coverH), [colors, cardW, coverH]);
  const hasCovers = covers.length > 0;

  return (
    <AnimatedPressable
        style={styles.card}
        onPress={onPress}
        {...PressPresets.card}
        accessibilityRole="button"
        accessibilityLabel={`${title} board, ${itemCount} items${isPrivate ? ', private' : ''}${updatedAt ? `, updated ${formatRelativeTime(updatedAt)} ago` : ''}`}
      >
        {/* Cover — media mosaic. 1 image = full-bleed; 2-4 = 2×2 grid collage.
            Uses 3:4 portrait aspect to match the closet mosaic geometry. */}
        <View style={styles.collage}>
          {hasCovers ? (
            covers.length === 1 ? (
              <CachedImage
                uri={covers[0]}
                style={styles.coverImg}
                contentFit="cover"
                downscaleWidth={cardW}
                emptyLabel={title}
                emptyIcon="image-outline"
              />
            ) : (
              <View style={styles.gridCollage}>
                {Array.from({ length: 4 }).map((_, i) => {
                  const uri = covers[i];
                  if (!uri) {
                    return (
                      <View key={i} style={[styles.collageCell, styles.collageCellEmpty]}>
                        <Ionicons name="add" size={14} color={colors.scrimTextTertiary} />
                      </View>
                    );
                  }
                  return (
                    <View key={uri + i} style={styles.collageCell}>
                      <CachedImage
                        uri={uri}
                        style={styles.coverImg}
                        contentFit="cover"
                        downscaleWidth={cardW / 2}
                        emptyIcon="image-outline"
                      />
                    </View>
                  );
                })}
              </View>
            )
          ) : (
            <View style={styles.emptyCollage}>
              <Ionicons name="folder-open-outline" size={28} color={colors.textMuted} />
            </View>
          )}
        </View>

        {/* Bottom gradient for text legibility */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.65)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Title + metadata overlay at bottom */}
        <View style={styles.textOverlay}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {isPrivate ? (
              <View style={styles.privacyBadge}>
                <Ionicons name="lock-closed" size={10} color={colors.scrimTextSecondary} />
              </View>
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </Text>
            {updatedAt ? (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaUpdated}>{formatRelativeTime(updatedAt)}</Text>
              </>
            ) : null}
          </View>
        </View>
      </AnimatedPressable>
  );
}

function createStyles(colors: ThemeColors, cardW: number, coverH: number) {
  return StyleSheet.create({
  card: {
    width: cardW,
    height: coverH + 8,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    position: 'relative' },
  collage: {
    width: '100%',
    height: '100%' },
  gridCollage: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap' },
  collageCell: {
    width: '50%',
    height: '50%',
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt },
  collageCellEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay },
  coverImg: {
    width: '100%',
    height: '100%' },
  emptyCollage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center' },
  textOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Space.sm + 2,
    paddingTop: Space.lg },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  privacyBadge: {
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0 },
  title: {
    flexShrink: 1,
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.bodyStrong.size,
    color: colors.scrimTextPrimary,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    marginTop: 2 },
  meta: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: colors.scrimTextSecondary,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2 },
  metaDot: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: colors.scrimTextTertiary },
  metaUpdated: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    color: colors.scrimTextSecondary,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2 } });
}
