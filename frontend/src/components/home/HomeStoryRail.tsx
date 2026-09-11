import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HorizontalRail } from '../HorizontalRail';
import { PremiumSkeletonTile } from '../discover/PremiumSkeletonTile';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useHaptic } from '../../hooks/useHaptic';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import type { PosterStory } from '../../services/postersApi';
import { PosterStoryArtwork } from './PosterStoryArtwork';

const POSTER_CARD_WIDTH = 76;
const POSTER_CARD_HEIGHT = 135;

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface HomeStoryRailProps {
  postersLoading: boolean;
  posters: PosterStory[];
}

export function HomeStoryRail({ postersLoading, posters }: HomeStoryRailProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const navigation = useNavigation<NavT>();

  if (postersLoading) {
    return (
      <View style={styles.postersSection}>
        <HorizontalRail contentContainerStyle={styles.postersScroll}>
          {Array.from({ length: 4 }).map((_, index) => (
            <PremiumSkeletonTile
              key={`poster-skeleton-${index}`}
              width={POSTER_CARD_WIDTH}
              height={POSTER_CARD_HEIGHT}
              borderRadius={RadiusRoleValue.mediaThumbnail}
            />
          ))}
        </HorizontalRail>
      </View>
    );
  }

  if (posters.length === 0) return null;

  // Sort stories: unwatched-first, then watched
  const sortedPosters = [...posters].sort((a, b) => {
    if (a.seenByViewer === b.seenByViewer) return 0;
    return a.seenByViewer ? 1 : -1;
  });
  const unwatchedCount = posters.filter((s) => !s.seenByViewer).length;

  return (
    <View style={styles.postersSection}>
      <HorizontalRail
        contentContainerStyle={styles.postersScroll}
      >
        {sortedPosters.map((story, idx) => {
          const isUnwatched = !story.seenByViewer;
          // Show unwatched badge on the first unwatched story
          const showUnwatchedBadge = isUnwatched && idx === 0 && unwatchedCount > 1;
          return (
            <AnimatedPressable
              key={story.id}
              style={styles.posterCard}
              onPress={() => { haptic.light(); navigation.navigate('PosterViewer', { storyId: story.id }); }}
              accessibilityRole="button"
              accessibilityLabel={`Open poster story by @${story.creator.username ?? story.creatorId}${isUnwatched ? ', new' : ''}`}
              accessibilityHint="Opens poster story viewer"
            >
              {isUnwatched ? (
                <View style={styles.posterTileRing}>
                  <View style={styles.posterTileInner}>
                    <PosterStoryArtwork story={story} />
                    <View style={styles.posterShade} />

                    <View style={styles.posterCreatorOverlay}>
                      <Text style={styles.posterCreatorName} numberOfLines={1} maxFontSizeMultiplier={1.5}>
                        @{story.creator.username ?? story.creatorId}
                      </Text>
                      <View
                        style={styles.posterFreshDot}
                        accessible={false}
                      />
                    </View>

                    {story.totalFrameCount > 1 && (
                      <View style={styles.frameCountBadge} accessible={false}>
                        <Ionicons name="layers" size={10} color={colors.scrimTextPrimary} />
                        <Text style={styles.frameCountBadgeText}>{story.totalFrameCount}</Text>
                      </View>
                    )}

                    {showUnwatchedBadge && (
                      <View style={styles.unwatchedBadge} accessible={false}>
                        <Text style={styles.unwatchedBadgeText}>{unwatchedCount} new</Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <View style={[styles.posterTile, styles.posterTileSeen]}>
                  <PosterStoryArtwork story={story} />
                  <View style={styles.posterShade} />

                  <View style={styles.posterCreatorOverlay}>
                    <Text style={styles.posterCreatorName} numberOfLines={1} maxFontSizeMultiplier={1.5}>
                      @{story.creator.username ?? story.creatorId}
                    </Text>
                    <View
                      style={styles.posterSeenDot}
                      accessible={false}
                    />
                  </View>

                  {story.totalFrameCount > 1 && (
                    <View style={styles.frameCountBadge} accessible={false}>
                      <Ionicons name="layers" size={10} color={colors.scrimTextPrimary} />
                      <Text style={styles.frameCountBadgeText}>{story.totalFrameCount}</Text>
                    </View>
                  )}
                </View>
              )}
            </AnimatedPressable>
          );
        })}
      </HorizontalRail>

    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  postersSection: {
    marginTop: 0,
    paddingBottom: Space.sm },
  postersScroll: {
    paddingHorizontal: Space.md,
    paddingBottom: 2,
    gap: Space.sm },
  posterCard: {
    width: POSTER_CARD_WIDTH },
  posterTile: {
    width: POSTER_CARD_WIDTH,
    height: POSTER_CARD_HEIGHT,
    borderRadius: RadiusRoleValue.sheetDialog,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.surfaceAlt },
  posterTileRing: {
    width: POSTER_CARD_WIDTH,
    height: POSTER_CARD_HEIGHT,
    borderRadius: RadiusRoleValue.sheetDialog + Stroke.emphasis,
    borderWidth: Stroke.emphasis,
    borderColor: colors.brand },
  posterTileInner: {
    flex: 1,
    borderRadius: RadiusRoleValue.sheetDialog,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.surfaceAlt },
  posterTileSeen: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  posterShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay },
  posterCreatorOverlay: {
    position: 'absolute',
    left: 5,
    right: 5,
    bottom: 5,
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: 6,
    borderRadius: RadiusRoleValue.compactControl,
    backgroundColor: colors.overlay },
  posterCreatorName: {
    flex: 1,
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold },
  posterFreshDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
    backgroundColor: colors.brand },
  posterSeenDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
    backgroundColor: colors.border },
  frameCountBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
    backgroundColor: colors.overlay,
    borderRadius: Radius.md,
    paddingHorizontal: 5,
    paddingVertical: Space.xxs },
  frameCountBadgeText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.bold },
  unwatchedBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: colors.brand,
    borderRadius: Radius.md,
    paddingHorizontal: 6,
    paddingVertical: Space.xxs },
  unwatchedBadgeText: {
    color: colors.textInverse,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.bold },
});
