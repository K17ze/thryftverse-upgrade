import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { parseApiError } from '../lib/apiClient';
import { requestMyDataExport, deleteMyAccount } from '../services/accountApi';
import { logoutFromSession } from '../services/authApi';
import { clearUserScopedQueryCache } from '../platform/server';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';
type Props = NativeStackScreenProps<RootStackParamList, 'AccountControl'>;

type Phase = 'overview' | 'export' | 'delete-info' | 'delete-confirm';

const DELETE_CONFIRM_PHRASE = 'DELETE';

export default function AccountControlScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const logout = useStore((state) => state.logout);
  const { show } = useToast();
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reducedMotionEnabled = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('overview');
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const username = currentUser?.username ?? '';

  const handleDownloadData = useCallback(async () => {
    if (!currentUser?.id) {
      show('Sign in before requesting a data export.', 'error');
      return;
    }
    setIsExporting(true);
    try {
      const result = await requestMyDataExport();
      const recordText = result.estimatedRecords > 0 ? ` (${result.estimatedRecords} records)` : '';
      show(`Data export generated${recordText}. Request ID: ${result.requestId}`, 'success');
      setPhase('overview');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to export account data right now.');
      show(parsed.message, 'error');
    } finally {
      setIsExporting(false);
    }
  }, [currentUser?.id, show]);

  const confirmDeleteAccount = useCallback(async () => {
    if (!currentUser?.id) {
      show('Sign in before deleting your account.', 'error');
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteMyAccount('User initiated account deletion from mobile settings');
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
  }, [currentUser?.id, logout, show, haptic, navigation]);

  const canConfirmDelete = deleteConfirmText.trim().toUpperCase() === DELETE_CONFIRM_PHRASE;

  const renderOverview = () => (
    <>
      {/* Hero summary — account control status */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
              <Ionicons name="shield-outline" size={18} color={colors.textInverse} accessible={false} />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Account control</Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                Data and account control
              </Text>
            </View>
          </View>
        </View>
      </Reanimated.View>

      {/* Download data — supported, compact row */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
      <View style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.optionHeader}>
          <View style={[styles.optionIcon, { borderColor: colors.border }]}>
            <Ionicons name="download-outline" size={20} color={colors.textPrimary} />
          </View>
          <View style={styles.optionHeaderText}>
            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>Download your data</Text>
            <Text style={[styles.optionSubtitle, { color: colors.textMuted }]}>
              Export a copy of your account data
            </Text>
          </View>
        </View>
        <Text style={[styles.optionBody, { color: colors.textSecondary }]}>
          We'll generate a data export covering your addresses, payment methods, orders, bids, co-own holdings and consent records. A request ID is issued for tracking.
        </Text>
        <AnimatedPressable
          style={[styles.optionBtn, { borderColor: colors.border }]}
          onPress={handleDownloadData}
          disabled={isExporting}
          activeOpacity={0.8}
          scaleValue={0.98}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel="Download your data"
          accessibilityState={{ disabled: isExporting }}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <Text style={[styles.optionBtnText, { color: colors.textPrimary }]}>Request export</Text>
          )}
        </AnimatedPressable>
      </View>
      </Reanimated.View>

      {/* Delete — restrained navigation entry, not a giant red card */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
      <View style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.optionHeader}>
          <View style={[styles.optionIcon, { borderColor: colors.border }]}>
            <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
          </View>
          <View style={styles.optionHeaderText}>
            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>Delete account permanently</Text>
            <Text style={[styles.optionSubtitle, { color: colors.textMuted }]}>
              Erase your account and data
            </Text>
          </View>
        </View>
        <Text style={[styles.optionBody, { color: colors.textSecondary }]}>
          This permanently erases your account, personal data, addresses, payment methods and wallet history. This action cannot be undone.
        </Text>
        <AnimatedPressable
          style={[styles.optionBtn, { borderColor: colors.border }]}
          onPress={() => { haptic.medium(); setPhase('delete-info'); }}
          activeOpacity={0.8}
          scaleValue={0.98}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel="Continue to account deletion"
        >
          <Text style={[styles.optionBtnText, { color: colors.textPrimary }]}>Continue</Text>
        </AnimatedPressable>
      </View>
      </Reanimated.View>
    </>
  );

  const renderDeleteInfo = () => (
    <>
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
      <View style={styles.introBlock}>
        <View style={[styles.phaseBadge, { backgroundColor: `${colors.danger}15` }]}>
          <Ionicons name="warning-outline" size={16} color={colors.danger} accessible={false} />
          <Text style={[styles.phaseBadgeText, { color: colors.danger }]}>Permanent action</Text>
        </View>
        <Text style={styles.introTitle}>Before you delete</Text>
        <Text style={[styles.introBody, { color: colors.textSecondary }]}>
          Review what happens when you permanently delete your Thryftverse account.
        </Text>
      </View>
      </Reanimated.View>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
      <View style={[styles.consequenceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ConsequenceRow icon="person-remove-outline" text="Your username, email, password and profile are erased immediately." />
        <ConsequenceRow icon="location-outline" text="All saved delivery addresses are removed." />
        <ConsequenceRow icon="card-outline" text="Saved payment methods and bank details are removed." />
        <ConsequenceRow icon="wallet-outline" text="Wallet history and payout records are deleted." />
        <ConsequenceRow icon="cube-outline" text="Active listings remain visible to buyers until they expire, but you'll no longer manage them from this account." />
        <ConsequenceRow icon="alert-circle-outline" text="Pending payouts, open disputes or active orders may need to be resolved before full erasure. Contact support if you have outstanding obligations." isLast />
      </View>
      </Reanimated.View>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
      <Text style={[styles.consequenceFootnote, { color: colors.textMuted }]}>
        If you have unresolved orders or payouts, we recommend resolving them before deletion. Contact support for help too.
      </Text>

      <View style={styles.deleteInfoActions}>
        <AnimatedPressable
          style={[styles.secondaryBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          onPress={() => { haptic.light(); setPhase('overview'); }}
          activeOpacity={0.8}
          scaleValue={0.98}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Go back to account control"
        >
          <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Back</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.dangerBtn, { backgroundColor: colors.danger, borderColor: colors.danger }]}
          onPress={() => { haptic.heavy(); setPhase('delete-confirm'); }}
          activeOpacity={0.85}
          scaleValue={0.98}
          hapticFeedback="heavy"
          accessibilityRole="button"
          accessibilityLabel="Continue to final confirmation"
        >
          <Text style={[styles.dangerBtnText, { color: colors.textInverse }]}>Continue</Text>
        </AnimatedPressable>
      </View>
      </Reanimated.View>
    </>
  );

  const renderDeleteConfirm = () => (
    <>
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
      <View style={styles.introBlock}>
        <View style={[styles.phaseBadge, { backgroundColor: `${colors.danger}15` }]}>
          <Ionicons name="warning-outline" size={16} color={colors.danger} accessible={false} />
          <Text style={[styles.phaseBadgeText, { color: colors.danger }]}>Final confirmation</Text>
        </View>
        <Text style={styles.introTitle}>Type DELETE to confirm</Text>
        <Text style={[styles.introBody, { color: colors.textSecondary }]}>
          This is your last chance to cancel. Once you confirm, your account cannot be recovered.
        </Text>
      </View>
      </Reanimated.View>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
      <View style={styles.confirmFieldWrap}>
        <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>
          Type {DELETE_CONFIRM_PHRASE} to permanently delete your account
        </Text>
        <TextInput
          style={[styles.confirmInput, { color: colors.textPrimary, borderColor: colors.border }]}
          value={deleteConfirmText}
          onChangeText={setDeleteConfirmText}
          autoCapitalize="characters"
          placeholder={DELETE_CONFIRM_PHRASE}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Type DELETE to confirm account deletion"
        />
        {username ? (
          <Text style={[styles.confirmAccountLabel, { color: colors.textMuted }]}>
            Account: @{username}
          </Text>
        ) : null}
        {deleteError ? (
          <View style={styles.deleteErrorRow}>
            <Ionicons name="alert-circle" size={14} color={colors.danger} accessible={false} />
            <Text style={styles.deleteErrorText}>{deleteError}</Text>
          </View>
        ) : null}
      </View>
      </Reanimated.View>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
      <View style={styles.deleteConfirmActions}>
        <AnimatedPressable
          style={[styles.secondaryBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          onPress={() => { haptic.light(); setDeleteConfirmText(''); setDeleteError(null); setPhase('delete-info'); }}
          activeOpacity={0.8}
          scaleValue={0.98}
          hapticFeedback="light"
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Cancel and go back"
        >
          <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Cancel</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.dangerBtn, { backgroundColor: colors.danger, borderColor: colors.danger, opacity: (!canConfirmDelete || isDeleting) ? 0.4 : 1 }]}
          onPress={confirmDeleteAccount}
          activeOpacity={0.85}
          scaleValue={0.98}
          hapticFeedback="heavy"
          disabled={!canConfirmDelete || isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Permanently delete account"
          accessibilityState={{ disabled: !canConfirmDelete || isDeleting }}
        >
          {isDeleting ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <Text style={[styles.dangerBtnText, { color: colors.textInverse }]}>Delete permanently</Text>
          )}
        </AnimatedPressable>
      </View>
      </Reanimated.View>
    </>
  );

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Account control"
          onBack={() => {
            if (phase === 'overview') {
              navigation.goBack();
            } else if (phase === 'delete-info') {
              setPhase('overview');
            } else if (phase === 'delete-confirm') {
              setDeleteConfirmText('');
              setDeleteError(null);
              setPhase('delete-info');
            } else if (phase === 'export') {
              setPhase('overview');
            }
          }}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: insets.bottom + Space.lg }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
          {phase === 'overview' && renderOverview()}
          {phase === 'delete-info' && renderDeleteInfo()}
          {phase === 'delete-confirm' && renderDeleteConfirm()}
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function ConsequenceRow({ icon, text, isLast }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; isLast?: boolean }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.consequenceRow, !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={styles.consequenceIcon}>
        <Ionicons name={icon} size={18} color={colors.textMuted} accessible={false} />
      </View>
      <Text style={[styles.consequenceText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginBottom: Space.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  heroIcon: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  heroSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs / 2,
  },
  introBlock: {
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    gap: Space.xs,
  },
  introTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
    lineHeight: Type.title.lineHeight,
  },
  introBody: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight + 2,
    letterSpacing: Type.body.letterSpacing,
  },
  phaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    alignSelf: 'flex-start',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    marginBottom: Space.xs,
  },
  phaseBadgeText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },
  optionCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginBottom: Space.md,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  optionIcon: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionHeaderText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    lineHeight: Type.bodyEmphasis.lineHeight,
  },
  optionSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs / 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  optionBody: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight + 2,
    letterSpacing: Type.body.letterSpacing,
    marginBottom: Space.md,
  },
  optionBtn: {
    borderRadius: Radius.md,
    paddingVertical: Space.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit,
  },
  optionBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  consequenceCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: Space.md,
  },
  consequenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  consequenceIcon: {
    width: Space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.xs / 4,
  },
  consequenceText: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight + 2,
    letterSpacing: Type.body.letterSpacing,
  },
  consequenceFootnote: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight + 2,
    letterSpacing: Type.caption.letterSpacing,
    marginBottom: Space.lg,
  },
  deleteInfoActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.lg,
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.lg,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: Space.smMd,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: Space.xxl,
  },
  secondaryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  dangerBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: Space.smMd,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: Space.xxl,
  },
  dangerBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.body.letterSpacing,
  },
  confirmFieldWrap: {
    marginBottom: Space.xl,
  },
  confirmLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    marginBottom: Space.sm,
    letterSpacing: Type.body.letterSpacing,
  },
  confirmInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Space.xs / 2,
    minHeight: Space.xxl,
  },
  confirmAccountLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.sm,
    letterSpacing: Type.caption.letterSpacing,
  },
  deleteErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.sm,
  },
  deleteErrorText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.danger,
    letterSpacing: Type.caption.letterSpacing,
  },
  });
}
