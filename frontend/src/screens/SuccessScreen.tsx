import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Confetti } from '../components/Confetti';
import { useToast } from '../context/ToastContext';
import { FlagshipActionCluster } from '../components/flagship';
import { RootStackParamList } from '../navigation/types';
import { CommerceOrder, getOrder } from '../services/commerceApi';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { Typography, Radius, Type, Space, Elevation, Stroke } from '../theme/designTokens';
type RouteT = RouteProp<RootStackParamList, 'Success'>;

export default function SuccessScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { orderId } = route.params;
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const reducedMotionEnabled = useReducedMotion();

  const [order, setOrder] = React.useState<CommerceOrder | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const fetchOrder = async () => {
      try {
        const fetched = await getOrder(orderId);
        if (!cancelled) {
          setOrder(fetched);
          setHasError(false);
        }
      } catch {
        if (!cancelled) {
          setHasError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void fetchOrder();
    return () => { cancelled = true; };
  }, [orderId]);

  const handleViewOrder = React.useCallback(() => {
    navigation.replace('OrderDetail', { orderId });
  }, [navigation, orderId]);

  const handleContinueBrowsing = React.useCallback(() => {
    navigation.navigate('MainTabs');
  }, [navigation]);

  const handleOpenSupport = React.useCallback(() => {
    navigation.navigate('OrderSupport', { orderId });
  }, [navigation, orderId]);

  const sellerName = order?.seller?.username ?? `Seller ${order?.sellerId?.slice(0, 8) ?? ''}`;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
      {!reducedMotionEnabled && <Confetti />}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.centerContent}>
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400)} style={styles.iconCircle}>
            <Ionicons name="checkmark" size={48} color={colors.background} />
          </Reanimated.View>

          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
            <Text style={styles.title}>Payment Successful</Text>
            <Text style={styles.subtitle}>
              Your order has been placed.{ '\n' }
              {isLoading
                ? 'Fetching order details...'
                : hasError
                  ? 'Order confirmation received. View details from My Orders.'
                  : `Order #${orderId.slice(-8).toUpperCase()} confirmed. The seller will prepare your item for dispatch.`}
            </Text>
          </Reanimated.View>

          {/* Order Context Card */}
          {!isLoading && !hasError && order && (
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={styles.orderCardWrap}>
              <ElevatedSurface variant="surface" style={styles.orderCard}>
                {order.listingImageUrl && (
                  <CachedImage
                    uri={getListingCoverUri([order.listingImageUrl], '')}
                    style={styles.orderImage}
                    contentFit="cover"
                  />
                )}
                <View style={styles.orderInfo}>
                  <Text style={styles.orderTitle} numberOfLines={2}>{order.listingTitle}</Text>
                  <Text style={styles.orderSeller}>from @{sellerName}</Text>
                  <Text style={styles.orderAmount}>{formatFromFiat(order.totalGbp, 'GBP')}</Text>
                </View>
              </ElevatedSurface>
            </Reanimated.View>
          )}

          {/* What happens next — timeline */}
          {!isLoading && !hasError && order && (
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={styles.timelineWrap}>
              <Text style={styles.timelineTitle}>What happens next?</Text>
              <View style={styles.timeline}>
                <TimelineStep
                  icon="checkmark-circle"
                  label="Order placed"
                  detail="We've notified the seller"
                  isComplete
                />
                <TimelineStep
                  icon="cube-outline"
                  label="Seller prepares item"
                  detail="Usually within 1-2 business days"
                  isComplete={false}
                  isActive
                />
                <TimelineStep
                  icon="airplane-outline"
                  label="Item shipped"
                  detail="You'll get tracking updates in chat"
                  isComplete={false}
                />
                <TimelineStep
                  icon="home-outline"
                  label="Delivered"
                  detail="Leave a review once you receive it"
                  isComplete={false}
                  isLast
                />
              </View>
            </Reanimated.View>
          )}

          {/* Support Action */}
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}
            style={styles.supportRowWrap}
          >
            <AnimatedPressable
              onPress={handleOpenSupport}
              activeOpacity={0.85}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Open order support"
            >
              <View style={styles.supportIdentity}>
                <View style={[styles.supportAvatarWrap, { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="help-circle-outline" size={20} color={colors.textSecondary} />
                </View>
                <Text style={styles.supportText}>Need help with this order?</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </View>
            </AnimatedPressable>
          </Reanimated.View>
        </View>
      </ScrollView>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={styles.footer}>
        <FlagshipActionCluster
          actions={[
            { label: 'View Order', onPress: handleViewOrder, variant: 'primary' },
            { label: 'Continue Browsing', onPress: handleContinueBrowsing, variant: 'secondary' },
          ]}
          layout="stack"
        />
      </Reanimated.View>
    </SafeAreaView>
  );
}

// ── Timeline step ────────────────────────────────────────────────────────────

function TimelineStep({
  icon,
  label,
  detail,
  isComplete,
  isActive,
  isLast,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  detail: string;
  isComplete: boolean;
  isActive?: boolean;
  isLast?: boolean;
}) {
  const { colors } = useAppTheme();
  const timelineStyles = useMemo(() => createTimelineStyles(colors), [colors]);
  const color = isComplete ? colors.success : isActive ? colors.brand : colors.textMuted;
  return (
    <View style={timelineStyles.step}>
      <View style={timelineStyles.iconCol}>
        <View style={[
          timelineStyles.iconWrap,
          isComplete && timelineStyles.iconWrapComplete,
          isActive && timelineStyles.iconWrapActive,
        ]}>
          <Ionicons name={icon} size={14} color={isComplete || isActive ? colors.background : colors.textMuted} />
        </View>
        {!isLast && <View style={[
          timelineStyles.connector,
          isComplete && timelineStyles.connectorComplete,
        ]} />}
      </View>
      <View style={timelineStyles.textCol}>
        <Text style={[timelineStyles.label, { color: isComplete || isActive ? colors.textPrimary : colors.textMuted }]}>
          {label}
        </Text>
        <Text style={timelineStyles.detail}>{detail}</Text>
      </View>
    </View>
  );
}

function createTimelineStyles(colors: ThemeColors) {
  return StyleSheet.create({
  step: {
    flexDirection: 'row',
    gap: Space.smMd,
    paddingBottom: Space.md,
  },
  iconCol: {
    alignItems: 'center',
  },
  iconWrap: {
    width: Space.lg + 4,
    height: Space.lg + 4,
    borderRadius: Radius.xl,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapComplete: {
    backgroundColor: colors.success,
  },
  iconWrapActive: {
    backgroundColor: colors.brand,
  },
  connector: {
    width: Stroke.standard,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: Space.xs,
    minHeight: Space.md + 4,
  },
  connectorComplete: {
    backgroundColor: colors.success,
  },
  textCol: {
    flex: 1,
    gap: Space.xs / 2,
    paddingBottom: Space.xs,
  },
  label: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  detail: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    lineHeight: Type.caption.size + 4,
  },
  });
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, paddingHorizontal: Space.lg },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: Space.xl + Space.xl - 8, paddingBottom: 20 },
  iconCircle: {
    width: Space.xxl + Space.xxl + Space.xxl, height: Space.xxl + Space.xxl + Space.xxl, borderRadius: Radius.full,
    backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Space.xl,
  },

  title: { fontSize: Type.priceLarge.size, fontFamily: Typography.family.bold, color: colors.textPrimary, marginBottom: Space.smMd, textAlign: 'center' },
  subtitle: { fontSize: Type.bodyEmphasis.size, fontFamily: Typography.family.regular, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  orderCardWrap: { width: '100%', marginTop: Space.lg },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    padding: Space.smMd,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  orderImage: { width: Space.xxl + Space.xl + Space.xs, height: Space.xxl + Space.xl + Space.xs, borderRadius: Radius.md },
  orderInfo: { flex: 1, gap: 2 },
  orderTitle: { fontSize: Type.bodyEmphasis.size, fontFamily: Typography.family.semibold, color: colors.textPrimary },
  orderSeller: { fontSize: Type.captionElevated.size, fontFamily: Typography.family.regular, color: colors.textSecondary },
  orderAmount: { fontSize: Type.bodyEmphasis.size, fontFamily: Typography.family.bold, color: colors.textPrimary, marginTop: 2 },

  timelineWrap: {
    width: '100%',
    marginTop: Space.xl + 4,
    paddingHorizontal: Space.xs,
  },
  timelineTitle: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    marginBottom: Space.sm + 2,
    textAlign: 'left',
  },
  timeline: {
    paddingLeft: Space.xs,
  },

  supportRowWrap: { marginTop: Space.lg, width: '100%' },
  supportIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.xs + 2,
  },
  supportAvatarWrap: {
    width: Space.lg + 4,
    height: Space.lg + 4,
    borderRadius: Radius.xl,
  },
  supportText: {
    flex: 1,
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },

  footer: { paddingHorizontal: Space.lg, paddingBottom: Space.xl + Space.xl - 8, gap: 12 },
  });
}