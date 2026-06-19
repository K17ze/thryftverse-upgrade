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
          rightAction={undefined}
        />
      }
    >
      <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
        <View style={[styles.deliveryTrust, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Ionicons name="cube-outline" size={18} color={Colors.brand} />
          <Text style={[styles.deliveryTrustText, { color: Colors.textSecondary }]}>
            Set your default delivery address and preferred carrier for faster checkout.
          </Text>
        </View>
      </Reanimated.View>

      {/* Addresses */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
        <FlagshipFormSection title="Your Addresses" description="Add a default delivery address for faster checkout.">
          {savedAddress ? (
            <View style={{ padding: Space.md }}>
              <View style={[styles.addressCard, { backgroundColor: Colors.surfaceAlt }]}>
                <View style={styles.addressCardHeader}>
                  <View style={styles.addressCardIdentity}>
                    <View style={[styles.addressIconCircle, { backgroundColor: `${Colors.brand}15` }]}>
                      <Ionicons name="location" size={18} color={Colors.brand} />
                    </View>
                    <View>
                      <Text style={[styles.addressLabel, { color: Colors.textPrimary }]}>
                        {savedAddress.name}
                      </Text>
                      <View style={styles.defaultBadge}>
                        <Ionicons name="checkmark-circle" size={10} color={Colors.success} />
                        <Text style={styles.defaultBadgeText}>Default delivery</Text>
                      </View>
                    </View>
                  </View>
                  <AnimatedPressable
                    onPress={() => show('Address editing coming soon', 'info')}
                    scaleValue={0.92}
                    hapticFeedback="light"
                    accessibilityRole="button"
                    accessibilityLabel="Edit address"
                  >
                    <Text style={[styles.addressAction, { color: Colors.brand }]}>Edit</Text>
                  </AnimatedPressable>
                </View>
                <Text style={[styles.addressDetail, { color: Colors.textSecondary }]}>
                  {savedAddress.streetAddress}
                </Text>
                <Text style={[styles.addressDetail, { color: Colors.textSecondary }]}>
                  {savedAddress.city}{savedAddress.postalCode ? `, ${savedAddress.postalCode}` : ''}
                </Text>
                <Text style={[styles.addressDetail, { color: Colors.textSecondary }]}>
                  {savedAddress.country}
                </Text>
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
  skeletonWrap: {
    marginBottom: Space.md,
  },
  addressCard: {
    borderRadius: Radius.lg,
    padding: Space.lg,
    gap: Space.xs,
  },
  addressCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Space.sm,
  },
  addressCardIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  addressIconCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  defaultBadgeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.success,
    letterSpacing: Type.meta.letterSpacing,
  },
  addressLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  addressDetail: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
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
  deliveryTrust: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginHorizontal: Space.md,
    marginBottom: Space.md,
  },
  deliveryTrustText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
});