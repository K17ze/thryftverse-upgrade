import { View, StyleSheet } from 'react-native';
import { type SharedValue } from 'react-native-reanimated';
import { CommerceMediaStage } from '../../commerce';
import { CommerceDetailMediaRail } from './CommerceDetailMediaRail';
import { ProductFamilyBadge } from '../../product';

/**
 * Media hero — the media stage + thumbnail rail + family-badge
 * overlay.
 *
 * Zone A of the product detail: CommerceMediaStage handles
 * paging/zoom/fullscreen only. CommerceDetailMediaRail overlays the
 * max-3-visible-controls (Back, Share, Save) + overflow (Fav, Watch,
 * Report). Reanimated shared values stay in the orchestrator and are
 * passed as props; this component forwards them to the media stage.
 */
export interface CommerceMediaHeroProps {
  images: string[] | undefined;
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
  familyStateAccent: string | null;
  onRailSave: () => void;
  onOverflow: () => void;
}

export function CommerceMediaHero({
  images,
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
  familyStateAccent,
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
        images={images}
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
        overlayTopContent={
          familyStateAccent ? (
            <View style={styles.familyBadgeOverlay}>
              <ProductFamilyBadge
                family="direct"
                stateAccent={familyStateAccent}
                compact
              />
            </View>
          ) : null
        }
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
            label: isSaved ? 'Saved to collection' : 'Save to collection',
            onPress: onRailSave,
            isActive: isSaved,
          },
        ]}
        onOverflow={onOverflow}
        showOverflow
      />
    </>
  );
}

const styles = StyleSheet.create({
  familyBadgeOverlay: {
    alignSelf: 'flex-start',
  },
});
