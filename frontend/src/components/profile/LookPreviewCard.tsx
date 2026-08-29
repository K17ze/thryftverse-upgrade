import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';

interface LookItem {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface LookPreviewCardProps {
  id: string;
  title: string;
  coverImage: string;
  items: LookItem[];
  creatorName: string;
  creatorAvatar?: string;
  likes: number;
  saved: boolean;
  onPress: () => void;
  onLike?: () => void;
  onSave?: () => void;
  index?: number;
}

export function LookPreviewCard({
  title,
  coverImage,
  items,
  creatorName,
  likes,
  saved,
  onPress,
  onLike,
  onSave,
  index = 0 }: LookPreviewCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <AnimatedPressable style={styles.card} onPress={onPress} {...PressPresets.card} accessibilityRole="none" accessibilityLabel={`Look: ${title} by ${creatorName}`} accessibilityHint="Opens look details">
        {/* Cover */}
        <View style={styles.coverWrap}>
          <CachedImage
            uri={coverImage}
            style={styles.coverImage}
            contentFit="cover"
            emptyLabel={title}
            emptyIcon="shirt-outline"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.45)']}
            style={StyleSheet.absoluteFill}
          />

          {/* Item hotspots overlay */}
          {items.map((item) => (
            <View
              key={item.id}
              style={[
                styles.hotspot,
                {
                  left: `${Math.min(Math.max(item.x * 100, 5), 90)}%`,
                  top: `${Math.min(Math.max(item.y * 100, 5), 90)}%` },
              ]}
            >
              <View style={styles.hotspotDot} />
            </View>
          ))}

          {/* Bottom info */}
          <View style={styles.coverInfo}>
            <Text style={styles.coverTitle} numberOfLines={1}>{title}</Text>
            <View style={styles.coverMeta}>
              <Text style={styles.creatorName}>@{creatorName}</Text>
            </View>
          </View>
        </View>

        {/* Action bar */}
        <View style={styles.actionBar}>
          <AnimatedPressable style={styles.actionItem} onPress={onLike} {...PressPresets.iconButton} accessibilityRole="button" accessibilityLabel={`Like ${title}`} accessibilityHint="Likes this look">
            <Ionicons name={saved ? 'heart' : 'heart-outline'} size={18} color={saved ? colors.danger : colors.textSecondary} />
            <Text style={styles.actionText}>{likes}</Text>
          </AnimatedPressable>
          <AnimatedPressable style={styles.actionItem} onPress={onSave} {...PressPresets.iconButton} accessibilityRole="button" accessibilityLabel={saved ? `Unsave ${title}` : `Save ${title}`} accessibilityHint="Saves this look to your closet">
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={18} color={saved ? colors.textPrimary : colors.textSecondary} />
            <Text style={styles.actionText}>{saved ? 'Saved' : 'Save'}</Text>
          </AnimatedPressable>
        </View>
      </AnimatedPressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Space.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border },
  coverWrap: {
    width: '100%',
    aspectRatio: 0.85,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt },
  coverImage: {
    width: '100%',
    height: '100%' },
  hotspot: {
    position: 'absolute',
    width: 20,
    height: 20,
    marginLeft: -10,
    marginTop: -10,
    alignItems: 'center',
    justifyContent: 'center' },
  hotspotDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)' },
  coverInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Space.md,
    paddingTop: Space.lg },
  coverTitle: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.body.size,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3 },
  coverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.xs },
  creatorName: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: 'rgba(255,255,255,0.85)',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2 },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  actionText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: colors.textSecondary } });
}