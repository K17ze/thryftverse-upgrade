import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { formatCountryPolicyScope } from '../utils/capabilityPolicy';
import { CapabilityCarrier, getUserCountryCapabilities } from '../services/capabilitiesApi';
import { SettingsHeader } from '../components/settings/SettingsHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import { SettingsCell } from '../components/SettingsCell';
import { RadioButton } from '../components/settings/RadioButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Typography } from '../constants/typography';

type Props = StackScreenProps<RootStackParamList, 'Postage'>;

const CARRIERS = [
  { key: 'evri', label: 'Evri', priceFromGBP: 2.89, selected: true },
  { key: 'royal', label: 'Royal Mail', priceFromGBP: 3.35, selected: false },
  { key: 'dpd', label: 'DPD', priceFromGBP: 4.5, selected: false },
  { key: 'inpost', label: 'InPost', priceFromGBP: 2.99, selected: false },
];

function mapCapabilityCarriers(carriers: CapabilityCarrier[]) {
  return carriers.map((carrier, index) => ({
    key: carrier.id,
    label: carrier.label,
    priceFromGBP: carrier.priceFromGbp,
    selected: index === 0,
  }));
}

export default function PostageScreen({ navigation }: Props) {
  const currentUser = useStore((state) => state.currentUser);
  const { show } = useToast();
  const postagePreferences = useStore((state) => state.postagePreferences);
  const updatePostagePreferences = useStore((state) => state.updatePostagePreferences);
  const { formatFromFiat } = useFormattedPrice();
  const [carriers, setCarriers] = useState(CARRIERS);
  const [carrierScopeLabel, setCarrierScopeLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hydrateCountryCarriers = async () => {
      if (!currentUser?.id) {
        setCarriers(CARRIERS);
        setCarrierScopeLabel(null);
        return;
      }
      try {
        const capabilities = await getUserCountryCapabilities(currentUser.id);
        if (cancelled) return;
        const nextCarriers =
          capabilities.postage.carriers.length > 0
            ? mapCapabilityCarriers(capabilities.postage.carriers)
            : CARRIERS;
        setCarriers(nextCarriers.map((c) => ({ ...c, selected: c.key === postagePreferences.carrierKey })));
        setCarrierScopeLabel(formatCountryPolicyScope(capabilities));
      } catch {
        if (!cancelled) {
          setCarriers(CARRIERS.map((c) => ({ ...c, selected: c.key === postagePreferences.carrierKey })));
          setCarrierScopeLabel(null);
        }
      }
    };
    void hydrateCountryCarriers();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const selectCarrier = (key: string) => {
    setCarriers((prev) => prev.map((c) => ({ ...c, selected: c.key === key })));
    updatePostagePreferences({ carrierKey: key });
  };

  const freeShipping = postagePreferences.freeShipping;
  const bundleDiscount = postagePreferences.bundleDiscount;
  const selectedCarrier = carriers.find((c) => c.selected);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <SettingsHeader
        title="Postage"
        onBack={() => navigation.goBack()}
        rightAction={
          <AnimatedPressable onPress={() => { show('Postage preferences saved', 'success'); navigation.goBack(); }} hapticFeedback="light" scaleValue={0.98}>
            <View style={styles.saveBtnContainer}>
              <Text style={styles.saveBtnText}>Save</Text>
            </View>
          </AnimatedPressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Default Carrier */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <Text style={styles.sectionTitle}>Default Carrier</Text>
          {carrierScopeLabel ? (
            <Text style={styles.scopeLabel}>Region policy: {carrierScopeLabel}</Text>
          ) : null}
          <SettingsCard>
            {carriers.map((c, idx) => (
              <AnimatedPressable
                key={c.key}
                style={[styles.carrierRow, c.selected && { backgroundColor: `${Colors.brand}10` }, idx < carriers.length - 1 && styles.carrierRowBorder]}
                onPress={() => selectCarrier(c.key)}
                hapticFeedback="light"
                accessibilityRole="radio"
                accessibilityState={{ checked: c.selected }}
                accessibilityLabel={`${c.label}, from ${formatFromFiat(c.priceFromGBP, 'GBP', { displayMode: 'fiat' })}`}
              >
                <View style={styles.carrierText}>
                  <Text style={[styles.carrierLabel, c.selected && { fontFamily: Typography.family.semibold }]}>{c.label}</Text>
                  <Text style={styles.carrierPrice}>
                    from {formatFromFiat(c.priceFromGBP, 'GBP', { displayMode: 'fiat' })}
                  </Text>
                </View>
                {c.selected ? (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>Selected</Text>
                  </View>
                ) : null}
                <RadioButton selected={c.selected} />
              </AnimatedPressable>
            ))}
          </SettingsCard>
        </Reanimated.View>

        {/* Shipping Options */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
          <Text style={styles.sectionTitle}>Shipping Options</Text>
          <SettingsCard>
            <SettingsCell
              icon="gift-outline"
              iconColor={Colors.brand}
              title="Offer free shipping"
              subtitle="You'll cover the postage cost for buyers"
              variant="toggle"
              toggleValue={freeShipping}
              onToggle={(v) => updatePostagePreferences({ freeShipping: v })}
              isFirst
            />
            <SettingsCell
              icon="cube-outline"
              iconColor={Colors.brand}
              title="Bundle discount on postage"
              subtitle="Buyers save when buying multiple items"
              variant="toggle"
              toggleValue={bundleDiscount}
              onToggle={(v) => updatePostagePreferences({ bundleDiscount: v })}
              isLast
            />
          </SettingsCard>
        </Reanimated.View>

        {/* Footer note */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
          <Text style={styles.footerNote}>
            These are your default settings. You can override postage for individual items when
            listing.
          </Text>
        </Reanimated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  saveBtnContainer: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  saveBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: '#ffffff',
    letterSpacing: Type.body.letterSpacing,
  },
  content: {
    padding: Space.md,
    paddingBottom: Space.xl,
  },
  sectionTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
    marginBottom: Space.sm,
    marginLeft: Space.xs,
  },
  scopeLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginLeft: Space.xs,
    marginBottom: Space.sm,
    letterSpacing: Type.caption.letterSpacing,
  },
  carrierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md - Space.xs,
  },
  carrierRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  carrierText: {
    flex: 1,
    marginRight: Space.sm,
  },
  carrierLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    marginBottom: 2,
    letterSpacing: Type.body.letterSpacing,
  },
  carrierPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    letterSpacing: Type.caption.letterSpacing,
  },
  footerNote: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: Type.caption.lineHeight,
    paddingHorizontal: Space.xs,
    marginTop: Space.sm,
    letterSpacing: Type.caption.letterSpacing,
    textAlign: 'center',
  },
  selectedBadge: {
    backgroundColor: `${Colors.brand}15`,
    paddingHorizontal: Space.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    marginRight: Space.sm,
  },
  selectedBadgeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    letterSpacing: Type.meta.letterSpacing,
  },
});
