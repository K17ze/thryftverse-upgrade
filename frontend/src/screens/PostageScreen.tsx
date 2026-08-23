/**
 * PostageScreen — shipping preferences for sellers.
 *
 * Lets the seller choose a default carrier, toggle free shipping and bundle
 * postage discounts, and navigate to saved addresses. Carrier availability
 * is resolved from the user's country capabilities (real backend data).
 *
 * Per AGENTS.md §11 (Truthful UI): postage preferences are persisted to the
 * server via PATCH /users/me/postage and rehydrated on mount via
 * GET /users/me/postage. A persistence banner makes the sync state clear.
 *
 * Design (per AGENTS.md §4):
 * - Flat composition, hairline separators, no card-on-card
 * - One flat summary block (no decorative hero card)
 * - Max two non-avatar radius sizes (Radius.md for banner, no other chrome)
 * - Max three type sizes per viewport (bodyStrong, body, caption)
 * - All colors via useAppTheme(), all geometry via design tokens
 * - Carrier rows answer 4 questions: what, cost, when, conditions (ETA + tracking)
 *
 * State coverage (per AGENTS.md §14):
 * - Loading: skeleton shimmer while capabilities + postage hydrate
 * - Error: FlagshipState with retry when capabilities fetch fails
 * - Populated: full carrier list + toggles
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { formatCountryPolicyScope } from '../utils/capabilityPolicy';
import { CapabilityCarrier, getUserCountryCapabilities } from '../services/capabilitiesApi';
import { RadioButton } from '../components/settings/RadioButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';

import { Space, Radius, Type, Typography } from '../theme/designTokens';
type Props = NativeStackScreenProps<RootStackParamList, 'Postage'>;

// UK fallback carriers — used only when capabilities fetch fails AND user has
// no cached carrier data. InPost removed (not in any backend cluster template).
const FALLBACK_CARRIERS: CapabilityCarrier[] = [
  { id: 'evri', label: 'Evri', priceFromGbp: 2.89, etaMinDays: 2, etaMaxDays: 4, tracking: true },
  { id: 'royal_mail', label: 'Royal Mail', priceFromGbp: 3.35, etaMinDays: 1, etaMaxDays: 3, tracking: true },
  { id: 'dpd', label: 'DPD', priceFromGbp: 4.5, etaMinDays: 1, etaMaxDays: 2, tracking: true },
];

type LoadState = 'loading' | 'populated' | 'error';

interface CarrierRowData {
  key: string;
  label: string;
  priceFromGbp: number;
  etaMinDays: number;
  etaMaxDays: number;
  tracking: boolean;
  selected: boolean;
}

function toCarrierRow(c: CapabilityCarrier, selectedKey: string): CarrierRowData {
  return {
    key: c.id,
    label: c.label,
    priceFromGbp: c.priceFromGbp,
    etaMinDays: c.etaMinDays,
    etaMaxDays: c.etaMaxDays,
    tracking: c.tracking,
    selected: c.id === selectedKey,
  };
}

function formatEta(min: number, max: number): string {
  if (min === max) return `${min} day${min === 1 ? '' : 's'}`;
  return `${min}–${max} days`;
}

export default function PostageScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentUser = useStore((state) => state.currentUser);
  const { show } = useToast();
  const postagePreferences = useStore((state) => state.postagePreferences);
  const updatePostagePreferences = useStore((state) => state.updatePostagePreferences);
  const hydratePostagePreferences = useStore((state) => state.hydratePostagePreferences);
  const savedAddress = useStore((state) => state.savedAddress);
  const { formatFromFiat } = useFormattedPrice();

  const [carriers, setCarriers] = useState<CarrierRowData[]>([]);
  const [carrierScopeLabel, setCarrierScopeLabel] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const hydrate = useCallback(async () => {
    if (!currentUser?.id) {
      setCarriers(FALLBACK_CARRIERS.map((c) => toCarrierRow(c, postagePreferences.carrierKey)));
      setCarrierScopeLabel(null);
      setLoadState('populated');
      return;
    }
    setLoadState('loading');
    try {
      const [capabilities] = await Promise.all([
        getUserCountryCapabilities(currentUser.id),
        hydratePostagePreferences(),
      ]);
      const sourceCarriers =
        capabilities.postage.carriers.length > 0
          ? capabilities.postage.carriers
          : FALLBACK_CARRIERS;
      // Read the freshly-hydrated carrier key from the store
      const currentKey = useStore.getState().postagePreferences.carrierKey;
      setCarriers(sourceCarriers.map((c) => toCarrierRow(c, currentKey)));
      setCarrierScopeLabel(formatCountryPolicyScope(capabilities));
      setLoadState('populated');
    } catch {
      // Fall back to UK carriers with the current persisted key
      setCarriers(FALLBACK_CARRIERS.map((c) => toCarrierRow(c, postagePreferences.carrierKey)));
      setCarrierScopeLabel(null);
      setLoadState('error');
    }
  }, [currentUser?.id, hydratePostagePreferences, postagePreferences.carrierKey]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const selectCarrier = useCallback((key: string) => {
    const carrier = carriers.find((c) => c.key === key);
    setCarriers((prev) => prev.map((c) => ({ ...c, selected: c.key === key })));
    updatePostagePreferences({ carrierKey: key });
    if (carrier) {
      show(`${carrier.label} set as default carrier`, 'success');
    }
  }, [carriers, updatePostagePreferences, show]);

  const handleFreeShippingToggle = useCallback((v: boolean) => {
    updatePostagePreferences({ freeShipping: v });
    show(v ? 'Free shipping enabled' : 'Free shipping disabled', 'success');
  }, [updatePostagePreferences, show]);

  const handleBundleDiscountToggle = useCallback((v: boolean) => {
    updatePostagePreferences({ bundleDiscount: v });
    show(v ? 'Bundle discount enabled' : 'Bundle discount disabled', 'success');
  }, [updatePostagePreferences, show]);

  const freeShipping = postagePreferences.freeShipping;
  const bundleDiscount = postagePreferences.bundleDiscount;
  const selectedCarrier = carriers.find((c) => c.selected);
  const addressCount = savedAddress ? '1 saved' : 'None saved';

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Shipping preferences"
          subtitle="Carrier and postage defaults"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Honest persistence banner ── */}
      <View
        style={[styles.persistenceBanner, { backgroundColor: colors.surfaceAlt }]}
        accessibilityRole="header"
        accessibilityLabel="Shipping preferences sync"
      >
        <Ionicons name="sync-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.persistenceBannerText}>
          Preferences sync to your account and apply to new listings.
        </Text>
      </View>

      {/* ── Flat summary block ── */}
      <View style={styles.summaryBlock}>
        <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
          {selectedCarrier ? selectedCarrier.label : 'Choose a carrier'}
        </Text>
        <Text style={[styles.summarySubtitle, { color: colors.textSecondary }]}>
          {selectedCarrier
            ? `${formatFromFiat(selectedCarrier.priceFromGbp, 'GBP', { displayMode: 'fiat' })} from · ${formatEta(selectedCarrier.etaMinDays, selectedCarrier.etaMaxDays)}`
            : 'Set your default carrier and postage options'}
        </Text>
      </View>

      {/* ── Default carrier ── */}
      {loadState === 'error' ? (
        <FlagshipState
          variant="error"
          title="Couldn't load carriers"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void hydrate()}
        />
      ) : loadState === 'loading' ? (
        <SettingsSection title="Default carrier">
          <FlagshipState variant="loading" />
        </SettingsSection>
      ) : (
        <SettingsSection
          title="Default carrier"
          description={carrierScopeLabel ? `Region: ${carrierScopeLabel}` : undefined}
        >
          {carriers.map((c, idx) => (
            <AnimatedPressable
              key={c.key}
              style={[
                styles.carrierRow,
                idx < carriers.length - 1 && styles.carrierRowBorder,
              ]}
              onPress={() => selectCarrier(c.key)}
              hapticFeedback="light"
              accessibilityRole="radio"
              accessibilityState={{ checked: c.selected }}
              accessibilityLabel={`${c.label}, from ${formatFromFiat(c.priceFromGbp, 'GBP', { displayMode: 'fiat' })}, ${formatEta(c.etaMinDays, c.etaMaxDays)}${c.tracking ? ', tracking included' : ''}`}
            >
              <View style={styles.carrierText}>
                <Text
                  style={[
                    styles.carrierLabel,
                    { color: colors.textPrimary },
                    c.selected && { fontFamily: Typography.family.semibold },
                  ]}
                >
                  {c.label}
                </Text>
                <Text style={[styles.carrierMeta, { color: colors.textMuted }]}>
                  from {formatFromFiat(c.priceFromGbp, 'GBP', { displayMode: 'fiat' })} · {formatEta(c.etaMinDays, c.etaMaxDays)}
                  {c.tracking ? ' · tracking' : ''}
                </Text>
              </View>
              <RadioButton selected={c.selected} />
            </AnimatedPressable>
          ))}
        </SettingsSection>
      )}

      {/* ── Shipping options ── */}
      <SettingsSection title="Shipping options">
        <SettingsRow
          icon="gift-outline"
          iconColor={colors.brand}
          title="Offer free shipping"
          subtitle="You'll cover the postage cost for buyers"
          toggleValue={freeShipping}
          onToggle={handleFreeShippingToggle}
          isFirst
        />
        <SettingsRow
          icon="cube-outline"
          iconColor={colors.brand}
          title="Bundle discount on postage"
          subtitle="Buyers save when buying multiple items"
          toggleValue={bundleDiscount}
          onToggle={handleBundleDiscountToggle}
          isLast
        />
      </SettingsSection>

      {/* ── Delivery addresses ── */}
      <SettingsSection title="Delivery">
        <SettingsRow
          icon="location-outline"
          title="Saved addresses"
          subtitle="Manage delivery addresses for checkout"
          value={addressCount}
          onPress={() => navigation.navigate('SavedAddresses')}
          isFirst
          isLast
        />
      </SettingsSection>

      {/* ── Footer note ── */}
      <Text style={[styles.footerNote, { color: colors.textMuted }]}>
        Override postage for individual items when listing.
      </Text>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    persistenceBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      marginBottom: Space.md,
    },
    persistenceBannerText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      color: colors.textSecondary,
      flex: 1,
    },
    summaryBlock: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
      marginBottom: Space.md,
    },
    summaryTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    summarySubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    carrierRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + Space.xs,
      minHeight: 56,
    },
    carrierRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    carrierText: {
      flex: 1,
      marginRight: Space.sm,
    },
    carrierLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.body.letterSpacing,
      lineHeight: Type.body.lineHeight,
    },
    carrierMeta: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    footerNote: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
      paddingHorizontal: Space.md,
      marginTop: Space.sm,
    },
  });
}
