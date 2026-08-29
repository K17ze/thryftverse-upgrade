import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import {
  createKycSession,
  fetchKycStatus,
  type KycStatus } from '../services/complianceApi';
import { parseApiError } from '../lib/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'KYCVerification'>;

// Stripe's identity-data privacy explanation. Linked truthfully from the
// entry surface so the user can read how their verification data is handled
// before agreeing to the handoff.
const STRIPE_PRIVACY_URL = 'https://stripe.com/privacy';

type StatusPhase = 'loading' | 'error' | 'ready';

/**
 * Convert a user-facing `DD/MM/YYYY` date to the ISO `YYYY-MM-DD` form the
 * backend schema requires. Returns `null` when the input is not a valid
 * DD/MM/YYYY date (caller validates the mask first).
 */
function toIsoDate(dob: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dob.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > new Date().getFullYear()) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Mask raw digit input to the friendly `DD/MM/YYYY` display format. */
function formatDob(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  let formatted = digits;
  if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  return formatted;
}

export default function KYCVerificationScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const currentUser = useStore((state) => state.currentUser);
  const updateCoOwnCompliance = useStore((state) => state.updateCoOwnCompliance);

  // ── Status fetch state ──
  const [statusPhase, setStatusPhase] = useState<StatusPhase>('loading');
  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);

  // ── Form state ──
  const [legalName, setLegalName] = useState('');
  const [dob, setDob] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // ── Submission state ──
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providerUnavailable, setProviderUnavailable] = useState(false);

  // True once we have handed the user off to the provider. While the
  // signed-webhook-backed status is still `not_started`, we show a truthful
  // "Checking your details" state instead of re-rendering the entry form —
  // we never infer success from the redirect alone.
  const handoffStartedRef = useRef(false);

  // ── Status fetch ──
  const loadStatus = useCallback(async () => {
    if (!currentUser?.id) {
      setStatusPhase('ready');
      return;
    }
    setStatusPhase('loading');
    try {
      const res = await fetchKycStatus(currentUser.id);
      setKycStatus(res.kycStatus);
      // Clear the handoff flag once the provider has actually recorded an
      // outcome (anything other than not_started).
      if (res.kycStatus.status !== 'not_started') {
        handoffStartedRef.current = false;
      }
      setStatusPhase('ready');
    } catch {
      setStatusPhase('error');
    }
  }, [currentUser?.id]);

  // Refetch whenever the screen gains focus (e.g. returning from the
  // provider's hosted capture flow in the browser).
  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, [loadStatus]),
  );

  // Also refetch when the app returns to the foreground — the user may have
  // been switched into the provider's browser/app.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadStatus();
      }
    });
    return () => subscription.remove();
  }, [loadStatus]);

  // ── Validation ──
  const validateForm = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!legalName.trim()) errs.legalName = 'Legal full name is required';
    if (!dob.trim()) {
      errs.dob = 'Date of birth is required';
    } else if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dob.trim())) {
      errs.dob = 'Use DD/MM/YYYY format';
    } else if (!toIsoDate(dob)) {
      errs.dob = 'Enter a valid date of birth';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }, [legalName, dob]);

  // ── Submit: create provider session and hand off ──
  const handleVerify = useCallback(async () => {
    if (isOffline) {
      haptic.medium();
      show('You appear to be offline. Check your connection and try again.', 'error');
      return;
    }
    if (!validateForm()) {
      haptic.medium();
      return;
    }
    if (!currentUser?.id) {
      show('Log in to verify your identity.', 'error');
      return;
    }
    const isoDob = toIsoDate(dob);
    if (!isoDob) {
      setFormErrors((prev) => ({ ...prev, dob: 'Enter a valid date of birth' }));
      haptic.medium();
      return;
    }

    haptic.medium();
    setIsSubmitting(true);
    setProviderUnavailable(false);
    try {
      const result = await createKycSession({
        legalName: legalName.trim(),
        dateOfBirth: isoDob,
        countryCode: 'GB' });

      // Mark compliance as not-yet-verified locally (truthful — no instant
      // approval claim).
      updateCoOwnCompliance({ kycVerified: false });

      const url = result.session.verificationUrl;
      if (!url) {
        // Provider returned no hosted capture URL — truthful unavailable
        // state. Never fake a pending review.
        setProviderUnavailable(true);
        haptic.error();
        return;
      }

      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        setProviderUnavailable(true);
        haptic.error();
        return;
      }

      // Record the handoff so the return-to-screen shows "Checking your
      // details" until the webhook-backed status resolves.
      handoffStartedRef.current = true;
      await Linking.openURL(url);
    } catch (err) {
      const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));
      const parsed = parseApiError(err, isNetworkError ? 'You appear to be offline. Check your connection and try again.' : undefined);
      show(parsed.message, 'error');
      haptic.error();
    } finally {
      setIsSubmitting(false);
    }
  }, [isOffline, validateForm, currentUser?.id, legalName, dob, haptic, show, updateCoOwnCompliance]);

  const handleBack = useCallback(() => {
    haptic.light();
    navigation.goBack();
  }, [haptic, navigation]);

  const openStripePrivacy = useCallback(() => {
    haptic.light();
    Linking.openURL(STRIPE_PRIVACY_URL).catch(() => {
      show('Could not open the link.', 'error');
    });
  }, [haptic, show]);

  // ── Render: provider-unavailable error state ──
  if (providerUnavailable) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Identity verification" onBack={handleBack} />}>
        <FlagshipState
          variant="unavailable"
          title="Verification is temporarily unavailable"
          subtitle="We couldn't open identity verification right now. Please try again later."
          actionLabel="Try again"
          onAction={() => {
            setProviderUnavailable(false);
            haptic.medium();
          }}
          secondaryActionLabel="Go back"
          onSecondaryAction={handleBack}
          style={styles.stateFill}
        />
      </FlagshipScreen>
    );
  }

  // ── Render: offline (no cached status) ──
  if (isOffline && statusPhase !== 'ready') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Identity verification" onBack={handleBack} />}>
        <FlagshipState
          variant="offline"
          title="You're offline"
          subtitle="Identity verification needs a connection. Check your network and try again."
          actionLabel="Try again"
          onAction={loadStatus}
          style={styles.stateFill}
        />
      </FlagshipScreen>
    );
  }

  // ── Render: status loading ──
  if (statusPhase === 'loading') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Identity verification" onBack={handleBack} />}>
        <FlagshipState
          variant="loading"
          title="Checking your details"
          subtitle="One moment while we check your verification status."
          style={styles.stateFill}
        />
      </FlagshipScreen>
    );
  }

  // ── Render: status fetch error ──
  if (statusPhase === 'error') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Identity verification" onBack={handleBack} />}>
        <FlagshipState
          variant="error"
          title="Couldn't load verification status"
          subtitle="We couldn't reach the verification service. Tap below to try again."
          actionLabel="Retry"
          onAction={loadStatus}
          secondaryActionLabel="Go back"
          onSecondaryAction={handleBack}
          style={styles.stateFill}
        />
      </FlagshipScreen>
    );
  }

  const status = kycStatus?.status ?? 'not_started';

  // While a handoff is in progress but the webhook hasn't landed yet, show
  // the truthful "checking" state rather than the entry form.
  const awaitingProvider = handoffStartedRef.current && status === 'not_started';

  // ── Render: in-review (pending / in_review) ──
  if (awaitingProvider || status === 'pending') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Identity verification" onBack={handleBack} />}>
        <View style={styles.stateFill} accessibilityLiveRegion="polite">
          <View style={styles.stateIconWrap}>
            <Ionicons name="hourglass-outline" size={Control.icon + 6} color={colors.warning} aria-hidden={true} />
          </View>
          <Text style={styles.stateTitle} maxFontSizeMultiplier={1.3}>Checking your details</Text>
          <Text style={styles.stateBody} maxFontSizeMultiplier={1.3}>
            Stripe is reviewing your verification. This usually takes a short while. You can leave and we'll notify you when it's done.
          </Text>
          <AppButton
            title="View verification status"
            variant="secondary"
            size="md"
            onPress={() => navigation.navigate('VerificationStatus')}
            accessibilityLabel="View verification status"
            hapticFeedback="light"
            style={styles.stateAction}
          />
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.stateSecondary}>Not now</Text>
          </Pressable>
        </View>
      </FlagshipScreen>
    );
  }

  // ── Render: verified ──
  if (status === 'verified') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Identity verification" onBack={handleBack} />}>
        <View style={styles.stateFill} accessibilityLiveRegion="polite">
          <View style={[styles.stateIconWrap, { backgroundColor: colors.successSubtle, borderRadius: Radius.full }]}>
            <Ionicons name="checkmark-circle" size={Control.icon + 6} color={colors.success} aria-hidden={true} />
          </View>
          <Text style={styles.stateTitle} maxFontSizeMultiplier={1.3}>Identity checked</Text>
          <Text style={styles.stateBody} maxFontSizeMultiplier={1.3}>
            Your identity has been verified. You can sell and trade on ThryftVerse.
          </Text>
          <AppButton
            title="View verification status"
            variant="secondary"
            size="md"
            onPress={() => navigation.navigate('VerificationStatus')}
            accessibilityLabel="View verification status"
            hapticFeedback="light"
            style={styles.stateAction}
          />
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.stateSecondary}>Done</Text>
          </Pressable>
        </View>
      </FlagshipScreen>
    );
  }

  // ── Render: rejected / declined ──
  if (status === 'rejected') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Identity verification" onBack={handleBack} />}>
        <View style={styles.stateFill} accessibilityLiveRegion="polite">
          <View style={[styles.stateIconWrap, { backgroundColor: colors.dangerSubtle, borderRadius: Radius.full }]}>
            <Ionicons name="close-circle-outline" size={Control.icon + 6} color={colors.danger} aria-hidden={true} />
          </View>
          <Text style={styles.stateTitle} maxFontSizeMultiplier={1.3}>Verification wasn't approved</Text>
          <Text style={styles.stateBody} maxFontSizeMultiplier={1.3}>
            We couldn't confirm your identity this time. Contact support for help, or try again with updated details.
          </Text>
          <AppButton
            title="Try again"
            variant="primary"
            size="md"
            onPress={() => {
              haptic.medium();
              setKycStatus((prev) => prev ? { ...prev, status: 'not_started' } : prev);
            }}
            accessibilityLabel="Start verification again"
            hapticFeedback="medium"
            style={styles.stateAction}
          />
          <Pressable
            onPress={() => navigation.navigate('VerificationStatus')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Contact support or view status"
          >
            <Text style={styles.stateSecondary}>Contact support</Text>
          </Pressable>
        </View>
      </FlagshipScreen>
    );
  }

  // ── Render: expired ──
  if (status === 'expired') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Identity verification" onBack={handleBack} />}>
        <View style={styles.stateFill} accessibilityLiveRegion="polite">
          <View style={[styles.stateIconWrap, { backgroundColor: colors.warningSubtle, borderRadius: Radius.full }]}>
            <Ionicons name="time-outline" size={Control.icon + 6} color={colors.warning} aria-hidden={true} />
          </View>
          <Text style={styles.stateTitle} maxFontSizeMultiplier={1.3}>Verification expired</Text>
          <Text style={styles.stateBody} maxFontSizeMultiplier={1.3}>
            Your previous verification has expired. Verify again to continue selling and trading.
          </Text>
          <AppButton
            title="Verify again"
            variant="primary"
            size="md"
            onPress={() => {
              haptic.medium();
              setKycStatus((prev) => prev ? { ...prev, status: 'not_started' } : prev);
            }}
            accessibilityLabel="Start verification again"
            hapticFeedback="medium"
            style={styles.stateAction}
          />
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.stateSecondary}>Not now</Text>
          </Pressable>
        </View>
      </FlagshipScreen>
    );
  }

  // ── Render: entry form (not_started) ──
  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Identity verification" onBack={handleBack} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Dominant object: the verification entry. One title, one honest
            explanation, the minimal identity inputs the provider needs to
            seed the session, and a single primary action. No step wizard,
            no capture tiles, no review summary. */}
        <Text style={styles.entryTitle} maxFontSizeMultiplier={1.2}>Verify your identity</Text>
        <Text style={styles.entryBody} maxFontSizeMultiplier={1.3}>
          We need to confirm who you are before you can sell and trade on ThryftVerse. Stripe will check your name, date of birth, and a government-issued ID.
        </Text>

        <View style={styles.fieldGroup}>
          <AppInput
            label="Legal full name"
            value={legalName}
            onChangeText={setLegalName}
            placeholder="Jane Doe"
            errorText={formErrors.legalName}
            autoCapitalize="words"
            accessibilityLabel="Legal full name"
          />
          <AppInput
            label="Date of birth"
            value={dob}
            onChangeText={(t) => {
              setDob(formatDob(t));
              if (formErrors.dob) setFormErrors((prev) => { const next = { ...prev }; delete next.dob; return next; });
            }}
            placeholder="DD/MM/YYYY"
            errorText={formErrors.dob}
            keyboardType="numeric"
            maxLength={10}
            accessibilityLabel="Date of birth"
            helperText="Format: DD/MM/YYYY"
          />
        </View>

        {/* Country is fixed for this release; shown as a read-only row so the
            user knows what region the provider is configured for. */}
        <View style={[styles.countryRow, { borderBottomColor: colors.border }]}>
          <Text style={styles.countryLabel}>Country</Text>
          <Text style={styles.countryValue}>United Kingdom</Text>
        </View>

        <View style={styles.privacyNote}>
          <Text style={styles.privacyText} maxFontSizeMultiplier={1.3}>
            Stripe handles your document and selfie capture. Your data is processed by Stripe under their privacy policy for verification purposes.
          </Text>
          <Pressable
            onPress={openStripePrivacy}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Read Stripe's privacy policy"
          >
            <Text style={styles.privacyLink}>How Stripe handles your data</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Footer: one dominant primary action + a restrained secondary. */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <AppButton
          title="Verify identity"
          variant="primary"
          size="lg"
          onPress={handleVerify}
          loading={isSubmitting}
          accessibilityLabel="Verify identity with Stripe"
          accessibilityHint="Opens Stripe's secure identity verification"
          hapticFeedback="medium"
          style={styles.footerPrimary}
        />
        <Pressable
          onPress={handleBack}
          style={styles.footerSecondary}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Not now, go back"
        >
          <Text style={styles.footerSecondaryText}>Not now</Text>
        </Pressable>
      </View>
    </FlagshipScreen>
  );
}

