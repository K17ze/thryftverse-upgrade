import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Video, ResizeMode } from '../compat/Video';
import { CachedImage } from '../CachedImage';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { isVideoUri } from '../../utils/media';
import { safeValidateDocument, type CreatorDocument } from '../../creator/composition';
import { CreatorCanvas } from '../../creator/CreatorCanvas';
import type { PosterStory } from '../../services/postersApi';

const POSTER_CARD_WIDTH = 76;
const POSTER_CARD_HEIGHT = 135;

export const PosterStoryArtwork = React.memo(function PosterStoryArtwork({ story }: { story: PosterStory }) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const firstFrame = story.frames[0];
  const composition = React.useMemo<CreatorDocument | null>(() => {
    if (!story.compositionDocument) return null;
    const result = safeValidateDocument(story.compositionDocument);
    return result.success && result.data?.type === 'poster' ? result.data : null;
  }, [story.compositionDocument]);
  const compositionPage = composition?.pages[0] ?? null;

  if (composition && compositionPage) {
    return (
      <CreatorCanvas
        document={composition}
        page={compositionPage}
        canvasWidth={POSTER_CARD_WIDTH}
        canvasHeight={POSTER_CARD_HEIGHT}
        mode="preview"
      />
    );
  }

  if (isVideoUri(firstFrame?.mediaUrl ?? '')) {
    return (
      <Video
        source={{ uri: firstFrame.mediaUrl }}
        style={styles.posterImage}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isLooping
        isMuted
      />
    );
  }

  if (firstFrame?.mediaUrl) {
    return <CachedImage uri={firstFrame.mediaUrl} style={styles.posterImage} contentFit="cover" priority="high" />;
  }

  // Quiet text-only Poster preview — no decorative sparkle/orb. The caption
  // is the artwork when no media is available (audit: anti-AI art direction).
  const backgroundColor = firstFrame?.backgroundColor ?? colors.surfaceAlt;
  return (
    <View style={[styles.posterTextArtwork, { backgroundColor }]}>
      <Text style={styles.posterTextArtworkCopy} numberOfLines={5} maxFontSizeMultiplier={2}>
        {firstFrame?.caption || 'Poster'}
      </Text>
    </View>
  );
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  posterImage: {
    width: '100%',
    height: '100%' },
  posterTextArtwork: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.sm,
    gap: Space.xs },
  posterTextArtworkCopy: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    letterSpacing: -0.2 },
});
