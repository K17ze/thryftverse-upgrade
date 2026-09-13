import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TabRail, SegmentedControl, type TabKey } from '../profile/ProfileTabRail';
import { COLLAPSED_BAR_HEIGHT } from '../../hooks/userprofile';
import type { UserProfileTab, UserProfileShopSegment } from '../../hooks/userprofile';

interface UserProfileStickyRailProps {
  scrollY: SharedValue<number>;
  stickyShared: SharedValue<boolean>;
  stickyThreshold: SharedValue<number>;
  reducedMotion: boolean;
  stickyRailVisible: boolean;
  tabs: { key: TabKey; label: string; count?: number }[];
  activeTab: UserProfileTab;
  shopSegment: UserProfileShopSegment;
  onTabChange: (tab: UserProfileTab) => void;
  onSegmentChange: (segment: UserProfileShopSegment) => void;
}

/**
 * Sticky tab rail — external overlay that fades in once the inline rail in
 * the list header scrolls past the collapsed header.
 */
export function UserProfileStickyRail({
  scrollY,
  stickyShared,
  stickyThreshold,
  reducedMotion,
  stickyRailVisible,
  tabs,
  activeTab,
  shopSegment,
  onTabChange,
  onSegmentChange,
}: UserProfileStickyRailProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const BG = colors.background;
  const BORDER = colors.border;

  const stickyRailStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: stickyShared.value ? 1 : 0 };
    const threshold = stickyThreshold.value;
    const opacity = interpolate(scrollY.value, [threshold - 20, threshold + 20], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  return (
    <Reanimated.View
      style={[styles.stickyRailWrap, { backgroundColor: BG, borderBottomColor: BORDER, top: insets.top + COLLAPSED_BAR_HEIGHT }, stickyRailStyle]}
      pointerEvents={stickyRailVisible ? 'auto' : 'none'}
    >
      <TabRail
        tabs={tabs}
        activeKey={activeTab as any}
        onChange={(k) => onTabChange(k)}
        reducedMotion={reducedMotion}
      />
      {activeTab === 'Listings' ? (
        <View style={styles.stickySegmentWrap}>
          <SegmentedControl
            segments={[{ key: 'forsale', label: 'For sale' }, { key: 'sold', label: 'Sold' }]}
            activeKey={shopSegment}
            onChange={(k) => onSegmentChange(k)}
            reducedMotion={reducedMotion}
          />
        </View>
      ) : null}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  stickyRailWrap: {
    position: 'absolute', left: 0, right: 0, zIndex: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stickySegmentWrap: { paddingHorizontal: Space.md, paddingVertical: Space.sm },
});
