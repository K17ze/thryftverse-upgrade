import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke, Control } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { parseApiError } from '../lib/apiClient';
import { requestAccountDeletion } from '../services/accountApi';
import { logoutFromSession } from '../services/authApi';
import { clearUserScopedQueryCache } from '../platform/server';
import { AppButton } from '../components/ui/AppButton';
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
  password: z
    .string()
    .min(1, 'Enter your password to verify identity'),
  reason: z.string().optional(),
});

type DeleteFormValues = z.infer<typeof deleteSchema>;

export default function DeleteAccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const logout = useStore((state) => state.logout);
  const { show } = useToast();
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Biometric gate (OWASP M5) ──
  // Account deletion is irreversible. Require biometric re-authentication
  // before showing the deletion form. The form itself still requires the
  // password (server-side verification), so this is defence-in-depth.
  const biometricGate = useBiometricGate();

  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [selectedReason, setSelectedReason] = React.useState<string | null>(null);

  const username = currentUser?.username ?? '';

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<DeleteFormValues>({
    resolver: zodResolver(deleteSchema),
    defaultValues: {
      confirmText: '',
      password: '',
      reason: undefined,
    },
    mode: 'onChange',
  });

  const confirmTextValue = watch('confirmText');
  const passwordValue = watch('password');
  const canSubmit =
    confirmTextValue?.trim().toUpperCase() === DELETE_CONFIRM_PHRASE &&
    (passwordValue?.length ?? 0) > 0 &&
    !isDeleting;

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
        );
        await logoutFromSession();
        clearUserScopedQueryCache();
        logout();
        haptic.heavy();
        show(`Account deletion submitted. Request ID: ${result.requestId}`, 'success');
        navigation.reset({ index: 0, routes: [{ name: 'AuthLanding' }] });
      } catch (error) {
        const parsed = parseApiError(error, 'Unable to delete account right now.');
        setDeleteError(parsed.message);
        haptic.light();
      } finally {
        setIsDeleting(false);
      }
    },
    [currentUser?.id, logout, show, haptic, navigation, selectedReason],
  );

  const consequences = useMemo(
    () => [
      { icon: 'person-remove-outline' as const, text: 'Your username, email, password and profile are erased immediately.' },
      { icon: 'location-outline' as const, text: 'All saved delivery addresses are removed.' },
      { icon: 'card-outline' as const, text: 'Saved payment methods and bank details are removed.' },
      { icon: 'wallet-outline' as const, text: 'Wallet history and payout records are deleted.' },
      { icon: 'cube-outline' as const, text: 'Active listings remain visible to buyers until they expire, but you\'ll no longer manage them.' },
      { icon: 'alert-circle-outline' as const, text: 'Pending payouts, open disputes or active orders may need to be resolved before full erasure.' },
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
          paddingBottom: insets.bottom + Space.xxl,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Warning hero ── */}
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300)}>
          <View style={[styles.warningHero, { backgroundColor: `${colors.danger}10`, borderColor: `${colors.danger}30` }]}>
            <View style={styles.warningHeader}>
              <View style={[styles.warningIcon, { backgroundColor: colors.danger }]}>
                <Ionicons name="warning" size={20} color="#FFFFFF" />
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
        </Reanimated.View>

        {/* ── What happens ── */}
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300).delay(60)}>
          <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>What happens when you delete</Text>
          <View style={[styles.consequenceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {consequences.map((item, i) => (
              <View
                key={i}
                style={[
                  styles.consequenceRow,
                  i < consequences.length - 1 && {
                    borderBottomColor: colors.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
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
        </Reanimated.View>

        {/* ── Confirmation form ── */}
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300).delay(120)}>
          <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>
            Confirm your identity
          </Text>

          {/* Type DELETE */}
          <Controller
            control={control}
            name="confirmText"
            render={({ field: { onChange, onBlur, value } }) => (
              <View style={styles.fieldWrap}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Type {DELETE_CONFIRM_PHRASE} to permanently delete your account
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    { color: colors.textPrimary, borderColor: errors.confirmText ? colors.danger : colors.border },
                  ]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder={DELETE_CONFIRM_PHRASE}
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Type DELETE to confirm account deletion"
                  accessibilityHint={`Type the word ${DELETE_CONFIRM_PHRASE} to confirm`}
                />
                {errors.confirmText ? (
                  <Text style={[styles.fieldError, { color: colors.danger }]}>
                    {errors.confirmText.message}
                  </Text>
                ) : null}
              </View>
            )}
          />

          {/* Password */}
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <View style={styles.fieldWrap}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Enter your password to verify identity
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    { color: colors.textPrimary, borderColor: errors.password ? colors.danger : colors.border },
                  ]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Password"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Password to verify identity before deletion"
                  accessibilityHint="Enter your account password to confirm you are the account owner"
                />
                {errors.password ? (
                  <Text style={[styles.fieldError, { color: colors.danger }]}>
                    {errors.password.message}
                  </Text>
                ) : null}
              </View>
            )}
          />

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
                          borderColor: selected ? colors.brand : colors.border,
                        },
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
            <View style={[styles.errorRow, { backgroundColor: `${colors.danger}10`, borderColor: `${colors.danger}30` }]}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{deleteError}</Text>
            </View>
          ) : null}
        </Reanimated.View>

        {/* ── Actions — destructive separated ── */}
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300).delay(180)}>
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
        </Reanimated.View>
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
      marginBottom: Space.lg,
    },
    warningHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginBottom: Space.sm,
    },
    warningIcon: {
      width: Control.chrome,
      height: Control.chrome,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    warningHeaderText: {
      flex: 1,
    },
    warningTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
      lineHeight: Type.bodyEmphasis.lineHeight,
    },
    warningSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs - 3,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    warningBody: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.body.lineHeight + 2,
      letterSpacing: Type.body.letterSpacing,
    },
    sectionLabel: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.subtitle.letterSpacing,
      lineHeight: Type.subtitle.lineHeight,
      marginBottom: Space.sm,
      marginTop: Space.sm,
    },
    consequenceCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: Space.lg,
    },
    consequenceRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
      gap: Space.sm,
    },
    consequenceIcon: {
      width: Space.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Space.xs - 3,
    },
    consequenceText: {
      flex: 1,
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.body.lineHeight + 2,
      letterSpacing: Type.body.letterSpacing,
    },
    fieldWrap: {
      marginBottom: Space.md,
    },
    fieldLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      marginBottom: Space.sm,
      letterSpacing: Type.body.letterSpacing,
      lineHeight: Type.body.lineHeight,
    },
    textInput: {
      borderWidth: Stroke.standard,
      borderRadius: Radius.xl,
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.medium,
      minHeight: Space.xxl,
    },
    fieldError: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      marginTop: Space.xs,
      letterSpacing: Type.caption.letterSpacing,
    },
    reasonChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
    },
    reasonChip: {
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
    },
    reasonChipText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      letterSpacing: Type.caption.letterSpacing,
    },
    accountLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs,
      letterSpacing: Type.caption.letterSpacing,
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      marginTop: Space.sm,
      marginBottom: Space.md,
    },
    errorText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight + 2,
    },
    actionSection: {
      marginTop: Space.lg,
      gap: Space.sm,
    },
    keepBtn: {
      width: '100%',
    },
    deleteBtn: {
      width: '100%',
    },
  });
}
