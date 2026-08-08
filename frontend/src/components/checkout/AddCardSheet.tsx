import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  AddressCollectionMode,
  CollectionMode,
  initPaymentSheet,
  PaymentSheetError,
  presentPaymentSheet,
} from '@stripe/stripe-react-native';
import { BottomSheet } from '../BottomSheet';
import { AnimatedPressable } from '../AnimatedPressable';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { createStripeSetupSheet } from '../../services/commerceApi';
import {
  getUserCountryCapabilities,
  type UserCountryCapabilities,
} from '../../services/capabilitiesApi';
import {
  formatCountryPolicyScope,
  isPaymentMethodAllowed,
} from '../../utils/capabilityPolicy';
import { parseApiError } from '../../lib/apiClient';
import { createStableId } from '../../utils/createStableId';
import {
  configureStripeMobile,
  getStripeReturnUrl,
} from '../../platform/payments/stripeMobile';
import { Radius, Space, Typography, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onSuccess?: () => void;
}

export function AddCardSheet({ visible, onDismiss, onSuccess }: Props) {
  const { colors } = useAppTheme();
  const currentUser = useStore((state) => state.currentUser);
  const [isOpeningProvider, setIsOpeningProvider] = useState(false);
  const [countryCapabilities, setCountryCapabilities] =
    useState<UserCountryCapabilities | null>(null);
  const setupIdempotencyKeyRef = useRef(createStableId('setup_method'));
  const { show } = useToast();
  const themed = {
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: colors.textMuted,
    brand: colors.brand,
    border: colors.border,
    surface: colors.surface,
    surfaceAlt: colors.surfaceAlt,
    success: colors.success,
    textInverse: colors.textInverse,
  };
  const styles = useMemo(() => createStyles(themed), [themed]);

  useEffect(() => {
    let cancelled = false;
    if (!visible || !currentUser?.id) return () => undefined;

    void getUserCountryCapabilities(currentUser.id)
      .then((capabilities) => {
        if (!cancelled) setCountryCapabilities(capabilities);
      })
      .catch(() => {
        if (!cancelled) setCountryCapabilities(null);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, visible]);

  useEffect(() => {
    if (!visible) {
      setupIdempotencyKeyRef.current = createStableId('setup_method');
    }
  }, [visible]);

  const policyLabel = useMemo(
    () =>
      countryCapabilities
        ? formatCountryPolicyScope(countryCapabilities)
        : null,
    [countryCapabilities]
  );
  const cardAllowed = isPaymentMethodAllowed(countryCapabilities, 'card');

  const handleOpenStripe = async () => {
    if (isOpeningProvider) return;
    if (!currentUser?.id) {
      show('Sign in to add a payment method.', 'error');
      return;
    }
    if (!cardAllowed) {
      show('Card payments are unavailable for your country policy.', 'error');
      return;
    }

    setIsOpeningProvider(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const configuration = await createStripeSetupSheet(
        setupIdempotencyKeyRef.current
      );
      await configureStripeMobile(configuration.publishableKey);

      const { error: initializationError } = await initPaymentSheet({
        merchantDisplayName: configuration.merchantDisplayName,
        customerId: configuration.customerId,
        customerSessionClientSecret:
          configuration.customerSessionClientSecret,
        setupIntentClientSecret: configuration.setupIntentClientSecret,
        returnURL: getStripeReturnUrl(),
        allowsDelayedPaymentMethods: false,
        billingDetailsCollectionConfiguration: {
          address: AddressCollectionMode.AUTOMATIC,
          name: CollectionMode.AUTOMATIC,
        },
      });
      if (initializationError) {
        throw new Error(initializationError.message);
      }

      const { error: presentationError } = await presentPaymentSheet();
      if (presentationError?.code === PaymentSheetError.Canceled) {
        return;
      }
      if (presentationError) {
        throw new Error(presentationError.message);
      }

      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );
      show('Payment method added', 'success');
      setupIdempotencyKeyRef.current = createStableId('setup_method');
      onDismiss();
      onSuccess?.();
    } catch (error) {
      const parsed = parseApiError(
        error,
        'Unable to open card entry right now. Try again.'
      );
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error
      );
      show(parsed.message, 'error');
    } finally {
      setIsOpeningProvider(false);
    }
  };

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.58}>
      <View style={styles.header}>
        <View style={styles.providerMark} accessibilityElementsHidden>
          <Ionicons name="card-outline" size={24} color={themed.brand} />
        </View>
        <Text style={styles.title}>Add a payment method</Text>
        <Text style={styles.subtitle}>
          Card details are collected securely. ThryftVerse receives a
          reusable payment-method reference, not your card number or
          security code.
        </Text>
      </View>

      <View style={styles.boundary}>
        <View style={styles.boundaryRow}>
          <Ionicons
            name="shield-checkmark-outline"
            size={19}
            color={themed.success}
          />
          <View style={styles.boundaryCopy}>
            <Text style={styles.boundaryTitle}>Secure card entry</Text>
            <Text style={styles.boundaryText}>
              Card details are collected through our encrypted payment
              provider with bank-grade security.
            </Text>
          </View>
        </View>
        <View style={styles.separator} />
        <View style={styles.boundaryRow}>
          <Ionicons
            name="eye-off-outline"
            size={19}
            color={themed.textSecondary}
          />
          <View style={styles.boundaryCopy}>
            <Text style={styles.boundaryTitle}>Limited card details</Text>
            <Text style={styles.boundaryText}>
              We display only the provider-returned brand, last four digits,
              and expiry.
            </Text>
          </View>
        </View>
      </View>

      {!cardAllowed ? (
        <View style={styles.blocked} accessibilityRole="alert">
          <Text style={styles.blockedTitle}>
            Cards unavailable in this region
          </Text>
          <Text style={styles.blockedText}>
            This payment corridor is not enabled for your current country
            policy.
          </Text>
        </View>
      ) : null}

      {policyLabel ? (
        <Text style={styles.policy}>Payment policy: {policyLabel}</Text>
      ) : null}

      <AnimatedPressable
        style={[
          styles.primaryAction,
          (!cardAllowed || isOpeningProvider) && styles.primaryActionDisabled,
        ]}
        disabled={!cardAllowed || isOpeningProvider}
        onPress={() => void handleOpenStripe()}
        accessibilityRole="button"
        accessibilityLabel="Add a card"
        accessibilityState={{
          disabled: !cardAllowed || isOpeningProvider,
          busy: isOpeningProvider,
        }}
      >
        {isOpeningProvider ? (
          <ActivityIndicator size="small" color={themed.textInverse} />
        ) : (
          <Ionicons
            name="open-outline"
            size={18}
            color={themed.textInverse}
          />
        )}
        <Text style={styles.primaryActionText}>
          {isOpeningProvider ? 'Opening secure card entry…' : 'Add card'}
        </Text>
      </AnimatedPressable>
    </BottomSheet>
  );
}

