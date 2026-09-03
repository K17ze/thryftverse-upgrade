import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, Elevation } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { T } from '../ui/Text';

interface OutfitCardProps {
  name: string;
  itemIds: string[];
  thumbnailUris: string[];
  backgroundColor?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
}

export function OutfitCard({
  name,
  itemIds,
  thumbnailUris,
  backgroundColor,
  onPress,
  onLongPress,
  style,
  testID,
}: OutfitCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const thumbs = thumbnailUris.slice(0, 4);
  const itemCount = itemIds.length;

  return (
    <AnimatedPressable
      style={[styles.card, style]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
      testID={testID}
    >
      <View
        style={[
          styles.thumbGrid,
          { backgroundColor: backgroundColor ?? colors.surfaceAlt },
        ]}
      >
        {thumbs.length === 0 ? (
          <View style={styles.emptyGrid}>
            <Ionicons name="shirt-outline" size={28} color={colors.textMuted} />
          </View>
        ) : (
          <View style={styles.gridInner}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={styles.thumbSlot}>
                {thumbs[i] ? (
                  <CachedImage
                    uri={thumbs[i]}
                    style={styles.thumb}
                    contentFit="cover"
                    priority="low"
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]} />
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.meta}>
        <T.Headline style={styles.name} numberOfLines={1}>
          {name}
        </T.Headline>
        <T.Meta color={colors.textMuted}>
          {itemCount} item{itemCount === 1 ? '' : 's'}
        </T.Meta>
      </View>
    </AnimatedPressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      borderWidth: Stroke.hairline,
      borderColor: colors.border,
      overflow: 'hidden',
      ...Elevation.subtle,
    },
    thumbGrid: {
      width: '100%',
      aspectRatio: 1,
      padding: Space.sm,
    },
    emptyGrid: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    gridInner: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: Space.xs,
    },
    thumbSlot: {
      width: '48%',
      aspectRatio: 1,
    },
    thumb: {
      width: '100%',
      height: '100%',
      borderRadius: Radius.md,
      backgroundColor: colors.surface,
    },
    thumbPlaceholder: {
      backgroundColor: 'transparent',
      borderWidth: Stroke.hairline,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    meta: {
      padding: Space.sm,
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.border,
    },
    name: {
      marginBottom: 2,
    },
  });
}
