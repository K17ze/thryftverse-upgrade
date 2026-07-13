import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';

import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Typography, DockConstants } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { haptics } from '../utils/haptics';
import { ImageViewer } from '../components/ImageViewer';
import { ListingIdentityBlock } from '../components/listing/ListingIdentityBlock';
import { ListingPreviewFooter } from '../components/listing/ListingPreviewFooter';
import { ListingQualityMeter } from '../components/listing/ListingQualityMeter';
import { calculateListingQuality } from '../utils/listingQuality';
import { CachedImage } from '../components/CachedImage';

type Props = StackScreenProps<RootStackParamList, 'ListingPreview'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_H * 0.65;

export default function ListingPreviewScreen({ navigation, route }: Props) {
  const { preview, origin } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const currentUser = useStore((s) => s.currentUser);

  const photos = preview?.photos ?? [];
  const title = preview?.title?.trim() || 'Untitled listing';
  const hasRealTitle = !!preview?.title?.trim();
  const priceText = preview?.price != null
    ? formatFromFiat(preview.price, 'GBP', { displayMode: 'fiat' })
    : null;
  const originalPriceText = preview?.originalPrice != null && preview.originalPrice > 0
    ? formatFromFiat(preview.originalPrice, 'GBP', { displayMode: 'fiat' })
    : null;
  const hasDiscount = priceText != null && originalPriceText != null && preview!.originalPrice! > (preview!.price ?? 0);

  const specs = useMemo(() => {
    const rows: { label: string; value: string }[] = [];
    if (preview?.size) rows.push({ label: 'Size', value: preview.size });
    if (preview?.condition) rows.push({ label: 'Condition', value: preview.condition });
    if (preview?.category) rows.push({ label: 'Category', value: preview.category });
    if (preview?.brand) rows.push({ label: 'Brand', value: preview.brand });
    if (preview?.shippingMethod) {
      const method = preview.shippingMethod.charAt(0).toUpperCase() + preview.shippingMethod.slice(1);
      const payer = preview.shippingPayer === 'seller' ? 'Free shipping' : 'Buyer pays';
      rows.push({ label: 'Shipping', value: `${method} · ${payer}` });
    } else {
      rows.push({ label: 'Shipping', value: 'Confirmed at checkout' });
    }
    return rows;
  }, [preview]);

  const description = preview?.description?.trim();
  const sellerName = currentUser?.displayName || currentUser?.username || 'You';
  const sellerAvatar = currentUser?.avatar || null;

  const handleBack = () => {
    haptics.press();
    navigation.goBack();
  };

  const modeLabel =
    preview.listingMode === 'auction' ? 'Auction' :
    preview.listingMode === 'co_own' ? 'Co-Own' :
    'Fixed price';

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── 1. EDGE-TO-EDGE MEDIA HERO ── */}
        <View style={styles.heroWrap}>
          {photos.length > 0 ? (
            <ImageViewer
              images={photos}
              height={HERO_HEIGHT}
              onIndexChange={() => {}}
            />
          ) : (
            <View style={[styles.heroWrap, styles.heroEmpty]}>
              <Ionicons name="image-outline" size={48} color={colors.textMuted} />
              <Text style={styles.heroEmptyText}>No photos added</Text>
            </View>
          )}

          {/* Top scrim + floating controls */}
          <View style={styles.topScrim} />
          <View style={[styles.floatingHeader, { paddingTop: Math.max(insets.top, 20) }]}>
            <Pressable
              style={styles.controlBtn}
              onPress={handleBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </Pressable>
            <Pressable
              style={styles.controlBtn}
              onPress={handleBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Edit"
            >
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          </View>

          {/* PREVIEW indicator */}
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>PREVIEW</Text>
          </View>
        </View>

        {/* Listing quality meter — seller guidance */}
        <ListingQualityMeter
          result={useMemo(() => calculateListingQuality({
            photos: preview?.photos ?? [],
            title: preview?.title ?? '',
            brand: preview?.brand ?? '',
            category: preview?.category ?? '',
            size: preview?.size ?? '',
            condition: preview?.condition ?? '',
            description: preview?.description ?? '',
            price: preview?.price != null ? String(preview.price) : '',
            originalPrice: preview?.originalPrice != null ? String(preview.originalPrice) : '',
            tags: [],
            shippingMethod: preview?.shippingMethod === 'standard' ? 'standard' : preview?.shippingMethod === 'express' ? 'express' : null,
            shippingPayer: preview?.shippingPayer === 'buyer' ? 'buyer' : preview?.shippingPayer === 'seller' ? 'seller' : null,
            listingMode: preview?.listingMode ?? 'sell_now',
          }), [preview])}
          compact
        />

        {/* ── 2. PRODUCT IDENTITY ── */}
        <ListingIdentityBlock
          brand={preview?.brand}
          title={title}
          price={priceText ?? '—'}
          originalPrice={hasDiscount ? originalPriceText : null}
          hasDiscount={hasDiscount}
        />

        {!hasRealTitle && (
          <Text style={styles.authoringHint}>Untitled listing — add a title before publishing.</Text>
        )}

        {/* ── 3. PURCHASE CONTEXT ── */}
        <View style={styles.contextRow}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text style={styles.contextText}>
            Payment and delivery options are confirmed at checkout.
          </Text>
        </View>

        {/* ── 4. SPECIFICATIONS ── */}
        {specs.length > 0 && (
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionHeading}>Specifications</Text>
            <View style={styles.specGrid}>
              {specs.map((spec, i) => (
                <View
                  key={spec.label}
                  style={[
                    styles.specRow,
                    i < specs.length - 1 && styles.specRowBorder,
                  ]}
                >
                  <Text style={styles.specLabel}>{spec.label}</Text>
                  <Text style={styles.specValue}>{spec.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── 5. DESCRIPTION ── */}
        <View style={styles.sectionGroup}>
          <Text style={styles.sectionHeading}>Description</Text>
          {description ? (
            <Text style={styles.descriptionText}>{description}</Text>
          ) : (
            <Text style={styles.descriptionPlaceholder}>
              No description added yet.
            </Text>
          )}
        </View>

        {/* ── 6. SELLER PREVIEW ── */}
        <View style={styles.sectionGroup}>
          <Text style={styles.sectionHeading}>Seller</Text>
          <View style={styles.sellerRow}>
            {sellerAvatar ? (
              <CachedImage
                uri={sellerAvatar}
                style={styles.sellerAvatar}
                containerStyle={{ width: 40, height: 40, borderRadius: 20 }}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.sellerAvatar, styles.sellerAvatarFallback]}>
                <Ionicons name="person" size={18} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.sellerInfo}>
              <Text style={styles.sellerName} numberOfLines={1}>{sellerName}</Text>
              <Text style={styles.sellerSubtext}>Seller preview</Text>
            </View>
          </View>
        </View>

        {/* ── 7. SHIPPING & PAYMENT ── */}
        <View style={styles.sectionGroup}>
          <Text style={styles.sectionHeading}>Shipping & Payment</Text>
          <View style={styles.specGrid}>
            <View style={[styles.specRow, styles.specRowBorder]}>
              <Text style={styles.specLabel}>Shipping method</Text>
              <Text style={styles.specValue}>
                {preview?.shippingMethod
                  ? preview.shippingMethod.charAt(0).toUpperCase() + preview.shippingMethod.slice(1)
                  : 'Confirmed at checkout'}
              </Text>
            </View>
            <View style={[styles.specRow, styles.specRowBorder]}>
              <Text style={styles.specLabel}>Shipping cost</Text>
              <Text style={styles.specValue}>
                {preview?.shippingPayer === 'seller'
                  ? 'Free shipping'
                  : preview?.shippingPayer === 'buyer'
                  ? 'Buyer pays'
                  : 'Confirmed at checkout'}
              </Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Payment</Text>
              <Text style={styles.specValue}>Through ThryftVerse checkout</Text>
            </View>
          </View>
        </View>

        <View style={{ height: DockConstants.singleActionHeight }} />
      </ScrollView>

      {/* ── 8. STICKY RETURN-TO-EDITOR FOOTER ── */}
      <ListingPreviewFooter
        origin={origin}
        onBack={handleBack}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  heroWrap: {
    width: SCREEN_W,
    height: HERO_HEIGHT,
    overflow: 'hidden',
  },
  heroEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  heroEmptyText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
  previewBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  previewBadgeText: {
    fontSize: 11,
    fontFamily: Typography.family.bold,
    color: '#fff',
    letterSpacing: 0.8,
  },
  authoringHint: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    fontStyle: 'italic',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  contextText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.regular,
  },
  sectionGroup: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  sectionHeading: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Space.sm,
  },
  specGrid: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden',
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  specRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  specLabel: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
  },
  specValue: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    textAlign: 'right',
    flexShrink: 1,
  },
  descriptionText: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    lineHeight: 22,
  },
  descriptionPlaceholder: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    fontStyle: 'italic',
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  sellerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  sellerAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInfo: {
    flex: 1,
  },
  sellerName: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
  },
  sellerSubtext: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
});