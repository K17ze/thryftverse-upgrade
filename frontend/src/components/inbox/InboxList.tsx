import React, { useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashList, type FlashListProps, type FlashListRef } from '@shopify/flash-list';
import Reanimated, { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { AnimatedPressable } from '../AnimatedPressable';
import { SkeletonLoader } from '../SkeletonLoader';
import { RefreshIndicator } from '../RefreshIndicator';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { Conversation } from '../../domain';
import { RootStackParamList } from '../../navigation/types';

type NavT = NativeStackNavigationProp<RootStackParamList>;

const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList) as unknown as React.ComponentClass<FlashListProps<Conversation>>;

export interface InboxListProps {
  listRef: React.RefObject<FlashListRef<Conversation> | null>;
  data: Conversation[];
  renderItem: FlashListProps<Conversation>['renderItem'];
  refreshing: boolean;
  onRefresh: () => void;
  isLoading: boolean;
  showRequestsBanner: boolean;
  requestsCount: number;
  emptyComponent: FlashListProps<Conversation>['ListEmptyComponent'];
}

export function InboxList({
  listRef,
  data,
  renderItem,
  refreshing,
  onRefresh,
  isLoading,
  showRequestsBanner,
  requestsCount,
  emptyComponent,
}: InboxListProps) {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const reducedMotion = useReducedMotion();
  const t = useMemo(() => ({
    requestsAvatar: { backgroundColor: colors.brandSubtle },
    requestsBadge: { backgroundColor: colors.textPrimary },
    requestsBadgeText: { color: colors.textInverse },
    requestsBannerText: { color: colors.textPrimary },
    requestsBannerSub: { color: colors.textMuted },
  }), [colors]);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      if (!reducedMotion) {
        scrollY.value = e.contentOffset.y;
      }
    },
  });

  return (
    <View style={{ flex: 1 }}>
      <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />
      {isLoading && !data.length ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <SkeletonLoader width={40} height={40} borderRadius={RadiusRoleValue.pillAvatar} />
              <View style={styles.skeletonText}>
                <SkeletonLoader width="70%" height={16} borderRadius={RadiusRoleValue.compactControl} />
                <SkeletonLoader width="40%" height={14} borderRadius={RadiusRoleValue.compactControl} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <>
          {showRequestsBanner && (
            <View style={styles.requestsBanner}>
              <AnimatedPressable
                onPress={() => navigation.navigate('MessageRequests')}
                activeOpacity={0.85}
                scaleValue={0.98}
                hapticFeedback="light"
                accessibilityLabel={`${requestsCount} message requests`}
                accessibilityRole="button"
                style={styles.requestsBannerTap}
              >
                <View style={[styles.requestsAvatar, t.requestsAvatar]}>
                  <Ionicons name="mail-unread-outline" size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.requestsBannerText, t.requestsBannerText]}>Message Requests</Text>
                  <Text style={[styles.requestsBannerSub, t.requestsBannerSub]}>
                    {requestsCount} pending {requestsCount === 1 ? 'request' : 'requests'}
                  </Text>
                </View>
                <View style={[styles.requestsBadge, t.requestsBadge]}>
                  <Text style={[styles.requestsBadgeText, t.requestsBadgeText]}>{requestsCount}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </AnimatedPressable>
            </View>
          )}
          <AnimatedFlashList
            ref={listRef as unknown as React.Ref<React.Component<FlashListProps<Conversation>>>}
            data={data}
            keyExtractor={(c: Conversation) => c.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            renderItem={renderItem}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="transparent"
                colors={['transparent']}
                progressBackgroundColor="transparent"
              />
            }
            ListEmptyComponent={emptyComponent}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: Space.xxl + 24,
    flexGrow: 1,
    paddingTop: Space.xs + 2,
  },
  skeletonList: {
    paddingHorizontal: Space.md + 4,
    paddingTop: Space.md,
    gap: Space.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 6,
  },
  skeletonText: {
    flex: 1,
    gap: Space.xs + 2,
  },
  requestsBanner: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  requestsBannerTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
  },
  requestsAvatar: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: RadiusRoleValue.pillAvatar,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestsBadge: {
    width: Space.lg,
    height: Space.lg,
    borderRadius: RadiusRoleValue.compactControl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestsBadgeText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.bold,
  },
  requestsBannerText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  requestsBannerSub: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    marginTop: Space.xs / 2,
  },
});
