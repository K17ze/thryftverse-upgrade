import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { openProfile } from '../../navigation/openProfile';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Radius, Space, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { SocialNotificationRow } from './SocialNotificationRow';
import { CommerceNotificationRow } from './CommerceNotificationRow';
import { AuctionNotificationRow } from './AuctionNotificationRow';
import { FinancialNotificationRow } from './FinancialNotificationRow';
import { SystemNotificationRow } from './SystemNotificationRow';
import type { NotificationCard } from './notificationViewModels';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface SwipeableNotificationRowProps {
  card: NotificationCard;
  currentUserId?: string;
  registerSwipeableRef: (id: string, ref: Swipeable | null) => void;
  onOpen: (card: NotificationCard) => void;
  onSwipeMarkRead: (card: NotificationCard) => void;
  onSwipeDismiss: (card: NotificationCard) => void;
}

/**
 * One notification row wrapped in a Swipeable. Swipe right reveals the
 * mark-as-read action; swipe left dismisses the notification. The inner
 * presenter is dispatched on the V2 event's semanticRole (social, commerce,
 * auction, financial, system).
 */
function SwipeableNotificationRowBase({
  card,
  currentUserId,
  registerSwipeableRef,
  onOpen,
  onSwipeMarkRead,
  onSwipeDismiss,
}: SwipeableNotificationRowProps) {
  const navigation = useNavigation<NavT>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  const swipeableRef = React.useRef<Swipeable | null>(null);

  const renderSwipeRightAction = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      if (card.read) return <View style={{ width: 0, height: Space.xxl + Space.xl }} />;
      // Subtle scale-up of the action icon as the swipe reveals it (0.8 → 1.0).
      // Collapsed to no scale when reduced motion is enabled.
      const iconScale = reducedMotion
        ? 1
        : progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.8, 1.0],
            extrapolate: 'clamp' });
      return (
        <View style={styles.swipeActionContainer}>
          <View style={styles.swipeReadAction}>
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
            </Animated.View>
            <Text style={styles.swipeReadText}>Read</Text>
          </View>
        </View>
      );
    },
    [card.read, colors.success, reducedMotion, styles]
  );

  const renderSwipeLeftAction = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      // Subtle scale-up of the action icon as the swipe reveals it (0.8 → 1.0).
      // Collapsed to no scale when reduced motion is enabled.
      const iconScale = reducedMotion
        ? 1
        : progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.8, 1.0],
            extrapolate: 'clamp' });
      return (
        <View style={styles.swipeActionContainer}>
          <View style={styles.swipeDeleteAction}>
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Animated.View>
            <Text style={styles.swipeDeleteText}>Clear</Text>
          </View>
        </View>
      );
    },
    [colors.danger, reducedMotion, styles]
  );

  const renderNotificationRow = useCallback(
    (item: NotificationCard) => {
      const v2Event = item.v2Event;
      const inAttention = item.requiresAction;
      const onPress = () => onOpen(item);

      switch (v2Event.semanticRole) {
        case 'social':
          return (
            <SocialNotificationRow
              event={v2Event}
              time={item.time}
              aggregatedCount={item.aggregatedCount}
              aggregatedActors={item.aggregatedActors}
              inAttentionSection={inAttention}
              onPress={onPress}
              onActorPress={
                item.actorUserId
                  ? () => openProfile(navigation, item.actorUserId!, currentUserId)
                  : undefined
              }
            />
          );
        case 'commerce':
          return (
            <CommerceNotificationRow
              event={v2Event}
              time={item.time}
              aggregatedCount={item.aggregatedCount}
              inAttentionSection={inAttention}
              onPress={onPress}
            />
          );
        case 'auction':
          return (
            <AuctionNotificationRow
              event={v2Event}
              time={item.time}
              aggregatedCount={item.aggregatedCount}
              inAttentionSection={inAttention}
              onPress={onPress}
              onAction={onPress}
            />
          );
        case 'financial':
          return (
            <FinancialNotificationRow
              event={v2Event}
              time={item.time}
              aggregatedCount={item.aggregatedCount}
              inAttentionSection={inAttention}
              onPress={onPress}
            />
          );
        case 'system':
        default:
          return (
            <SystemNotificationRow
              event={v2Event}
              time={item.time}
              aggregatedCount={item.aggregatedCount}
              inAttentionSection={inAttention}
              onPress={onPress}
              onAction={onPress}
            />
          );
      }
    },
    [onOpen, navigation, currentUserId]
  );

  return (
    <Swipeable
      ref={(ref) => {
        swipeableRef.current = ref;
        registerSwipeableRef(card.id, ref);
      }}
      renderRightActions={renderSwipeRightAction}
      renderLeftActions={renderSwipeLeftAction}
      onSwipeableRightOpen={() => {
        void onSwipeMarkRead(card);
        swipeableRef.current?.close();
      }}
      onSwipeableLeftOpen={() => {
        onSwipeDismiss(card);
        swipeableRef.current?.close();
      }}
      rightThreshold={80}
      leftThreshold={80}
      overshootRight={false}
      overshootLeft={false}
    >
      {renderNotificationRow(card)}
    </Swipeable>
  );
}

export const SwipeableNotificationRow = React.memo(SwipeableNotificationRowBase);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  swipeActionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: Space.xxl + Space.xl,
    marginBottom: Space.sm + 2 },
  swipeReadAction: {
    flex: 1,
    width: Space.xxl + Space.xl,
    borderRadius: Radius.xxl,
    backgroundColor: colors.successSubtle,
    borderWidth: Stroke.standard,
    borderColor: colors.successBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs },
  swipeReadText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.success },
  swipeDeleteAction: {
    alignItems: 'center',
    justifyContent: 'center',
    width: Space.xxl + Space.xxl + Space.xs,
    height: '100%',
    gap: Space.xs },
  swipeDeleteText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger },
  });
}
