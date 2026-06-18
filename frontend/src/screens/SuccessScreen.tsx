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
import { ActiveTheme, Colors } from '../constants/colors';
import { Confetti } from '../components/Confetti';
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

type RouteT = RouteProp<RootStackParamList, 'Success'>;

export default function SuccessScreen() {
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
      {!reducedMotionEnabled && <Confetti />}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.centerContent}>
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400)} style={styles.iconCircle}>
            <Ionicons name="checkmark" size={48} color={Colors.background} />
          </Reanimated.View>

          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400).delay(80)}>
            <Text style={styles.title}>Payment Successful</Text>
            <Text style={styles.subtitle}>
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
              <View style={styles.supportIdentity}>
                <View style={[styles.supportAvatarWrap, { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="help-circle-outline" size={20} color={Colors.textSecondary} />
                </View>
                <Text style={styles.supportText}>Need help with this order?</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40, paddingBottom: 20 },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
  },

  title: { fontSize: 28, fontFamily: Typography.family.bold, color: Colors.textPrimary, marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 15, fontFamily: Typography.family.regular, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  orderCardWrap: { width: '100%', marginTop: 24 },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
  },
  orderImage: { width: 64, height: 64, borderRadius: Radius.md },
  orderInfo: { flex: 1, gap: 2 },
  orderTitle: { fontSize: 15, fontFamily: Typography.family.semibold, color: Colors.textPrimary },
  orderSeller: { fontSize: 13, fontFamily: Typography.family.regular, color: Colors.textSecondary },
  orderAmount: { fontSize: 15, fontFamily: Typography.family.bold, color: Colors.textPrimary, marginTop: 2 },

  supportRowWrap: { marginTop: 24, width: '100%' },
  supportIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
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
    color: Colors.textPrimary,
  },

  footer: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
});