import React from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommerceMediaStage } from '../commerce/CommerceMediaStage';
import {
  CommerceDetailIdentity,
  CommerceDetailMediaRail,
} from '../commerce/detail';
import type { AuctionDetail } from '../../services/marketApi';
import type { AuctionMediaItemView } from '../../utils/auctionDetailLogic';

interface Props {
  auction: AuctionDetail;
  mediaItems: AuctionMediaItemView[];
  scrollY: SharedValue<number>;
  isCompact: boolean;
  accessibilityLabel: string;
  isSavedToCollection: boolean;
  isLiked: boolean;
  activeIndex: number;
  onBack: () => void;
  onShare: () => void;
  onOpenCollectionPicker: () => void;
  onToggleLike: () => void;
  onActiveIndexChange: (index: number) => void;
  onOpenFullscreen: (index: number) => void;
  onOverflow: () => void;
}

/**
 * Zone A — media stage + collapsed media rail.
 *
 * CommerceMediaStage handles paging/zoom/fullscreen only.
 * CommerceDetailMediaRail overlays the max-3-visible-controls
 * (Back, Share, Save) + overflow (Watch, etc.). Spec 02 §A:
 * "Maximum visible utility controls over media: three." Spec 04
 * §1: "Watch is the auction participation state" — Watch lives in
 * the overflow sheet and the dock, not the media rail.
 */
export function AuctionDetailHero({
  auction,
  mediaItems,
  scrollY,
  isCompact,
  accessibilityLabel,
  isSavedToCollection,
  isLiked,
  activeIndex,
  onBack,
  onShare,
  onOpenCollectionPicker,
  onToggleLike,
  onActiveIndexChange,
  onOpenFullscreen,
  onOverflow,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <>
      <CommerceMediaStage
        media={mediaItems}
        objectId={auction.id}
        topInset={insets.top}
        scrollY={scrollY}
        onBack={onBack}
        onShare={onShare}
        onSave={onOpenCollectionPicker}
        onToggleFav={onToggleLike}
        isFav={isLiked}
        isSaved={isSavedToCollection}
        showDefaultControls={false}
        showThumbnailStrip={mediaItems.length > 1}
        heightFraction={isCompact ? 0.54 : 0.58}
        initialIndex={activeIndex}
        onActiveIndexChange={onActiveIndexChange}
        onOpenFullscreen={onOpenFullscreen}
        overlayBottomContent={
          <View accessible accessibilityLabel={accessibilityLabel}>
            <CommerceDetailIdentity
              family="auction"
              tone="media"
              density={isCompact ? 'compact' : 'standard'}
              eyebrow={auction.brand ?? auction.category ?? 'Auction lot'}
              title={auction.title}
              secondaryLine={auction.conditionLabel ?? undefined}
            />
          </View>
        }
      />
      <CommerceDetailMediaRail
        onBack={onBack}
        topInset={insets.top}
        rightActions={[
          {
            icon: 'share-outline',
            label: 'Share',
            onPress: onShare,
          },
          {
            icon: isSavedToCollection ? 'bookmark' : 'bookmark-outline',
            activeIcon: 'bookmark',
            label: isSavedToCollection ? 'Saved to collection' : 'Save to collection',
            onPress: onOpenCollectionPicker,
            isActive: isSavedToCollection,
          },
        ]}
        onOverflow={onOverflow}
        showOverflow
      />
    </>
  );
}
