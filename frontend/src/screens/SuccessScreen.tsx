import React from 'react';
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
import { Confetti } from '../components/Confetti';
import { useAppTheme } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { Typography } from '../theme/designTokens';
import { FlagshipActionCluster } from '../components/flagship';
import { Space, Radius } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { CommerceOrder, getOrder } from '../services/commerceApi';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { Elevation } from '../theme/designTokens';

type RouteT = RouteProp<RootStackParamList, 'Success'>;

export default function SuccessScreen() {
  const { colors, isDark } = useAppTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { orderId } = route.params;
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      {!reducedMotionEnabled && <Confetti />}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.centerContent}>
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400)} style={[styles.iconCircle, { backgroundColor: colors.success }]}>
            <Ionicons name="checkmark" size={48} color={colors.background} />
          </Reanimated.View>

          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400).delay(80)}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Payment Successful</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Your order has been placed.{ '\n' }
              {isLoading
                ? 'Fetching order details...'
                : hasError
                  ? 'Order confirmation received. You can view details from My Orders.'
                  : `Order #${orderId.slice(-8).toUpperCase()} confirmed. The seller will prepare your item for dispatch.`}
            </Text>
          </Reanimated.View>

          {/* Order Context Card */}
          {!isLoading && !hasError && order && (
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400).delay(120)} style={styles.orderCardWrap}>
              <ElevatedSurface variant="surface" style={[styles.orderCard, { backgroundColor: colors.surfaceAlt }]}>
                {order.listingImageUrl && (
                  <CachedImage
                    uri={getListingCoverUri([order.listingImageUrl], '')}
                    style={styles.orderImage}
                    contentFit="cover"
                  />
                )}
                <View style={styles.orderInfo}>
                  <Text style={[styles.orderTitle, { color: colors.textPrimary }]} numberOfLines={2}>{order.listingTitle}</Text>
                  <Text style={[styles.orderSeller, { color: colors.textSecondary }]}>from @{sellerName}</Text>
                  <Text style={[styles.orderAmount, { color: colors.textPrimary }]}>{formatFromFiat(order.totalGbp, 'GBP')}</Text>
                </View>
              </ElevatedSurface>
            </Reanimated.View>
          )}

          {/* What happens next — timeline */}
          {!isLoading && !hasError && order && (
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400).delay(160)} style={styles.timelineWrap}>
              <Text style={[styles.timelineTitle, { color: colors.textPrimary }]}>What happens next?</Text>
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
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400).delay(160)}
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
              <View style={[styles.supportIdentity, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={[styles.supportAvatarWrap, { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="help-circle-outline" size={20} color={colors.textSecondary} />
                </View>
                <Text style={[styles.supportText, { color: colors.textPrimary }]}>Need help with this order?</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </View>
            </AnimatedPressable>
          </Reanimated.View>
        </View>
      </ScrollView>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400).delay(240)} style={styles.footer}>
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
  icon: string;
  label: string;
  detail: string;
  isComplete: boolean;
  isActive?: boolean;
  isLast?: boolean;
}) {
  const { colors } = useAppTheme();
  const color = isComplete ? colors.success : isActive ? colors.brand : colors.textMuted;
  return (
    <View style={timelineStyles.step}>
      <View style={timelineStyles.iconCol}>
        <View style={[
          timelineStyles.iconWrap,
          { backgroundColor: colors.surfaceAlt },
          isComplete && { backgroundColor: colors.success },
          isActive && { backgroundColor: colors.brand },
        ]}>
          <Ionicons name={icon as any} size={14} color={isComplete || isActive ? colors.background : colors.textMuted} />
        </View>
        {!isLast && <View style={[
          timelineStyles.connector,
          { backgroundColor: colors.border },
          isComplete && { backgroundColor: colors.success },
        ]} />}
      </View>
      <View style={timelineStyles.textCol}>
        <Text style={[timelineStyles.label, { color: isComplete || isActive ? colors.textPrimary : colors.textMuted }]}>
          {label}
        </Text>
        <Text style={[timelineStyles.detail, { color: colors.textMuted }]}>{detail}</Text>
      </View>
    </View>
  );
}

const timelineStyles = StyleSheet.create({
  step: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 16,
  },
  iconCol: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connector: {
    width: 2,
    flex: 1,
    marginTop: 4,
    minHeight: 20,
  },
  textCol: {
    flex: 1,
    gap: 2,
    paddingBottom: 4,
  },
  label: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
  },
  detail: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    lineHeight: 16,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40, paddingBottom: 20 },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
  },

  title: { fontSize: 28, fontFamily: Typography.family.bold, marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 15, fontFamily: Typography.family.regular, textAlign: 'center', lineHeight: 22 },

  orderCardWrap: { width: '100%', marginTop: 24 },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius.lg,
  },
  orderImage: { width: 64, height: 64, borderRadius: Radius.md },
  orderInfo: { flex: 1, gap: 2 },
  orderTitle: { fontSize: 15, fontFamily: Typography.family.semibold },
  orderSeller: { fontSize: 13, fontFamily: Typography.family.regular },
  orderAmount: { fontSize: 15, fontFamily: Typography.family.bold, marginTop: 2 },

  timelineWrap: {
    width: '100%',
    marginTop: 28,
    paddingHorizontal: 4,
  },
  timelineTitle: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    marginBottom: 14,
    textAlign: 'left',
  },
  timeline: {
    paddingLeft: 4,
  },

  supportRowWrap: { marginTop: 24, width: '100%' },
  supportIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  supportAvatarWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  supportText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },

  footer: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
});