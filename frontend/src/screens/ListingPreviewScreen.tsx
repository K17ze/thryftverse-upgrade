import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography, Elevation } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { CachedImage } from '../components/CachedImage';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { PremiumStatusPill } from '../components/ui/PremiumStatusPill';
import { Meta, BodyEmphasis, Caption } from '../components/ui/Text';
import { useStore } from '../store/useStore';
import { uploadMedia } from '../services/mediaUpload';
import { createListingOnApi, createListingImageOnApi } from '../services/listingsApi';

type Props = StackScreenProps<RootStackParamList, 'ListingPreview'>;

const { width } = Dimensions.get('window');

export default function ListingPreviewScreen({ navigation, route }: Props) {
  const { preview } = route.params;
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const currentUser = useStore((s) => s.currentUser);

  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canPublish = useMemo(() => {
    return preview.title && preview.price !== undefined && preview.photos?.length > 0;
  }, [preview]);

  const handlePublish = useCallback(async () => {
    if (!canPublish) return;
    if (!currentUser?.id) {
      show('Sign in to publish a listing.', 'error');
      return;
    }

    haptic.heavy();
    setIsPublishing(true);
    setErrorMsg(null);

    try {
      // 1. Upload all media
      const uploadedUrls: string[] = [];
      for (let i = 0; i < preview.photos.length; i++) {
        const uri = preview.photos[i];
        if (uri.startsWith('http')) {
          uploadedUrls.push(uri);
        } else {
          const url = await uploadMedia(uri, 'listings');
          uploadedUrls.push(url);
        }
      }

      const coverImage = uploadedUrls[0] ?? '';
      const listingId = `listing_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      // 2. Create listing
      await createListingOnApi({
        id: listingId,
        sellerId: currentUser.id,
        title: preview.title.trim(),
        description: (preview.description ?? '').trim(),
        priceGbp: preview.price ?? 0,
        imageUrl: coverImage,
        status: 'active',
        category: preview.category || undefined,
        brand: preview.brand || undefined,
        size: preview.size || undefined,
        condition: preview.condition || undefined,
        originalPriceGbp: preview.originalPrice ? preview.originalPrice : undefined,
        shippingMethod: preview.shippingMethod || undefined,
        shippingPayer: preview.shippingPayer || undefined,
      });

      // 3. Create listing_images for all photos
      for (let i = 0; i < uploadedUrls.length; i++) {
        await createListingImageOnApi({
          id: `${listingId}_img_${i}`,
          listingId,
          imageUrl: uploadedUrls[i],
          sortOrder: i,
        });
      }

      show('Listing published', 'success');
      navigation.replace('ListingSuccess', {
        listingId,
        title: preview.title,
        price: preview.price,
        categoryId: preview.category,
        photoUri: coverImage,
      });
    } catch (e: unknown) {
      const msg = typeof e === 'object' && e && 'message' in e && typeof (e as Error).message === 'string' ? (e as Error).message : 'Failed to publish. Please try again.';
      setErrorMsg(msg);
      show(msg, 'error');
    } finally {
      setIsPublishing(false);
    }
  }, [canPublish, currentUser, preview, haptic, show, navigation]);

  const handleEdit = () => {
    haptic.light();
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title="Preview"
        onBack={() => navigation.goBack()}
        rightAction={
          <AnimatedPressable onPress={handleEdit} activeOpacity={0.7} scaleValue={0.95}>
            <Text style={styles.headerAction}>Edit</Text>
          </AnimatedPressable>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Photo hero */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(40)}>
          {preview.photos?.length > 0 ? (
            <View style={styles.hero}>
              <CachedImage
                uri={preview.photos[0]}
                style={styles.heroImage}
                contentFit="cover"
              />
              {preview.photos.length > 1 && (
                <View style={styles.photoCounter}>
                  <Caption color={Colors.background}>{preview.photos.length} photos</Caption>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.hero, styles.heroEmpty]}>
              <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
              <Caption color={Colors.textMuted}>No photos added</Caption>
            </View>
          )}
        </Reanimated.View>

        {/* Title & Price */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)} style={styles.card}>
          <BodyEmphasis style={styles.title}>{preview.title || 'Untitled listing'}</BodyEmphasis>
          {preview.price !== undefined && (
            <Text style={styles.price}>
              {formatFromFiat(preview.price, 'GBP', { displayMode: 'fiat' })}
            </Text>
          )}
          {preview.originalPrice !== undefined && preview.originalPrice > (preview.price ?? 0) && (
            <Text style={styles.originalPrice}>
              RRP {formatFromFiat(preview.originalPrice, 'GBP', { displayMode: 'fiat' })}
            </Text>
          )}
          {preview.brand && (
            <View style={styles.metaRow}>
              <PremiumStatusPill tone="paid" label={preview.brand} icon="pricetag-outline" />
              {preview.condition && (
                <PremiumStatusPill tone="delivered" label={preview.condition} icon="shield-checkmark-outline" />
              )}
            </View>
          )}
        </Reanimated.View>

        {/* Details */}
        {(preview.description || preview.size || preview.category) && (
          <Reanimated.View entering={FadeInDown.duration(300).delay(120)} style={styles.card}>
            <Meta color={Colors.textMuted} style={styles.sectionLabel}>DETAILS</Meta>
            {preview.description ? (
              <Text style={styles.description}>{preview.description}</Text>
            ) : null}
            <View style={styles.detailGrid}>
              {preview.category && (
                <View style={styles.detailItem}>
                  <Caption color={Colors.textMuted}>Category</Caption>
                  <Text style={styles.detailValue}>{preview.category}</Text>
                </View>
              )}
              {preview.size && (
                <View style={styles.detailItem}>
                  <Caption color={Colors.textMuted}>Size</Caption>
                  <Text style={styles.detailValue}>{preview.size}</Text>
                </View>
              )}
              {preview.shippingMethod && (
                <View style={styles.detailItem}>
                  <Caption color={Colors.textMuted}>Shipping</Caption>
                  <Text style={styles.detailValue}>
                    {preview.shippingMethod} · {preview.shippingPayer === 'seller' ? 'Free' : 'Buyer pays'}
                  </Text>
                </View>
              )}
            </View>
          </Reanimated.View>
        )}

        {/* Tags */}
        {preview.tags && preview.tags.length > 0 && (
          <Reanimated.View entering={FadeInDown.duration(300).delay(160)} style={styles.card}>
            <Meta color={Colors.textMuted} style={styles.sectionLabel}>TAGS</Meta>
            <View style={styles.tagRow}>
              {preview.tags.map((tag: string) => (
                <View key={tag} style={styles.tagPill}>
                  <Caption color={Colors.textSecondary}>{tag}</Caption>
                </View>
              ))}
            </View>
          </Reanimated.View>
        )}

        {/* Trust */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(200)} style={styles.trustCard}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.trustTitle}>Thryft Buyer Protection</Text>
            <Caption color={Colors.textMuted}>
              Buyers are covered for this listing. You will receive payment only after delivery is confirmed.
            </Caption>
          </View>
        </Reanimated.View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <AppButton
          title={isPublishing ? 'Publishing…' : 'Publish Listing'}
          variant="primary"
          size="lg"
          style={{ flex: 1 }}
          disabled={!canPublish || isPublishing}
          onPress={handlePublish}
          hapticFeedback="heavy"
          icon={isPublishing ? undefined : <Ionicons name="cloud-upload-outline" size={16} color={Colors.background} />}
        />
        <AnimatedPressable
          style={styles.draftBtn}
          onPress={() => { haptic.light(); navigation.goBack(); }}
          activeOpacity={0.8}
          scaleValue={0.96}
        >
          <Ionicons name="save-outline" size={20} color={Colors.textPrimary} />
          <Text style={styles.draftText}>Draft</Text>
        </AnimatedPressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    gap: Space.md,
  },
  headerAction: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  hero: {
    width: width - Space.md * 2,
    height: 280,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.sm,
  },
  photoCounter: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
    paddingVertical: 4,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    ...Elevation.subtle,
    gap: Space.sm,
  },
  title: {
    fontSize: Type.title.size,
    color: Colors.textPrimary,
    lineHeight: Type.title.lineHeight,
  },
  price: {
    fontSize: Type.priceLarge.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.priceLarge.letterSpacing,
  },
  originalPrice: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  metaRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  sectionLabel: {
    letterSpacing: 1.2,
    marginBottom: Space.xs,
  },
  description: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    lineHeight: Type.body.lineHeight + 4,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    marginTop: Space.sm,
  },
  detailItem: {
    minWidth: 100,
    gap: 4,
  },
  detailValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  tagPill: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  trustCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(52, 199, 89, 0.06)',
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(52, 199, 89, 0.2)',
  },
  trustTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.success,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  draftBtn: {
    width: 56,
    height: 48,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  draftText: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});