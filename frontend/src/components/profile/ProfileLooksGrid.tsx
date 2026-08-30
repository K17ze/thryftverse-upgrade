import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Pressable,
  ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { LookApiItem } from '../../services/looksApi';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

const GRID_GAP = 8;

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface ProfileLooksGridProps {
  looks: LookApiItem[];
  isLoading: boolean;
  error: string | null;
  isSelfProfile: boolean;
  onRetry: () => void;
  onCreateLook: () => void;
  navigation: NavT;
}

export function ProfileLooksGrid({
  looks,
  isLoading,
  error,
  isSelfProfile,
  onRetry,
  onCreateLook,
  navigation }: ProfileLooksGridProps) {
  const { colors } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const tileWidth = (SCREEN_W - Space.md * 2 - GRID_GAP * 2) / 3;
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  if (isLoading && looks.length === 0) {
    return (
      <View style={styles.stateWrap} accessibilityLabel="Loading looks">
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (error && looks.length === 0) {
    return (
      <View style={styles.stateWrap}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
        <Text style={styles.stateTitle}>Looks could not be loaded</Text>
        <Pressable
          style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.6 }]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading looks"
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (looks.length === 0 && !error) {
    return (
      <View style={styles.stateWrap}>
        <Ionicons name="camera-outline" size={32} color={colors.textMuted} />
        <Text style={styles.stateTitle}>No Looks yet</Text>
        {isSelfProfile ? (
          <>
            <Text style={styles.stateSubtitle}>Share your first outfit.</Text>
            <Pressable
              style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.6 }]}
              onPress={onCreateLook}
              accessibilityRole="button"
              accessibilityLabel="Create look"
            >
              <Text style={styles.createBtnText}>Create Look</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.stateSubtitle}>This member has not shared any public Looks.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {looks.map((look) => {
        const captionPreview = look.caption
          ? look.caption.split('\n').find(Boolean)?.slice(0, 60)
          : undefined;
        const a11yLabel = captionPreview
          ? `Look: ${captionPreview}, ${look.tags.length} pieces, ${look.likeCount} likes`
          : `Look, ${look.tags.length} pieces, ${look.likeCount} likes`;

        return (
          <AnimatedPressable
            key={look.id}
            style={[styles.tile, { width: tileWidth }]}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('LookDetail', { lookId: look.id })}
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
          >
            <View style={styles.tileImageWrap}>
              <CachedImage
                uri={look.mediaUrl}
                style={styles.tileImage}
                contentFit="cover"
                emptyLabel="Look"
                emptyIcon="image-outline"
              />
            </View>
            {captionPreview ? (
              <Text style={styles.tileCaption} numberOfLines={1}>{captionPreview}</Text>
            ) : null}
            <View style={styles.tileMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="pricetag-outline" size={12} color={colors.textMuted} />
                <Text style={styles.metaText}>{look.tags.length}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="heart-outline" size={12} color={colors.textMuted} />
                <Text style={styles.metaText}>{look.likeCount}</Text>
              </View>
            </View>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    gap: GRID_GAP },
  tile: {
    marginBottom: Space.sm + Space.xs },
  tileImageWrap: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt },
  tileImage: {
    width: '100%',
    height: '100%' },
  tileCaption: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary,
    marginTop: Space.xs + 2 },
  tileMeta: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  metaText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl * 2,
    paddingHorizontal: Space.md,
    gap: Space.sm + 2 },
  stateTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textSecondary },
  stateSubtitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textMuted,
    textAlign: 'center' },
  retryBtn: {
    marginTop: Space.xs,
    paddingHorizontal: 20,
    paddingVertical: Space.sm,
    backgroundColor: colors.brand,
    borderRadius: Radius.xl },
  retryBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textInverse },
  createBtn: {
    marginTop: Space.xs,
    paddingHorizontal: 20,
    paddingVertical: Space.sm,
    backgroundColor: colors.brand,
    borderRadius: Radius.xl },
  createBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textInverse } });
}
