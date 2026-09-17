/**
 * MediaGrid — the populated content branch of the MediaBrowser sheet:
 * the limited-access banner (when applicable) above the FlashList grid.
 *
 * Extracted from MediaBrowserSheet — pure extraction, no behavior change.
 */
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { GRID_COLUMNS, type GridItem } from './mediaBrowserTypes';
import { LimitedAccessBanner } from './MediaBrowserChrome';
import type { MediaBrowserStyles } from './mediaBrowserStyles';

interface MediaGridProps {
  /** Whether the library grant is limited (iOS 14+ / Android 14+). */
  isLimited: boolean;
  onManageLimitedAccess: () => void;
  gridData: GridItem[];
  renderItem: ListRenderItem<GridItem>;
  onEndReached: () => void;
  loadingMore: boolean;
  colors: ThemeColors;
  styles: MediaBrowserStyles;
}

export function MediaGrid({
  isLimited,
  onManageLimitedAccess,
  gridData,
  renderItem,
  onEndReached,
  loadingMore,
  colors,
  styles }: MediaGridProps) {
  return (
    <>
      {/* Limited-access banner (iOS 14+ / Android 14+) */}
      {isLimited && (
        <LimitedAccessBanner onPress={onManageLimitedAccess} colors={colors} styles={styles} />
      )}

      {/* Media grid via FlashList */}
      <FlashList
        data={gridData}
        keyExtractor={(item) => (typeof item === 'string' ? item : item.id)}
        renderItem={renderItem}
        numColumns={GRID_COLUMNS}
        contentContainerStyle={styles.gridContent}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.gridFooter}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : null
        }
      />
    </>
  );
}
