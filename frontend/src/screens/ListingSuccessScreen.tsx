import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Share,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Confetti } from '../components/Confetti';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { CachedImage } from '../components/CachedImage';
import { useAppTheme } from '../theme/ThemeContext';
import { Typography, Space, Type, Radius, FontSize } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { PremiumStatusPill } from '../components/ui/PremiumStatusPill';
import { fetchListingByIdFromApi } from '../services/listingsApi';

type Props = StackScreenProps<RootStackParamList, 'ListingSuccess'>;

export default function ListingSuccessScreen({ navigation, route }: Props) {
  const { isDark } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();

  const listingId = route.params?.listingId;
  const routeTitle = route.params?.title;
  const routePrice = typeof route.params?.price === 'number' ? route.params.price : null;
  const routeCategory = route.params?.categoryId;
  const routePhoto = route.params?.photoUri;

  const [backendListing, setBackendListing] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    const fetch = async () => {
      try {
        const res = await fetchListingByIdFromApi(listingId);
        if (!cancelled && res.ok && res.listing) {
          setBackendListing(res.listing);
        }
      } catch {
        // ignore — use route params as fallback
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetch();
    return () => { cancelled = true; };
  }, [listingId]);

  const listingTitle = backendListing?.title || routeTitle || 'your listing';
  const listingPriceRaw = backendListing?.priceGbp ?? routePrice;
  const listingPrice = listingPriceRaw != null ? formatFromFiat(listingPriceRaw, 'GBP', { displayMode: 'fiat' }) : null;
  const listingCategory = backendListing?.category || routeCategory;
  const listingPhoto = backendListing?.imageUrl || routePhoto;

  const status = backendListing?.status ?? 'active';
  const isActive = status === 'active';
  const isPaused = status === 'paused';
  const isSold = status === 'sold';
  const statusLabel = isActive ? 'Live now' : isPaused ? 'Paused' : isSold ? 'Sold' : status;
  const statusTone = isActive ? 'success' : isPaused ? 'pending' : isSold ? 'delivered' : 'pending';

  const handleShare = React.useCallback(async () => {
    if (!listingId) return;
    const url = `https://thryftverse.com/listing/${listingId}`;
    try {
      await Share.share(
        {
          url: Platform.OS === 'ios' ? url : undefined,
          message:
            Platform.OS === 'android'
              ? `Check out "${listingTitle}" on Thryftverse\n${url}`
              : `Check out "${listingTitle}" on Thryftverse`,
        },
        { dialogTitle: 'Share listing' }
      );
    } catch {
      // User cancelled share
    }
  }, [listingId, listingTitle]);

  const handleCreateAnother = React.useCallback(() => {
    navigation.navigate('Sell' as any);
  }, [navigation]);

  const handleViewListing = React.useCallback(() => {
    if (listingId) {
      navigation.push('ItemDetail', { itemId: listingId });
    }
  }, [navigation, listingId]);

  const handleManageListing = React.useCallback(() => {
    if (listingId) {
      navigation.push('ManageListing', { itemId: listingId });
    }
  }, [navigation, listingId]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Colors.background}
      />
      <Confetti />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Celebration Header */}
        <View style={styles.heroSection}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={64} color={Colors.brand} />
          </View>
          <Text style={styles.heroBigText}>Published</Text>
          <Text style={styles.heroSubText}>
            {isActive ? 'Your item is now live on Thryftverse.' : isPaused ? 'Your listing is paused and hidden from buyers.' : isSold ? 'Your item has been marked as sold.' : 'Your listing has been created.'}
          </Text>
          {listingPrice ? (
            <Text style={styles.heroMicroCopy}>{listingPrice}</Text>
          ) : null}
        </View>

        {/* Published status */}
        <View style={styles.statusRow}>
          <PremiumStatusPill tone={statusTone as any} label={statusLabel} icon="checkmark-circle" />
          {listingId ? (
            <Text style={styles.idText} numberOfLines={1}>
              {listingId}
            </Text>
          ) : null}
        </View>

        {/* Product preview card */}
        <ElevatedSurface variant="elevated" style={styles.summaryCard}>
          {listingPhoto ? (
            <CachedImage
              uri={listingPhoto}
              style={styles.summaryImage}
              containerStyle={styles.summaryImageWrap}
              contentFit="cover"
            />
          ) : (
            <View
              style={[styles.summaryImageWrap, styles.summaryImageFallback]}
            >
              <Ionicons
                name="bag-handle-outline"
                size={20}
                color={Colors.textMuted}
              />
            </View>
          )}
          <View style={styles.summaryBody}>
            <Text style={styles.summaryLabel}>published listing</Text>
            <Text style={styles.summaryTitle} numberOfLines={2}>
              {listingTitle}
            </Text>
            <Text style={styles.summaryMeta}>
              {listingPrice || 'price pending'}
              {listingCategory ? ` • ${listingCategory}` : ''}
            </Text>
          </View>
        </ElevatedSurface>

        {/* Actions */}
        <ElevatedSurface variant="surface" style={{ marginBottom: Space.xl }}>
        {listingId ? (
          <AnimatedPressable
            style={styles.actionRowBtn}
            activeOpacity={0.8}
            onPress={handleViewListing}
          >
            <View style={styles.actionLeft}>
              <View style={styles.actionIconBox}>
                <Ionicons
                  name="eye-outline"
                  size={20}
                  color={Colors.textPrimary}
                />
              </View>
              <Text style={styles.actionText}>view listing</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={Colors.textMuted}
            />
          </AnimatedPressable>
        ) : null}

        {listingId ? (
          <AnimatedPressable
            style={styles.actionRowBtn}
            activeOpacity={0.8}
            onPress={handleManageListing}
          >
            <View style={styles.actionLeft}>
              <View style={styles.actionIconBox}>
                <Ionicons
                  name="settings-outline"
                  size={20}
                  color={Colors.textPrimary}
                />
              </View>
              <Text style={styles.actionText}>manage listing</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={Colors.textMuted}
            />
          </AnimatedPressable>
        ) : null}

        {listingId ? (
          <AnimatedPressable
            style={styles.actionRowBtn}
            activeOpacity={0.8}
            onPress={handleShare}
          >
            <View style={styles.actionLeft}>
              <View style={styles.actionIconBox}>
                <Ionicons
                  name="share-outline"
                  size={20}
                  color={Colors.textPrimary}
                />
              </View>
              <Text style={styles.actionText}>share listing</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={Colors.textMuted}
            />
          </AnimatedPressable>
        ) : null}

        <AnimatedPressable
          style={styles.actionRowBtn}
          activeOpacity={0.8}
          onPress={handleCreateAnother}
        >
          <View style={styles.actionLeft}>
            <View style={styles.actionIconBox}>
              <Ionicons
                name="add-circle-outline"
                size={20}
                color={Colors.textPrimary}
              />
            </View>
            <Text style={styles.actionText}>create another listing</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={Colors.textMuted}
          />
        </AnimatedPressable>

        <AnimatedPressable
          style={styles.actionRowBtn}
          activeOpacity={0.8}
          onPress={() => navigation.replace('MainTabs')}
        >
          <View style={styles.actionLeft}>
            <View style={styles.actionIconBox}>
              <Ionicons
                name="home-outline"
                size={20}
                color={Colors.textPrimary}
              />
            </View>
            <Text style={styles.actionText}>back to feed</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={Colors.textMuted} />
        </AnimatedPressable>

        </ElevatedSurface>

        {/* Support link */}
        <AnimatedPressable
          style={styles.supportLink}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('HelpSupport')}
        >
          <Ionicons
            name="help-circle-outline"
            size={14}
            color={Colors.textMuted}
          />
          <Text style={styles.supportLinkText}>
            Need help? Visit the Help Centre
          </Text>
        </AnimatedPressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  content: { paddingHorizontal: Space.lg, paddingTop: Space.xxl, paddingBottom: Space.xxl },

  heroSection: {
    alignItems: 'center',
    marginBottom: Space.xl,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  heroBigText: {
    fontSize: FontSize.hero,
    lineHeight: FontSize.hero + 4,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -2.2,
    marginBottom: Space.xs,
  },
  heroSubText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  heroMicroCopy: {
    marginTop: Space.sm,
    fontSize: Type.body.size,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
    lineHeight: Type.body.lineHeight,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.lg,
    gap: Space.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: Colors.success + '14',
    borderWidth: 1,
    borderColor: Colors.success + '33',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.md,
  },
  statusText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
    color: Colors.success,
    textTransform: 'uppercase',
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  idText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    flexShrink: 1,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: Type.meta.letterSpacing,
  },

  summaryCard: {
    flexDirection: 'row',
    gap: Space.sm,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    marginBottom: Space.xl,
  },
  summaryImageWrap: {
    width: 72,
    height: 90,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  summaryImage: {
    width: '100%',
    height: '100%',
  },
  summaryImageFallback: {
    backgroundColor: Colors.surfaceAlt,
  },
  summaryBody: {
    flex: 1,
    justifyContent: 'center',
  },
  summaryLabel: {
    color: Colors.textMuted,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
    lineHeight: Type.meta.lineHeight,
  },
  summaryTitle: {
    marginTop: Space.xs,
    color: Colors.textPrimary,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
  },
  summaryMeta: {
    marginTop: Space.xs,
    color: Colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },

  actionRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  actionIconBox: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    lineHeight: Type.subtitle.lineHeight,
    letterSpacing: Type.subtitle.letterSpacing,
  },

  supportLink: {
    marginTop: Space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
  },
  supportLinkText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
});