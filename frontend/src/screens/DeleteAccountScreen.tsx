import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { ApiRequestError, parseApiError } from '../lib/apiClient';
import {
  fetchConnectedAccounts,
  requestAccountDeletion,
  type ConnectedAccount,
  type DeleteAccountOauthProof,
} from '../services/accountApi';
import { hasGoogleOAuthConfig } from '../components/login/loginViewModels';
import { logoutFromSession } from '../services/authApi';
import { clearUserScopedQueryCache } from '../platform/server';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { useBiometricGate } from '../hooks/useBiometricGate';
import { BiometricGatePrompt } from '../components/security/BiometricGate';

type Props = NativeStackScreenProps<RootStackParamList, 'DeleteAccount'>;

const DELETE_CONFIRM_PHRASE = 'DELETE';

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: 'too_many_emails', label: 'Too many emails' },
  { value: 'privacy_concerns', label: 'Privacy concerns' },
  { value: 'found_another_app', label: 'Found another app' },
  { value: 'too_hard_to_use', label: 'Too hard to use' },
  { value: 'other', label: 'Other' },
];

const deleteSchema = z.object({
  confirmText: z
    .string()
    .min(1, 'Type DELETE to continue')
    .refine(
      (v) => v.trim().toUpperCase() === DELETE_CONFIRM_PHRASE,
      `Type "${DELETE_CONFIRM_PHRASE}" exactly to confirm`,
    ),
  // Optional at the schema level — whether a password is actually required
  // depends on the account's credential type. The component-level superRefine
  // enforces it unless the account is OAuth-only (hasPassword === false).
  password: z.string().optional(),
  totpCode: z.string().optional(),
  reason: z.string().optional() });

type DeleteFormValues = z.infer<typeof deleteSchema>;

