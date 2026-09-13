import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { CreatorCanvas } from '../../creator/CreatorCanvas';
import type { CreatorDocument, CreatorPage } from '../../creator/composition';
import { LookMediaCarousel, type LookMediaCarouselPage } from '../look/LookMediaCarousel';
import { LookHotspots, type HydratedLookTag } from '../look/LookHotspots';

export interface LookDetailHeroProps {
  /** Hero height = screenWidth / resolved aspect ratio. */
  height: number;
  /** Screen width — canvas width for CreatorCanvas and the wrap. */
  width: number;
  compositionDocument: CreatorDocument | null;
  compositionPage: CreatorPage | null;
  mediaPages: LookMediaCarouselPage[];
  /** Resolved aspect ratio (document canvas ratio wins over the default). */
  aspectRatio: number;
  /** Caption used as the composition page's accessibility label. */
  captionText: string;
  onFirstMediaLoad: () => void;
  onFullscreenRequest: (index: number) => void;
  tags: HydratedLookTag[];
  onTagTap: (tag: HydratedLookTag) => void;
  formatPrice: (price: number, currencyCode?: string) => string;
  currencyCode: string;
}

/**
 * Aspect-aware media hero — height follows the media's real aspect ratio
 * (defaulting to 4:5 until the first frame loads). Renders the authored
 * CreatorCanvas when a composition document exists, else the flagship
 * LookMediaCarousel with pinch/zoom/double-tap/preload/progress dots/
 * swipe hint — matching CommerceMediaStage quality. Interactive product
 * hotspots sit on top; tap opens the inspect sheet, never navigates
 * directly.
 */
function LookDetailHeroImpl({
  height,
  width,
  compositionDocument,
  compositionPage,
  mediaPages,
  aspectRatio,
  captionText,
  onFirstMediaLoad,
  onFullscreenRequest,
  tags,
  onTagTap,
  formatPrice,
  currencyCode,
}: LookDetailHeroProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, width), [colors, width]);

  return (
    <View style={[styles.heroWrap, { height }]}>
      {compositionDocument ? (
        <View
          style={styles.heroPage}
          accessibilityLabel={captionText || 'Authored Look composition'}
        >
          <CreatorCanvas
            document={compositionDocument}
            page={compositionPage!}
            canvasWidth={width}
            canvasHeight={height}
            mode="view"
          />
        </View>
      ) : (
        <LookMediaCarousel
          pages={mediaPages}
          aspectRatio={aspectRatio}
          accessibilityLabel={`Look media, ${mediaPages.length} image${mediaPages.length === 1 ? '' : 's'}`}
          onFirstMediaLoad={onFirstMediaLoad}
          onFullscreenRequest={onFullscreenRequest}
        />
      )}

      {/* Interactive product hotspots — tap opens the inspect sheet, never
          navigates directly. Extracted to its own component with local
          activeTagId state so hotspot taps don't re-render the entire
          FlashList header (CreatorCanvas, LookSocialActions, etc). */}
      <LookHotspots
        tags={tags}
        onTagTap={onTagTap}
        formatPrice={formatPrice}
        currencyCode={currencyCode}
      />

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.42)']}
        locations={[0, 0.4, 1]}
        style={styles.heroGradient}
      />
    </View>
  );
}

export const LookDetailHero = React.memo(LookDetailHeroImpl);

function createStyles(colors: ThemeColors, screenWidth: number) {
  return StyleSheet.create({
    // ── Media pager ──
    heroWrap: {
      width: screenWidth,
      position: 'relative',
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden' },
    heroPage: { width: screenWidth, height: '100%' },
    heroGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: Space.xxl * 3 + Space.xl + Space.xs } });
}
