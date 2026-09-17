/**
 * MediaPickerGrid — the media grid content area of the picker sheet.
 *
 * Owns the three content branches: the loading skeleton, the empty state,
 * and the populated grid (limited-access banner, ordered selection
 * preview rail, virtualized FlashList with camera hero header).
 *
 * Extracted from MediaPicker.tsx (pure move — no behavior change).
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  type ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import {
  FlashList,
  ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { AppIcon } from '../../../components/common/AppIcon';
import {
  IconGrammar } from '../../../theme/designTokens';
import {
  type ThemeColors } from '../../../theme/ThemeContext';
import { GRID_COLUMNS, createStyles } from './pickerShared';
import { MediaPickerSkeleton } from './MediaPickerStates';
import type { MediaAsset } from './mediaPickerTypes';

export function MediaPickerGrid({
  isLoading,
  isEmpty,
  isLimitedAccess,
  onManageLimitedAccess,
  selectedIds,
  assets,
  onToggleSelect,
  onTakePhoto,
  gridData,
  renderItem,
  onEndReached,
  onRefresh,
  isRefreshing,
  loadingMore,
  header,
  colors,
  styles }: {
  isLoading: boolean;
  isEmpty: boolean;
  /** iOS 14+ / Android 14+ limited photo access — shows the banner. */
  isLimitedAccess: boolean;
  onManageLimitedAccess: () => void;
  /** Ordered selection ids — preserved as an array (tap order). */
  selectedIds: string[];
  /** Full asset list — the rail resolves thumbnails by id. */
  assets: MediaAsset[];
  onToggleSelect: (asset: MediaAsset) => void;
  onTakePhoto: () => void;
  gridData: MediaAsset[];
  renderItem: ListRenderItem<MediaAsset>;
  onEndReached: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  loadingMore: boolean;
  /** ListHeaderComponent — the full-width camera hero. */
  header: React.ReactElement;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  if (isLoading) {
    return <MediaPickerSkeleton colors={colors} styles={styles} />;
  }

  if (isEmpty) {
    return (
      <View style={styles.mediaEmptyState}>
        <Text style={[styles.mediaEmptyTitle, { color: colors.textPrimary }]}>
          Camera access needed
        </Text>
        <Text style={[styles.mediaEmptySubtitle, { color: colors.textSecondary }]}>
          Enable the camera to capture items directly.
        </Text>
        <Pressable
          onPress={onTakePhoto}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Open camera"
          accessibilityHint="Opens the camera to capture a new photo"
          accessibilityRole="button"
        >
          <Text style={[styles.mediaEmptyLink, { color: colors.brand }]}>
            Open camera
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      {/* Limited-access banner (iOS 14+ / Android 14+) */}
      {isLimitedAccess && (
        <Pressable
          style={[styles.limitedAccessBanner, { borderColor: colors.border }]}
          onPress={onManageLimitedAccess}
          accessibilityLabel="Limited photo access — tap to select more photos"
          accessibilityHint="Opens the photo-access picker"
          accessibilityRole="button"
        >
          <AppIcon name="image-outline" size={IconGrammar.metadata} color="textSecondary" opticalCenter={true} accessible={false} />
          <Text style={[styles.limitedAccessText, { color: colors.textSecondary }]}>
            Limited access — tap to add more photos
          </Text>
          <Ionicons name="chevron-forward" size={IconGrammar.metadata} color={colors.textMuted} aria-hidden={true} />
        </Pressable>
      )}

      {/* Selection preview rail — ordered thumbnails with order badge + remove */}
      {selectedIds.length > 0 && (
        <View style={styles.selectionPreviewRail}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectionPreviewScroll}
          >
            {selectedIds.map((id, index) => {
              const asset = assets.find((a) => a.id === id);
              if (!asset) return null;
              const isMostRecent = index === selectedIds.length - 1;
              return (
                <View
                  key={id}
                  style={[styles.selectionPreviewItem, isMostRecent && styles.selectionPreviewItemSelected]}
                >
                  <Image
                    source={{ uri: asset.uri }}
                    style={styles.selectionPreviewThumb as ImageStyle}
                    contentFit="cover"
                  />
                  <View style={[styles.selectionPreviewOrder, { backgroundColor: colors.brand }]}>
                    <Text style={[styles.selectionPreviewOrderText, { color: colors.textInverse }]}>
                      {index + 1}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.selectionPreviewRemove, { backgroundColor: colors.dangerSubtle }]}
                    onPress={() => onToggleSelect(asset)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${asset.mediaType} ${index + 1} from selection`}
                    accessibilityHint="Deselects this item"
                    accessibilityRole="button"
                  >
                    <Ionicons name="close" size={12} color={colors.danger} aria-hidden={true} />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Full grid via FlashList for virtualization */}
      <FlashList
        data={gridData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={GRID_COLUMNS}
        contentContainerStyle={styles.mediaGridContent}
        ListHeaderComponent={header}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onRefresh={onRefresh}
        refreshing={isRefreshing}
        ListFooterComponent={loadingMore ? (
          <View style={styles.mediaGridFooter}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        ) : null}
      />
    </>
  );
}