export default function DeleteAccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const twoFactorEnabled = useStore((state) => state.twoFactorEnabled);
  const logout = useStore((state) => state.logout);
  const { show } = useToast();
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Biometric gate (OWASP M5) ──
  // Account deletion is irreversible. Require biometric re-authentication
  // before showing the deletion form. The form itself still requires the
  // password (server-side verification), so this is defence-in-depth.
  const biometricGate = useBiometricGate();

  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [selectedReason, setSelectedReason] = React.useState<string | null>(null);

  // ── Credential type + OAuth re-auth (passwordless accounts) ──
  // `hasPassword === null` means "still loading" — the form fails toward the
  // passworded path, which is the common case.
  const [hasPassword, setHasPassword] = React.useState<boolean | null>(null);
  const [connectedAccounts, setConnectedAccounts] =
    React.useState<ConnectedAccount[] | null>(null);
  const [oauthProof, setOauthProof] = React.useState<DeleteAccountOauthProof | null>(null);
  const [oauthLoading, setOauthLoading] = React.useState<'google' | 'apple' | null>(null);
  const [oauthError, setOauthError] = React.useState<string | null>(null);

  const username = currentUser?.username ?? '';

  // Identity-token request only — unlike the login flow, this token is sent
  // to DELETE /users/me as re-auth proof and never creates a session.
  const [googleRequest, googleResponse, promptGoogleAuth] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || 'dev-client-id-placeholder',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID || 'dev-android-client-id-placeholder',
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID });

  // A password is required only when the account actually has one; OAuth-only
  // accounts prove identity with a provider identity token instead. RHF reads
  // the resolver from its options on every validation pass, so keying the
  // schema on `hasPassword` is safe.
  const resolvedDeleteSchema = useMemo(
    () =>
      deleteSchema.superRefine((values, ctx) => {
        if (hasPassword !== false && !(values.password ?? '').trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['password'],
            message: 'Enter your password to verify identity',
          });
        }
      }),
    [hasPassword],
  );

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors } } = useForm<DeleteFormValues>({
    resolver: zodResolver(resolvedDeleteSchema),
    defaultValues: {
      confirmText: '',
      password: '',
      totpCode: '',
      reason: undefined },
    mode: 'onChange' });

  const confirmTextValue = watch('confirmText');
  const passwordValue = watch('password');
  const totpCodeValue = watch('totpCode');
  // OAuth-only accounts submit a captured provider identity token instead of
  // a password; with no linked provider there is no viable path and the UI
  // shows a support message rather than a dead button.
  const identityVerified =
    hasPassword === false ? oauthProof !== null : (passwordValue?.length ?? 0) > 0;
  const canSubmit =
    confirmTextValue?.trim().toUpperCase() === DELETE_CONFIRM_PHRASE &&
    identityVerified &&
    (!twoFactorEnabled || (totpCodeValue?.replace(/\s+/g, '').length ?? 0) >= 6) &&
    !isDeleting;

  // Load the account's credential type so OAuth-only accounts get provider
  // re-auth instead of a password field. On failure `hasPassword` stays null
  // and the password form remains — the backend is still the source of truth
  // (it returns 400 OAUTH_REAUTH_REQUIRED when oauth proof is missing).
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchConnectedAccounts();
        if (cancelled) return;
        setConnectedAccounts(data.accounts);
        setHasPassword(data.hasPassword);
      } catch {
        // Keep hasPassword null — the password field stays visible.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Capture the Google identity token once the OAuth round-trip resolves.
  React.useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== 'success') {
      if (googleResponse.type === 'error') {
        setOauthError('Google verification failed. Please try again.');
      }
      setOauthLoading(null);
      return;
    }
    const idToken =
      googleResponse.authentication?.idToken ??
      (typeof googleResponse.params?.id_token === 'string'
        ? googleResponse.params.id_token
        : null);
    if (!idToken) {
      setOauthLoading(null);
      setOauthError('Google verification failed: no identity token returned.');
      return;
    }
    setOauthProof({ provider: 'google', identityToken: idToken });
    setOauthError(null);
    setOauthLoading(null);
  }, [googleResponse]);

  const handleGoogleVerify = useCallback(async () => {
    if (oauthLoading || isDeleting) return;
    if (!hasGoogleOAuthConfig() || !googleRequest) {
      setOauthError('Google verification is unavailable in this build.');
      return;
    }
    setOauthLoading('google');
    setOauthError(null);
    try {
      const response = await promptGoogleAuth();
      // Success is captured by the googleResponse effect above; only the
      // non-success path needs the loading flag cleared here.
      if (response.type !== 'success') setOauthLoading(null);
    } catch (error) {
      setOauthLoading(null);
      setOauthError(`Google verification failed: ${(error as Error).message}`);
    }
  }, [oauthLoading, isDeleting, googleRequest, promptGoogleAuth]);

  const handleAppleVerify = useCallback(async () => {
    if (oauthLoading || isDeleting) return;
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      setOauthError('Apple verification is only available on supported iOS devices.');
      return;
    }
    setOauthLoading('apple');
    setOauthError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ] });
      if (!credential.identityToken) throw new Error('Missing Apple identity token');
      setOauthProof({ provider: 'apple', identityToken: credential.identityToken });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        setOauthError(`Apple verification failed: ${(error as Error).message}`);
      }
    } finally {
      setOauthLoading(null);
    }
  }, [oauthLoading, isDeleting]);

  // Providers offered for re-auth: the google/apple identities linked to the
  // account. When the accounts list is unavailable both are offered; when it
  // is loaded and neither is linked there is no viable re-auth path.
  const oauthProviders = useMemo<('google' | 'apple')[]>(() => {
    if (connectedAccounts === null) return ['google', 'apple'];
    const linked = new Set<'google' | 'apple'>();
    for (const account of connectedAccounts) {
      if (account.provider === 'google' || account.provider === 'apple') {
        linked.add(account.provider);
      }
    }
    return Array.from(linked);
  }, [connectedAccounts]);

  const onSubmit = useCallback(
    async (values: DeleteFormValues) => {
      if (!currentUser?.id) {
        show('Sign in before deleting your account.', 'error');
        return;
      }
      setIsDeleting(true);
      setDeleteError(null);
      try {
        const reasonLabel =
          REASON_OPTIONS.find((r) => r.value === selectedReason)?.label ??
          'User initiated account deletion from mobile settings';
        const result = await requestAccountDeletion(
          values.password,
          values.confirmText,
          reasonLabel,
          values.totpCode,
          oauthProof ?? undefined,
        );
        await logoutFromSession();
        clearUserScopedQueryCache();
        logout();
        haptic.heavy();
        show(`Account deletion submitted. Request ID: ${result.requestId}`, 'success');
        navigation.reset({ index: 0, routes: [{ name: 'AuthLanding' }] });
      } catch (error) {
        const parsed = parseApiError(error, 'Unable to delete account right now.');
        // 409 carries a `blockers` list — translate it into specific copy so
        // the user knows exactly what must resolve before deletion.
        const blockers =
          error instanceof ApiRequestError &&
          Array.isArray((error.details as { blockers?: unknown } | null)?.blockers)
            ? ((error.details as { blockers: string[] }).blockers)
            : null;
        if (blockers && blockers.length > 0) {
          const labels: Record<string, string> = {
            open_orders: 'open orders in progress',
            open_return_cases: 'open return cases',
            pending_payouts: 'payouts still processing',
            inflight_withdrawals: 'withdrawals in flight',
          };
          const listed = blockers.map((b) => labels[b] ?? b.replace(/_/g, ' '));
          setDeleteError(
            `Your account can't be deleted yet — you have ${listed.join(', ')}. Resolve these first, then try again.`
          );
        } else {
          setDeleteError(parsed.message);
        }
        haptic.light();
      } finally {
        setIsDeleting(false);
      }
    },
    [currentUser?.id, logout, show, haptic, navigation, selectedReason, oauthProof],
  );

  const consequences = useMemo(
    () => [
      { icon: 'person-remove-outline' as const, text: 'Your profile, saved addresses, active sessions, and saved payment credentials will be deleted immediately.' },
      { icon: 'bag-handle-outline' as const, text: 'Your active listings will be removed and their titles replaced with [erased].' },
      { icon: 'wallet-outline' as const, text: 'Completed order, payout, and transaction records required for tax, fraud, and legal obligations will be anonymized and retained.' },
      { icon: 'alert-circle-outline' as const, text: 'Open orders, disputes, or pending payouts must be resolved before deletion can complete.' },
    ],
    [],
  );

  // Auto-prompt biometric once availability is confirmed.
  React.useEffect(() => {
    if (biometricGate.status === 'locked' && !biometricGate.isAuthenticating) {
      void biometricGate.authenticate('Authenticate to delete your account');
    }
  }, [biometricGate.status, biometricGate.isAuthenticating, biometricGate.authenticate]);

  // ── Biometric gate: block the deletion form until authenticated ──
  if (biometricGate.status === 'pending' || biometricGate.status === 'locked') {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Delete account"
            onBack={() => navigation.goBack()}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <BiometricGatePrompt
          gate={biometricGate}
          reason="Authenticate to delete your account"
          onBack={() => navigation.goBack()}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Delete account"
          onBack={() => navigation.goBack()}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: Space.md,
          paddingTop: Space.sm,
          paddingBottom: insets.bottom + Space.xxl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Warning hero ── */}
        <View>
          <View style={[styles.warningHero, { backgroundColor: colors.dangerSubtle, borderColor: colors.dangerBorder }]}>
            <View style={styles.warningHeader}>
              <View style={[styles.warningIcon, { backgroundColor: colors.danger }]}>
                <Ionicons name="warning" size={20} color={colors.surface} />
              </View>
              <View style={styles.warningHeaderText}>
                <Text style={[styles.warningTitle, { color: colors.danger }]}>Permanent action</Text>
                <Text style={[styles.warningSubtitle, { color: colors.textSecondary }]}>
                  This cannot be undone
                </Text>
              </View>
            </View>
            <Text style={[styles.warningBody, { color: colors.textSecondary }]}>
              Permanently deleting your Thryftverse account erases your identity, personal data,
              addresses, payment methods and wallet history. Active orders and pending payouts may
              be affected.
            </Text>
          </View>
        </View>

        {/* ── What happens ── */}
        <View>
          <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>What happens when you delete</Text>
          <View style={[styles.consequenceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {consequences.map((item, i) => (
              <View
                key={i}
                style={[
                  styles.consequenceRow,
                  i < consequences.length - 1 && {
                    borderBottomColor: colors.border,
                    borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <View style={styles.consequenceIcon}>
                  <Ionicons name={item.icon} size={18} color={colors.textMuted} />
                </View>
                <Text style={[styles.consequenceText, { color: colors.textSecondary }]}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Confirmation form ── */}
        <View>
          <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>
            Confirm your identity
          </Text>

          {/* Type DELETE */}
          <Controller
            control={control}
            name="confirmText"
            render={({ field: { onChange, onBlur, value } }) => (
              <AppInput
                label={`Type ${DELETE_CONFIRM_PHRASE} to permanently delete your account`}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={DELETE_CONFIRM_PHRASE}
                errorText={errors.confirmText?.message}
                accessibilityLabel="Type DELETE to confirm account deletion"
                accessibilityHint={`Type the word ${DELETE_CONFIRM_PHRASE} to confirm`}
                containerStyle={styles.fieldWrap}
              />
            )}
          />

          {/* Password — credential accounts only. While `hasPassword` is
              still loading (null) the password field stays visible; once the
              account is known to be OAuth-only it is replaced by provider
              re-auth below. */}
          {hasPassword !== false ? (
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <AppInput
                  label="Enter your password to verify identity"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Password"
                  errorText={errors.password?.message}
                  accessibilityLabel="Password to verify identity before deletion"
                  accessibilityHint="Enter your account password to confirm you are the account owner"
                  containerStyle={styles.fieldWrap}
                />
              )}
            />
          ) : (
            <View style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Verify your identity with a linked account
              </Text>
              {oauthProviders.length === 0 ? (
                /* No linked google/apple identity and no password — there is
                   no self-serve re-auth path, so say so honestly. */
                <View
                  style={[
                    styles.oauthNotice,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.oauthNoticeText, { color: colors.textSecondary }]}>
                    Contact support to delete this account.
                  </Text>
                </View>
              ) : oauthProof ? (
                <View
                  style={[
                    styles.oauthNotice,
                    { backgroundColor: colors.successSubtle, borderColor: colors.successBorder },
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text style={[styles.oauthNoticeText, { color: colors.textPrimary }]}>
                    Verified with {oauthProof.provider === 'google' ? 'Google' : 'Apple'}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setOauthProof(null);
                      setOauthError(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Verify with a different method"
                    hitSlop={8}
                  >
                    <Text style={[styles.oauthChangeText, { color: colors.brand }]}>Change</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.oauthButtons}>
                  {oauthProviders.includes('google') ? (
                    <AppButton
                      title="Verify with Google"
                      variant="secondary"
                      size="md"
                      icon={<Ionicons name="logo-google" size={18} color={colors.textPrimary} />}
                      onPress={() => void handleGoogleVerify()}
                      loading={oauthLoading === 'google'}
                      disabled={oauthLoading !== null || isDeleting}
                      accessibilityLabel="Verify your identity with Google"
                      accessibilityHint="Opens Google sign-in to confirm you own this account"
                      style={styles.oauthButton}
                    />
                  ) : null}
                  {oauthProviders.includes('apple') ? (
                    <AppButton
                      title="Verify with Apple"
                      variant="secondary"
                      size="md"
                      icon={<Ionicons name="logo-apple" size={18} color={colors.textPrimary} />}
                      onPress={() => void handleAppleVerify()}
                      loading={oauthLoading === 'apple'}
                      disabled={oauthLoading !== null || isDeleting}
                      accessibilityLabel="Verify your identity with Apple"
                      accessibilityHint="Opens Apple sign-in to confirm you own this account"
                      style={styles.oauthButton}
                    />
                  ) : null}
                </View>
              )}
              {oauthError ? (
                <View
                  style={[
                    styles.errorRow,
                    { backgroundColor: colors.dangerSubtle, borderColor: colors.dangerBorder },
                  ]}
                >
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={[styles.errorText, { color: colors.danger }]}>{oauthError}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* 2FA code — only when two-factor authentication is enabled */}
          {twoFactorEnabled ? (
            <Controller
              control={control}
              name="totpCode"
              render={({ field: { onChange, onBlur, value } }) => (
                <AppInput
                  label="Enter your 6-digit authentication code"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  placeholder="123456"
                  accessibilityLabel="Two-factor authentication code"
                  accessibilityHint="Enter the current 6-digit code from your authenticator app"
                  containerStyle={styles.fieldWrap}
                />
              )}
            />
          ) : null}

          {/* Reason (optional) */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Reason for leaving (optional)
            </Text>
            <View style={styles.reasonChips}>
              {REASON_OPTIONS.map((option) => {
                const selected = selectedReason === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      setSelectedReason((prev) => (prev === option.value ? null : option.value));
                      haptic.selection();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Reason: ${option.label}`}
                    accessibilityState={{ selected }}
                  >
                    <View
                      style={[
                        styles.reasonChip,
                        {
                          backgroundColor: selected ? colors.brand : colors.surface,
                          borderColor: selected ? colors.brand : colors.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.reasonChipText,
                          { color: selected ? colors.textInverse : colors.textPrimary },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Account label */}
          {username ? (
            <Text style={[styles.accountLabel, { color: colors.textMuted }]}>
              Account: @{username}
            </Text>
          ) : null}

          {/* Error state */}
          {deleteError ? (
            <View style={[styles.errorRow, { backgroundColor: colors.dangerSubtle, borderColor: colors.dangerBorder }]}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{deleteError}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Actions — destructive separated ── */}
        <View>
          <View style={styles.actionSection}>
            {/* Secondary — keep account */}
            <AppButton
              title="Keep my account"
              variant="secondary"
              size="lg"
              onPress={() => {
                haptic.light();
                navigation.goBack();
              }}
              disabled={isDeleting}
              hapticFeedback="light"
              accessibilityLabel="Keep my account and go back"
              style={styles.keepBtn}
            />

            {/* Primary destructive — full width, dominant */}
            <AppButton
              title="Delete my account permanently"
              variant="danger"
              size="lg"
              onPress={() => void handleSubmit(onSubmit)()}
              disabled={!canSubmit}
              loading={isDeleting}
              hapticFeedback="heavy"
              accessibilityLabel="Permanently delete account"
              accessibilityHint="This erases your account and all associated data. This action cannot be undone."
              style={styles.deleteBtn}
            />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    warningHero: {
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      padding: Space.md,
      marginBottom: Space.lg },
    warningHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginBottom: Space.sm },
    warningIcon: {
      width: Control.chrome,
      height: Control.chrome,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center' },
    warningHeaderText: {
      flex: 1 },
    warningTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight },
    warningSubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      marginTop: Space.xs - 3,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight },
    warningBody: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      lineHeight: TypographyV2.body.lineHeight + 2,
      letterSpacing: TypographyV2.body.letterSpacing },
    sectionLabel: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      marginBottom: Space.sm,
      marginTop: Space.sm },
    consequenceCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: Space.lg },
    consequenceRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
      gap: Space.sm },
    consequenceIcon: {
      width: Space.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Space.xs - 3 },
    consequenceText: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      lineHeight: TypographyV2.body.lineHeight + 2,
      letterSpacing: TypographyV2.body.letterSpacing },
    fieldWrap: {
      marginBottom: Space.md },
    fieldLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      marginBottom: Space.sm,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight },
    textInput: {
      borderWidth: Stroke.standard,
      borderRadius: Radius.xl,
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      minHeight: Space.xxl },
    fieldError: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      marginTop: Space.xs,
      letterSpacing: TypographyV2.meta.letterSpacing },
    oauthButtons: {
      gap: Space.sm },
    oauthButton: {
      width: '100%' },
    oauthNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md },
    oauthNoticeText: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight },
    oauthChangeText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    reasonChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm },
    reasonChip: {
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md },
    reasonChipText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    accountLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      marginTop: Space.xs,
      letterSpacing: TypographyV2.meta.letterSpacing },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      marginTop: Space.sm,
      marginBottom: Space.md },
    errorText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight + 2 },
    actionSection: {
      marginTop: Space.lg,
      gap: Space.sm },
    keepBtn: {
      width: '100%' },
    deleteBtn: {
      width: '100%' } });
}