const createStyles = (themed: {
  textPrimary: string; textSecondary: string; textMuted: string;
  brand: string; border: string; surface: string; surfaceAlt: string;
  success: string; textInverse: string;
}) => StyleSheet.create({
  header: {
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    marginBottom: Space.lg,
  },
  providerMark: {
    width: 48,
    height: 48,
    borderRadius: Radius.xxl,
    backgroundColor: themed.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  title: {
    color: themed.textPrimary,
    fontFamily: Typography.family.bold,
    fontSize: 22,
    letterSpacing: -0.35,
    marginBottom: Space.sm,
    textAlign: 'center',
  },
  subtitle: {
    color: themed.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    lineHeight: 21,
    textAlign: 'center',
  },
  boundary: {
    borderColor: themed.border,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.md,
    overflow: 'hidden',
  },
  boundaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Space.md,
    minHeight: 68,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  boundaryCopy: {
    flex: 1,
  },
  boundaryTitle: {
    color: themed.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    marginBottom: 2,
  },
  boundaryText: {
    color: themed.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: 17,
  },
  separator: {
    backgroundColor: themed.border,
    height: StyleSheet.hairlineWidth,
    marginLeft: 54,
  },
  blocked: {
    backgroundColor: themed.surfaceAlt,
    borderRadius: Radius.md,
    marginBottom: Space.md,
    padding: Space.md,
  },
  blockedTitle: {
    color: themed.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    marginBottom: 3,
  },
  blockedText: {
    color: themed.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: 18,
  },
  policy: {
    color: themed.textMuted,
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
    marginBottom: Space.md,
    textAlign: 'center',
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: themed.brand,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    gap: Space.sm,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: Space.lg,
  },
  primaryActionDisabled: {
    opacity: 0.45,
  },
  primaryActionText: {
    color: themed.textInverse,
    fontFamily: Typography.family.bold,
    fontSize: Type.bodyLarge.size,
  },
});
