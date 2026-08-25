/**
 * PostageScreen — shipping preferences for sellers.
 *
 * Lets the seller choose a default carrier, toggle free shipping and bundle
 * postage discounts, and navigate to saved addresses. Carrier availability
 * is resolved from the user's country capabilities (real backend data).
 *
 * Per AGENTS.md §11 (Truthful UI): postage preferences are persisted to the
 * server via PATCH /users/me/postage and rehydrated on mount via
 * GET /users/me/postage. Sync is expected behaviour and not bannered.
 *
 * Design (per AGENTS.md §4):
 * - Flat composition, hairline separators, no card-on-card
 * - One flat summary block (no decorative hero card)
 * - Max three type sizes per viewport (bodyStrong, body, caption)
 * - All colors via useAppTheme(), all geometry via design tokens
 * - Carrier rows answer 4 questions: what, cost, when, conditions (ETA + tracking)
 * - Honest pricing: "from £X.XX" with a note that actual costs are calculated
 *   at checkout — no fabricated quotes on a preferences surface
 *
 * State coverage (per AGENTS.md §14):
 * - Loading: skeleton rows matching carrier row geometry (no layout shift)
 * - Error: FlagshipState with retry when capabilities fetch fails
 * - Empty: FlagshipState with retry when no carriers resolve for the region
 * - Populated: full carrier list + toggles
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
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
import { t } from '../i18n';

import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { DEFAULT_CURRENCY_CODE } from '../constants/currencies';

type Props = NativeStackScreenProps<RootStackParamList, 'Postage'>;

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
  if (min === max) return t('postage.eta.single', { days: min, plural: min === 1 ? '' : 's' });
  return t('postage.eta.range', { min, max });
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
      setCarriers([]);
      setCarrierScopeLabel(null);
      setLoadState('error');
      return;
    }
    setLoadState('loading');
    try {
      const [capabilities] = await Promise.all([
        getUserCountryCapabilities(currentUser.id),
        hydratePostagePreferences(),
      ]);
      const sourceCarriers = capabilities.postage.carriers;
      // Read the freshly-hydrated carrier key from the store
      const currentKey = useStore.getState().postagePreferences.carrierKey;
      setCarriers(sourceCarriers.map((c) => toCarrierRow(c, currentKey)));
      setCarrierScopeLabel(formatCountryPolicyScope(capabilities));
      setLoadState('populated');
    } catch {
      setCarriers([]);
      setCarrierScopeLabel(null);
      setLoadState('error');
    }
  }, [currentUser?.id, hydratePostagePreferences]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const selectCarrier = useCallback((key: string) => {
    const carrier = carriers.find((c) => c.key === key);
    setCarriers((prev) => prev.map((c) => ({ ...c, selected: c.key === key })));
    updatePostagePreferences({ carrierKey: key });
    if (carrier) {
      show(t('postage.toast.carrierSet', { label: carrier.label }), 'success');
    }
  }, [carriers, updatePostagePreferences, show]);

  const handleFreeShippingToggle = useCallback((v: boolean) => {
    updatePostagePreferences({ freeShipping: v });
    show(v ? t('postage.toast.freeShippingEnabled') : t('postage.toast.freeShippingDisabled'), 'success');
  }, [updatePostagePreferences, show]);

  const handleBundleDiscountToggle = useCallback((v: boolean) => {
    updatePostagePreferences({ bundleDiscount: v });
    show(v ? t('postage.toast.bundleEnabled') : t('postage.toast.bundleDisabled'), 'success');
  }, [updatePostagePreferences, show]);

  const freeShipping = postagePreferences.freeShipping;
  const bundleDiscount = postagePreferences.bundleDiscount;
  const selectedCarrier = carriers.find((c) => c.selected);
  const addressCount = savedAddress ? t('postage.address.saved') : t('postage.address.noneSaved');

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={t('postage.header.title')}
          subtitle={t('postage.header.subtitle')}
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Flat summary block — dominant object is the selected carrier ── */}
      <View style={styles.summaryBlock}>
        <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
          {selectedCarrier ? selectedCarrier.label : t('postage.summary.selectCarrier')}
        </Text>
        <Text style={[styles.summarySubtitle, { color: colors.textSecondary }]}>
          {selectedCarrier
            ? `${t('postage.carrier.from', { price: formatFromFiat(selectedCarrier.priceFromGbp, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' }), eta: formatEta(selectedCarrier.etaMinDays, selectedCarrier.etaMaxDays) })}${selectedCarrier.tracking ? t('postage.carrier.trackingSuffix') : ''}`
            : t('postage.summary.selectCarrierHint')}
        </Text>
      </View>

      {/* ── Default carrier ── */}
      {loadState === 'error' ? (
        <FlagshipState
          variant="error"
          title={t('postage.error.loadFailed')}
          subtitle={t('postage.error.checkConnection')}
          actionLabel={t('postage.error.retry')}
          onAction={() => void hydrate()}
        />
      ) : loadState === 'loading' ? (
        <SettingsSection title={t('postage.section.defaultCarrier')}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.skeletonRow,
                i < 2 && styles.carrierRowBorder,
                { backgroundColor: colors.surfaceAlt },
              ]}
              accessibilityRole="none"
            >
              <View style={styles.skeletonText}>
                <View style={[styles.skeletonBar, styles.skeletonLabel, { backgroundColor: colors.surface }]} />
                <View style={[styles.skeletonBar, styles.skeletonMeta, { backgroundColor: colors.surface }]} />
              </View>
              <View style={[styles.skeletonRadio, { backgroundColor: colors.surface }]} />
            </View>
          ))}
        </SettingsSection>
      ) : carriers.length === 0 ? (
        <FlagshipState
          variant="empty"
          icon="cube-outline"
          title={t('postage.empty.title')}
          subtitle={t('postage.empty.subtitle')}
          actionLabel={t('postage.error.retry')}
          onAction={() => void hydrate()}
        />
      ) : (
        <SettingsSection
          title={t('postage.section.defaultCarrier')}
          description={carrierScopeLabel ? t('postage.section.region', { scope: carrierScopeLabel }) : undefined}
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
              accessibilityLabel={`${t('postage.carrier.a11yLabel', { label: c.label, price: formatFromFiat(c.priceFromGbp, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' }), eta: formatEta(c.etaMinDays, c.etaMaxDays) })}${c.tracking ? t('postage.carrier.trackingIncludedSuffix') : ''}`}
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
                  from {formatFromFiat(c.priceFromGbp, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })} · {formatEta(c.etaMinDays, c.etaMaxDays)}
                  {c.tracking ? ' · tracking' : ''}
                </Text>
              </View>
              <RadioButton selected={c.selected} />
            </AnimatedPressable>
          ))}
          <Text style={[styles.pricingNote, { color: colors.textMuted }]}>
            Actual shipping costs are calculated at checkout based on item size, weight, and destination.
          </Text>
        </SettingsSection>
      )}

      {/* ── Shipping options ── */}
      <SettingsSection title="Shipping options">
        <SettingsRow
          icon="gift-outline"
          iconColor={colors.brand}
          title="Offer free shipping"
          subtitle="You cover postage"
          toggleValue={freeShipping}
          onToggle={handleFreeShippingToggle}
          isFirst
        />
        <SettingsRow
          icon="cube-outline"
          iconColor={colors.brand}
          title="Bundle discount on postage"
          subtitle="Save on multi-item orders"
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
        You can override these defaults for individual items when creating a listing.
      </Text>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    pricingNote: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
    },
    // ── Loading skeleton rows (match carrier row geometry, no layout shift) ──
    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + Space.xs,
      minHeight: 56,
    },
    skeletonText: {
      flex: 1,
      marginRight: Space.sm,
    },
    skeletonBar: {
      borderRadius: Radius.sm,
    },
    skeletonLabel: {
      width: '45%',
      height: Type.body.size,
    },
    skeletonMeta: {
      width: '65%',
      height: Type.caption.size,
      marginTop: Space.xs / 2,
    },
    skeletonRadio: {
      width: 22,
      height: 22,
      borderRadius: Radius.full,
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
