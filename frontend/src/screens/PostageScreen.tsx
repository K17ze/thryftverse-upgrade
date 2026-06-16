import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { formatCountryPolicyScope } from '../utils/capabilityPolicy';
import { CapabilityCarrier, getUserCountryCapabilities } from '../services/capabilitiesApi';
import { SettingsCell } from '../components/SettingsCell';
import { RadioButton } from '../components/settings/RadioButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Typography } from '../theme/designTokens';
import { PremiumListSection } from '../components/ui/PremiumListSection';
import { FlagshipScreen, FlagshipHeader, FlagshipState, FlagshipFormSection } from '../components/flagship';

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
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const hydrateCountryCarriers = async () => {
      setIsHydrating(true);
      if (!currentUser?.id) {
        setCarriers(CARRIERS);
        setCarrierScopeLabel(null);
        setIsHydrating(false);
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
      } finally {
        if (!cancelled) setIsHydrating(false);
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

  const savedAddress = useStore((state) => state.savedAddress);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Delivery Centre"
          subtitle="Shipping addresses and carrier preferences"
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable onPress={() => navigation.goBack()} hapticFeedback="light" scaleValue={0.98}>
              <View style={[styles.saveBtnContainer, { backgroundColor: Colors.brand }]}>
                <Text style={[styles.saveBtnText, { color: Colors.textInverse }]}>Done</Text>
              </View>
            </AnimatedPressable>
          }
        />
      }
    >
      {/* Addresses */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
        <FlagshipFormSection title="Your Addresses" description="Add a default delivery address for faster checkout.">
          {savedAddress ? (
            <View style={{ padding: Space.md }}>
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={20} color={Colors.textPrimary} />
                <View style={styles.addressText}>
                  <Text style={[styles.addressLabel, { color: Colors.textPrimary }]}>
                    {savedAddress.name}
                  </Text>
                  <Text style={[styles.addressDetail, { color: Colors.textSecondary }]}>
                    {savedAddress.streetAddress}, {savedAddress.city}, {savedAddress.country}
                  </Text>
                </View>
                <AnimatedPressable onPress={() => show('Address editing coming soon', 'info')} scaleValue={0.92}>
                  <Text style={[styles.addressAction, { color: Colors.brand }]}>Edit</Text>
                </AnimatedPressable>
              </View>
            </View>
          ) : (
            <FlagshipState
              variant="empty"
              title="No addresses saved"
              subtitle="Add a delivery address to speed up checkout and returns."
              actionLabel="Add Address"
              onAction={() => show('Address management coming soon', 'info')}
              icon="location-outline"
            />
          )}
        </FlagshipFormSection>
      </Reanimated.View>

      {/* Default Carrier */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
        <PremiumListSection title="Default Carrier" subtitle={carrierScopeLabel ? `Region policy: ${carrierScopeLabel}` : undefined}>
          {isHydrating ? (
            <FlagshipState variant="loading" />
          ) : (
            <>
              {carriers.map((c, idx) => (
                <AnimatedPressable
                  key={c.key}
                  style={[styles.carrierRow, c.selected && { backgroundColor: `${Colors.brand}08` }, idx < carriers.length - 1 && styles.carrierRowBorder]}
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
            </>
          )}
        </PremiumListSection>
      </Reanimated.View>

      {/* Shipping Options */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
        <PremiumListSection title="Shipping Options">
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
        </PremiumListSection>
      </Reanimated.View>

      {/* Footer note */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(180)}>
        <Text style={styles.footerNote}>
          These are your default settings. You can override postage for individual items when
          listing.
        </Text>
      </Reanimated.View>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  saveBtnContainer: {
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  saveBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  skeletonWrap: {
    marginBottom: Space.md,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  addressText: {
    flex: 1,
  },
  addressLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
    marginBottom: 2,
  },
  addressDetail: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  addressAction: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
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