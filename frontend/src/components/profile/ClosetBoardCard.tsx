import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';

const COLLAGE_GAP = 1.5;

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
  index = 0,
}: ClosetBoardCardProps) {
  const { colors } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const cardW = (SCREEN_W - Space.md * 2 - Space.sm) / 2;
  const styles = React.useMemo(() => createStyles(colors, cardW), [colors, cardW]);
  const hasCovers = covers.length > 0;

  return (
    <AnimatedPressable
      style={styles.card}
      onPress={onPress}
      {...PressPresets.card}
      accessibilityRole="button"
      accessibilityLabel={`${title} board, ${itemCount} items${isPrivate ? ', private' : ''}${updatedAt ? `, updated ${formatRelativeTime(updatedAt)} ago` : ''}`}
    >
      {/* Cover — 1:1 square media container (matches Instagram/Pinterest saved collections benchmark) */}
      <View style={styles.coverContainer}>
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
                      <Ionicons name="images-outline" size={14} color={colors.textMuted} />
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
            <Ionicons name="folder-open-outline" size={32} color={colors.textMuted} />
          </View>
        )}
      </View>

      {/* Metadata below media — clean typography, zero gradient obscuration */}
      <View style={styles.textContainer}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View style={styles.metaRow}>
          {isPrivate ? (
            <View style={styles.privateMetaWrap}>
              <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
              <Text style={styles.meta}>Private</Text>
            </View>
          ) : (
            <Text style={styles.meta}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </Text>
          )}
          {updatedAt ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.meta}>{formatRelativeTime(updatedAt)}</Text>
            </>
          ) : null}
        </View>
      </View>
    </AnimatedPressable>
  );
}

function createStyles(colors: ThemeColors, cardW: number) {
  return StyleSheet.create({
    card: {
      width: cardW,
      marginBottom: Space.sm,
    },
    coverContainer: {
      width: cardW,
      height: cardW,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
    },
    gridCollage: {
      width: '100%',
      height: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: COLLAGE_GAP,
      backgroundColor: colors.borderSubtle,
    },
    collageCell: {
      width: (cardW - COLLAGE_GAP) / 2,
      height: (cardW - COLLAGE_GAP) / 2,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
    },
    collageCellEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    coverImg: {
      width: '100%',
      height: '100%',
    },
    emptyCollage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    textContainer: {
      paddingTop: Space.xs + 2,
      paddingHorizontal: 2,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2,
    },
    title: {
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      flexShrink: 1,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2 + 1,
      marginTop: 2,
    },
    privateMetaWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    meta: {
      fontFamily: TypographyV2.caption.fontFamily,
      fontSize: TypographyV2.caption.size,
      color: colors.textMuted,
      lineHeight: TypographyV2.caption.lineHeight,
    },
    metaDot: {
      fontFamily: TypographyV2.caption.fontFamily,
      fontSize: TypographyV2.caption.size,
      color: colors.textMuted,
    },
  });
}
