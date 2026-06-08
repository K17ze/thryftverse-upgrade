import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Share,
  Platform,
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
import { Typography } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';

type Props = StackScreenProps<RootStackParamList, 'ListingSuccess'>;

const PANEL_BG = Colors.surface;
const PANEL_ALT_BG = Colors.surfaceAlt;
const PANEL_BORDER = Colors.border;

export default function ListingSuccessScreen({ navigation, route }: Props) {
  const { isDark } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();

  const listingId = route.params?.listingId;
  const listingTitle = route.params?.title || 'your listing';
  const listingPriceRaw =
    typeof route.params?.price === 'number' ? route.params.price : null;
  const listingPrice = listingPriceRaw
    ? formatFromFiat(listingPriceRaw, 'GBP', { displayMode: 'fiat' })
    : null;
  const listingCategory = route.params?.categoryId;
  const listingPhoto = route.params?.photoUri;

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
    navigation.replace('MainTabs', { screen: 'Sell' } as any);
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
            Your item is now live on Thryftverse.
          </Text>
          {listingPrice ? (
            <Text style={styles.heroMicroCopy}>{listingPrice}</Text>
          ) : null}
        </View>

        {/* Published status */}
        <View style={styles.statusRow}>
          <View style={styles.statusBadge}>
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={Colors.success}
            />
            <Text style={styles.statusText}>Live now</Text>
          </View>
          {listingId ? (
            <Text style={styles.idText} numberOfLines={1}>
              ID: {listingId}
            </Text>
          ) : null}
        </View>

        {/* Product preview card */}
        <View style={styles.summaryCard}>
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
        </View>

        {/* Actions */}
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

  content: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 60 },

  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: PANEL_ALT_BG,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  heroBigText: {
    fontSize: 56,
    lineHeight: 60,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -2.2,
    marginBottom: 6,
  },
  heroSubText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    letterSpacing: 0.14,
  },
  heroMicroCopy: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.success + '14',
    borderWidth: 1,
    borderColor: Colors.success + '33',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontFamily: Typography.family.bold,
    color: Colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  idText: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    flexShrink: 1,
  },

  summaryCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    backgroundColor: PANEL_BG,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 28,
  },
  summaryImageWrap: {
    width: 72,
    height: 90,
    borderRadius: 12,
    backgroundColor: PANEL_ALT_BG,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  summaryImage: {
    width: '100%',
    height: '100%',
  },
  summaryImageFallback: {
    backgroundColor: PANEL_ALT_BG,
  },
  summaryBody: {
    flex: 1,
    justifyContent: 'center',
  },
  summaryLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryTitle: {
    marginTop: 4,
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: Typography.family.bold,
  },
  summaryMeta: {
    marginTop: 6,
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },

  actionRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: PANEL_BORDER,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PANEL_ALT_BG,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },

  supportLink: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  supportLinkText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
});
