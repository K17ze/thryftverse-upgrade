import { type SharedValue } from 'react-native-reanimated';
import { CommerceMediaStage } from '../../commerce';
import { CommerceDetailMediaRail } from './CommerceDetailMediaRail';
import type { ProductMediaItem } from '../../../platform/product';

/**
 * Media hero — the media stage + thumbnail rail.
 *
 * Zone A of the product detail: CommerceMediaStage handles
 * paging/zoom/fullscreen only. CommerceDetailMediaRail overlays the
 * max-3-visible-controls (Back, Share, Save) + overflow (Fav, Watch,
 * Report). Reanimated shared values stay in the orchestrator and are
 * passed as props; this component forwards them to the media stage.
 */
export interface CommerceMediaHeroProps {
  /**
   * Canonical typed media — `ProductMediaItem[]` built once in the
   * derived layer from `listing.media` records (kind, focal point,
   * blurhash/LQIP, poster, derivatives) or, when absent, the flat
   * `images` array. Kind is never re-sniffed from URLs down here.
   */
  media: ProductMediaItem[];
  category: string | null | undefined;
  objectId: string;
  isFav: boolean;
  isSaved: boolean;
  isSold: boolean;
  topInset: number;
  scrollY: SharedValue<number>;
  onBack: () => void;
  onShare: () => void;
  onSave: () => void;
  /** Long-press on the save affordance — the "file to board" tier
   *  (opens the collection picker). Tap stays instant quick-save. */
  onSaveLongPress?: () => void;
  onToggleFav: () => void;
  onDoubleTap: () => void;
  onZoomStart: () => void;
  onOpenFullscreen: (index: number) => void;
  heightFraction: number;
  initialIndex: number;
  onActiveIndexChange: (index: number) => void;
  bigHeartOpacity: SharedValue<number>;
  bigHeartScale: SharedValue<number>;
  showThumbnailStrip: boolean;
  onRailSave: () => void;
  onOverflow: () => void;
}

export function CommerceMediaHero({
  media,
  category,
  objectId,
  isFav,
  isSaved,
  isSold,
  topInset,
  scrollY,
  onBack,
  onShare,
  onSave,
  onSaveLongPress,
  onToggleFav,
  onDoubleTap,
  onZoomStart,
  onOpenFullscreen,
  heightFraction,
  initialIndex,
  onActiveIndexChange,
  bigHeartOpacity,
  bigHeartScale,
  showThumbnailStrip,
  onRailSave,
  onOverflow,
}: CommerceMediaHeroProps) {
  return (
    <>
      {/* ── Zone A — Media stage ──
          CommerceMediaStage handles paging/zoom/fullscreen only.
          CommerceDetailMediaRail overlays the max-3-visible-controls
          (Back, Share, Save) + overflow (Fav, Watch, Report). */}
      <CommerceMediaStage
        media={media}
        category={category ?? undefined}
        objectId={objectId}
        isFav={isFav}
        isSaved={isSaved}
        isSold={isSold}
        topInset={topInset}
        scrollY={scrollY}
        onBack={onBack}
        onShare={onShare}
        onSave={onSave}
        onSaveLongPress={onSaveLongPress}
        onToggleFav={onToggleFav}
        onDoubleTap={onDoubleTap}
        onZoomStart={onZoomStart}
        onOpenFullscreen={onOpenFullscreen}
        heightFraction={heightFraction}
        initialIndex={initialIndex}
        onActiveIndexChange={onActiveIndexChange}
        bigHeartOpacity={bigHeartOpacity}
        bigHeartScale={bigHeartScale}
        showDefaultControls={false}
        showPageIndicator={false}
        showThumbnailStrip={showThumbnailStrip}
      />
      <CommerceDetailMediaRail
        onBack={onBack}
        topInset={topInset}
        rightActions={[
          {
            icon: 'share-outline',
            label: 'Share',
            onPress: onShare,
          },
          {
            icon: isSaved ? 'bookmark' : 'bookmark-outline',
            activeIcon: 'bookmark',
            label: isSaved ? 'Saved' : 'Save',
            accessibilityHint: onSaveLongPress
              ? 'Tap to save. Long-press to file into a collection.'
              : undefined,
            onPress: onRailSave,
            onLongPress: onSaveLongPress,
            isActive: isSaved,
          },
        ]}
        onOverflow={onOverflow}
        showOverflow
      />
    </>
  );
}
