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
import { isVideoUri } from '../utils/media';
import { ListingMediaDraftItem } from '../utils/mediaUploadAsset';

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

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canPublish = useMemo(() => {
    return preview.title && preview.price !== undefined && (preview.mediaDraftItems?.length ?? preview.photos?.length) > 0;
  }, [preview]);

  const mediaItems: ListingMediaDraftItem[] = useMemo(() => {
    if (preview.mediaDraftItems && preview.mediaDraftItems.length > 0) return preview.mediaDraftItems;
    return preview.photos.map((uri) => ({
      id: `preview_${uri}`,
      uri,
      kind: isVideoUri(uri) ? 'video' : 'image',
      source: uri.startsWith('http') ? 'remote' : 'local',
      fileName: 'preview',
      mimeType: isVideoUri(uri) ? 'video/mp4' : 'image/jpeg',
      status: uri.startsWith('http') ? 'uploaded' : 'draft',
      publicUrl: uri.startsWith('http') ? uri : undefined,
    }));
  }, [preview.mediaDraftItems, preview.photos]);

  const coverUri = mediaItems[0]?.publicUrl || mediaItems[0]?.uri || '';
  const hasVideo = mediaItems.some((m) => m.kind === 'video' || isVideoUri(m.uri));

  const handlePublish = useCallback(() => {
    // Preview defers to SellScreen's orchestrated publication flow
    haptic.heavy();
    navigation.goBack();
  }, [haptic, navigation]);

  const handleEdit = () => {
    haptic.light();
    navigation.goBack();
  };

  const modeLabel =
    preview.listingMode === 'auction' ? 'Auction' :
    preview.listingMode === 'co_own' ? 'Co-Own' :
    'Fixed price';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title="Preview"
        subtitle="Buyers will see this"
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
          {mediaItems.length > 0 ? (
            <View style={styles.hero}>
              <CachedImage
                uri={coverUri}
                style={styles.heroImage}
                contentFit="cover"
              />
              {mediaItems.length > 1 && (
                <View style={styles.photoCounter}>
                  <Caption color={Colors.background}>{mediaItems.length} media</Caption>
                </View>
              )}
              {hasVideo && (
                <View style={[styles.photoCounter, { right: 'auto', left: Space.sm }]}>
                  <Ionicons name="play-circle" size={16} color="#fff" />
                  <Caption color={Colors.background} style={{ marginLeft: 4 }}>Video</Caption>
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
          <View style={styles.metaRow}>
            {preview.brand && (
              <PremiumStatusPill tone="paid" label={preview.brand} icon="pricetag-outline" />
            )}
            <PremiumStatusPill tone="neutral" label={modeLabel} icon="pricetag-outline" />
          </View>
        </Reanimated.View>

        {/* Details */}
        {(preview.description || preview.size || preview.category) && (
          <Reanimated.View entering={FadeInDown.duration(300).delay(120)} style={styles.card}>
            <Meta color={Colors.textMuted} style={styles.sectionLabel}>DETAILS</Meta>
            {preview.description ? (
              <Text style={styles.description}>{preview.description}</Text>
            ) : null}
            <View style={styles.detailGrid}>
              {preview.brand && (
                <View style={styles.detailItem}>
                  <Caption color={Colors.textMuted}>Brand</Caption>
                  <Text style={styles.detailValue}>{preview.brand}</Text>
                </View>
              )}
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
              {preview.condition && (
                <View style={styles.detailItem}>
                  <Caption color={Colors.textMuted}>Condition</Caption>
                  <Text style={styles.detailValue}>{preview.condition}</Text>
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

        {/* Seller identity */}
        {currentUser && (
          <Reanimated.View entering={FadeInDown.duration(300).delay(160)} style={styles.sellerRow}>
            <View style={styles.sellerAvatarFallback}>
              <Ionicons name="person" size={16} color={Colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sellerName}>{currentUser.displayName || currentUser.username || 'You'}</Text>
              <Caption color={Colors.textMuted}>Seller</Caption>
            </View>
          </Reanimated.View>
        )}

        {/* Edit jumps */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(200)} style={styles.card}>
          <Meta color={Colors.textMuted} style={styles.sectionLabel}>EDIT</Meta>
          <View style={styles.editJumpRow}>
            <AnimatedPressable style={styles.editJumpBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Ionicons name="images-outline" size={16} color={Colors.textPrimary} />
              <Caption color={Colors.textPrimary}>Media</Caption>
            </AnimatedPressable>
            <AnimatedPressable style={styles.editJumpBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Ionicons name="document-text-outline" size={16} color={Colors.textPrimary} />
              <Caption color={Colors.textPrimary}>Details</Caption>
            </AnimatedPressable>
            <AnimatedPressable style={styles.editJumpBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Ionicons name="cash-outline" size={16} color={Colors.textPrimary} />
              <Caption color={Colors.textPrimary}>Pricing</Caption>
            </AnimatedPressable>
            <AnimatedPressable style={styles.editJumpBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Ionicons name="cube-outline" size={16} color={Colors.textPrimary} />
              <Caption color={Colors.textPrimary}>Shipping</Caption>
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        {/* Trust — neutral */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(240)} style={styles.trustCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color={Colors.textMuted} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.trustTitle}>Secure payment & tracked delivery</Text>
            <Caption color={Colors.textMuted}>
              Payment and delivery options are confirmed at checkout.
            </Caption>
          </View>
        </Reanimated.View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom action bar — no direct publish from preview; defer to SellScreen orchestrator */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <AppButton
          title="Back to editor"
          variant="primary"
          size="lg"
          style={{ flex: 1 }}
          onPress={handlePublish}
          hapticFeedback="heavy"
          icon={<Ionicons name="create-outline" size={16} color={Colors.background} />}
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
  editJumpRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  editJumpBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  trustCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
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
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  sellerAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerName: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});