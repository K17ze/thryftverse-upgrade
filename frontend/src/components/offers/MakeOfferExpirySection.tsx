import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { t } from '../../i18n';
import { makeOfferScreenStyles as styles } from './makeOfferScreenStyles';

export interface MakeOfferExpirySectionProps {
  expiryHours: number;
  onSelect: (hours: number) => void;
}

/** Offer expiry selector for MakeOfferScreen: clean chip selector with
 *  selection state — selected uses brand fill, unselected uses
 *  surfaceAlt. */
export function MakeOfferExpirySection({
  expiryHours,
  onSelect,
}: MakeOfferExpirySectionProps) {
  const { colors } = useAppTheme();
  const expiryOptions = [24, 48, 72];

  return (
    /* ── Offer expiry ──
       Clean chip selector with selection state. Per Design.md:
       selected state uses brand fill, unselected uses surfaceAlt. */
    <View>
    <View style={styles.expirySection}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        {t('makeOffer.expiry.validFor')}
      </Text>
      <View style={styles.expiryRow}>
        {expiryOptions.map((hours) => {
          const isActive = expiryHours === hours;
          return (
            <Pressable
              key={hours}
              style={[
                styles.expiryChip,
                { backgroundColor: isActive ? colors.brand : colors.surfaceAlt,
                  borderColor: isActive ? colors.brand : colors.borderSubtle },
              ]}
              onPress={() => onSelect(hours)}
              accessibilityRole="button"
              accessibilityLabel={t('makeOffer.a11y.offerValidFor', { hours })}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[
                styles.expiryChipText,
                { color: isActive ? colors.textInverse : colors.textSecondary },
              ]}>
                {hours}h
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.expiryHint, { color: colors.textMuted }]}>
        {t('makeOffer.expiry.hint', { hours: expiryHours })}
      </Text>
    </View>
    </View>
  );
}
