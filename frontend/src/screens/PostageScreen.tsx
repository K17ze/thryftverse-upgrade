import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
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
import { useReducedMotion } from '../hooks/useReducedMotion';
import { PremiumListSection } from '../components/ui/PremiumListSection';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';

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
  const reducedMotionEnabled = useReducedMotion();
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
          title="Shipping preferences"
          subtitle="Carrier and postage defaults"
          onBack={() => navigation.goBack()}
          rightAction={undefined}
        />
      }
    >
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
        <View style={[styles.deliveryTrust, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Ionicons name="cube-outline" size={18} color={Colors.brand} />
          <Text style={[styles.deliveryTrustText, { color: Colors.textSecondary }]}>
            Set your preferred carrier and postage defaults for faster listing. Manage saved delivery addresses in Settings.
          </Text>
        </View>
      </Reanimated.View>

      {/* Link to saved addresses */}
      <Pressable
        onPress={() => navigation.navigate('SavedAddresses')}
        style={({ pressed }) => [
          styles.addressLinkRow,
          { backgroundColor: Colors.surface, borderColor: Colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Manage saved addresses"
      >
        <View style={styles.addressLinkLeft}>
          <Ionicons name="location-outline" size={20} color={Colors.textPrimary} />
          <View>
            <Text style={[styles.addressLinkTitle, { color: Colors.textPrimary }]}>Saved addresses</Text>
            <Text style={[styles.addressLinkSubtitle, { color: Colors.textMuted }]}>
              {savedAddress ? '1 saved' : 'None saved'}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </Pressable>

      {/* Default Carrier */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
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
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
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
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
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
  addressLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.md,
    minHeight: 56,
  },
  addressLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  addressLinkTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    lineHeight: Type.bodyEmphasis.lineHeight,
  },
  addressLinkSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
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