// ── Styles ──
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Status / state surfaces
    stateFill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.lg,
      paddingVertical: Space.xl,
      gap: Space.sm },
    stateIconWrap: {
      width: Space.xxl + Space.xl,
      height: Space.xxl + Space.xl,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.sm },
    stateTitle: {
      fontSize: TypographyV2.screenTitle.size,
      fontFamily: TypographyV2.screenTitle.fontFamily,
      letterSpacing: TypographyV2.screenTitle.letterSpacing,
      lineHeight: TypographyV2.screenTitle.lineHeight,
      color: colors.textPrimary,
      textAlign: 'center' },
    stateBody: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 320 },
    stateAction: {
      marginTop: Space.md,
      minWidth: 240 },
    stateSecondary: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary,
      marginTop: Space.sm,
      paddingVertical: Space.xs },

    // Entry form
    scroll: {
      flex: 1 },
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      paddingBottom: Space.xl },
    entryTitle: {
      fontSize: TypographyV2.screenTitle.size,
      fontFamily: TypographyV2.screenTitle.fontFamily,
      letterSpacing: TypographyV2.screenTitle.letterSpacing,
      lineHeight: TypographyV2.screenTitle.lineHeight,
      color: colors.textPrimary },
    entryBody: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textSecondary,
      marginTop: Space.xs },
    fieldGroup: {
      gap: Space.md,
      marginTop: Space.lg },
    countryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
      marginTop: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth },
    countryLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary },
    countryValue: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary },
    privacyNote: {
      marginTop: Space.lg,
      gap: Space.xs },
    privacyText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight + 2,
      color: colors.textMuted },
    privacyLink: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.brand,
      paddingVertical: Space.xs / 2 },

    // Footer
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
      gap: Space.xs },
    footerPrimary: {
      flex: 0 },
    footerSecondary: {
      alignItems: 'center',
      paddingVertical: Space.xs,
      minHeight: Control.hit,
      justifyContent: 'center' },
    footerSecondaryText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary } });
}
