import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { CachedImage } from '../CachedImage';
import { t } from '../../i18n';
import { makeOfferScreenStyles as styles } from './makeOfferScreenStyles';

export interface MakeOfferItemSummaryProps {
  title: string;
  price: number;
  itemImageUri: string | undefined;
  onMessageSeller: () => void;
}

/** Item summary row + quiet "Message seller" action for MakeOfferScreen.
 *  Flat canvas, no card — image, title, listed price, inline action. */
export function MakeOfferItemSummary({
  title,
  price,
  itemImageUri,
  onMessageSeller,
}: MakeOfferItemSummaryProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();

  return (
    <>
      {/* ── Item summary ──
          Compact, flat, no card. Image + title + listed price + message
          action. Per AGENTS.md surface budget: flat canvas, no cards. */}
      <View style={styles.itemSummary}>
        <View style={[styles.itemThumb, { backgroundColor: colors.surfaceAlt }]}>
          {itemImageUri ? (
            <CachedImage
              uri={itemImageUri}
              style={styles.itemThumbImage}
              contentFit="cover"
            />
          ) : (
            <Ionicons name="shirt-outline" size={24} color={colors.textMuted} />
          )}
        </View>
        <View style={styles.itemInfo}>
          <Text
            style={[styles.itemTitle, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          <Text style={[styles.itemListingPrice, { color: colors.textSecondary }]}>
            {t('makeOffer.item.listedAt', { amount: formatFromFiat(price, 'GBP') })}
          </Text>
        </View>
      </View>

      {/* ── Message seller action ──
          Inline quiet action, not a bordered chip. Per Design.md:
          quiet controls are transparent, no decorative chrome. */}
      <View>
      <Pressable
        style={styles.messageAction}
        onPress={onMessageSeller}
        accessibilityRole="button"
        accessibilityLabel={t('makeOffer.a11y.messageSeller')}
        accessibilityHint={t('makeOffer.a11y.opensChatSeller')}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textSecondary} />
        <Text style={[styles.messageActionText, { color: colors.textSecondary }]}>
          {t('makeOffer.action.messageSeller')}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
      </View>
    </>
  );
}
