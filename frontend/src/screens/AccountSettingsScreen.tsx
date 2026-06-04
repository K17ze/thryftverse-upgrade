import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore, User } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/apiClient';
import { requestMyDataExport, deleteMyAccount, updateUserProfile as updateUserProfileApi } from '../services/accountApi';
import { disableTwoFactor, logoutFromSession } from '../services/authApi';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { GlassCard } from '../components/ui/GlassSurface';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import { SettingsCell } from '../components/SettingsCell';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Typography } from '../constants/typography';

export default function AccountSettingsScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const currentUser = useStore((state) => state.currentUser);
  const logout = useStore((state) => state.logout);
  const twoFactorEnabled = useStore((state) => state.twoFactorEnabled);
  const setTwoFactorEnabled = useStore((state) => state.setTwoFactorEnabled);
  const accountPreferences = useStore((state) => state.accountPreferences);
  const updateAccountPreferences = useStore((state) => state.updateAccountPreferences);
  const updateUserProfile = useStore((state) => state.updateUserProfile);
  const { show } = useToast();

  const user = currentUser;

  // Personal details (User type extensions are cast for settings forms)
  const userAny = user as any;
  const [email, setEmail] = useState(userAny?.email ?? '');
  const [phone, setPhone] = useState(userAny?.phone ?? '');
  const [fullName, setFullName] = useState(userAny?.fullName ?? user?.username ?? '');
  const [birthday, setBirthday] = useState(userAny?.birthday ?? '');

  // Preferences
  const holidayMode = accountPreferences.holidayMode;
  const privateProfile = accountPreferences.privateProfile;

  // Async states
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingTwoFactor, setIsTogglingTwoFactor] = useState(false);
  const [disableTwoFactorModalVisible, setDisableTwoFactorModalVisible] = useState(false);
  const [disableTwoFactorCode, setDisableTwoFactorCode] = useState('');
  const [disableTwoFactorRecoveryCode, setDisableTwoFactorRecoveryCode] = useState('');
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsHydrating(false), 400);
    return () => clearTimeout(timer);
  }, []);

  const handleToggleTwoFactor = async (enabled: boolean) => {
    if (isTogglingTwoFactor) return;
    if (enabled) {
      navigation.navigate('TwoFactorSetup');
      return;
    }
    setDisableTwoFactorCode('');
    setDisableTwoFactorRecoveryCode('');
    setDisableTwoFactorModalVisible(true);
  };

  const closeDisableTwoFactorModal = () => {
    if (isTogglingTwoFactor) return;
    setDisableTwoFactorModalVisible(false);
  };

  const confirmDisableTwoFactor = async () => {
    const normalizedCode = disableTwoFactorCode.replace(/\s+/g, '').trim();
    const normalizedRecoveryCode = disableTwoFactorRecoveryCode.trim().toUpperCase();

    if (!normalizedCode && !normalizedRecoveryCode) {
      show('Enter your authenticator code or a recovery code to disable 2FA.', 'error');
      return;
    }

    setIsTogglingTwoFactor(true);
    try {
      await disableTwoFactor({
        code: normalizedCode || undefined,
        recoveryCode: normalizedRecoveryCode || undefined,
      });
      setTwoFactorEnabled(false);
      setDisableTwoFactorModalVisible(false);
      show('Two-factor authentication disabled', 'info');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to disable two-factor authentication right now.');
      show(parsed.message, 'error');
    } finally {
      setIsTogglingTwoFactor(false);
    }
  };

  const handleDownloadData = async () => {
    if (!currentUser?.id) {
      show('Please sign in before requesting a data export.', 'error');
      return;
    }
    setIsExporting(true);
    try {
      const result = await requestMyDataExport();
      const recordText = result.estimatedRecords > 0 ? ` (${result.estimatedRecords} records)` : '';
      show(`Data export generated${recordText}. Request ID: ${result.requestId}`, 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to export account data right now.');
      show(parsed.message, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccountSupport = () => {
    navigation.navigate('HelpSupport');
    show('Contact support to complete your account deletion request.', 'info');
  };

  const confirmDeleteAccount = async () => {
    if (!currentUser?.id) {
      show('Please sign in before deleting your account.', 'error');
      return;
    }
    setIsDeleting(true);
    try {
      const result = await deleteMyAccount('User initiated account deletion from mobile settings');
      await logoutFromSession();
      logout();
      show(`Account deleted. Request ID: ${result.requestId}`, 'success');
      navigation.reset({
        index: 0,
        routes: [{ name: 'AuthLanding' }],
      });
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to delete account right now.');
      show(parsed.message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This action cannot be undone. Do you want to delete this account now?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Contact support', style: 'default', onPress: handleDeleteAccountSupport },
        { text: 'Delete now', style: 'destructive', onPress: () => void confirmDeleteAccount() },
      ]
    );
  };

  const handleSaveChanges = async () => {
    if (isSaving) return;
    const previousEmail = email;
    const previousPhone = phone;
    const previousFullName = fullName;
    const previousBirthday = birthday;

    updateUserProfile({ email, phone, fullName, birthday });
    show('Saving account details…', 'info');
    setIsSaving(true);

    try {
      await updateUserProfileApi({ email, phone, fullName, birthday });
      show('Account details saved', 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to save account details.');
      show(parsed.message, 'error');
      // Rollback optimistic update
      setEmail(previousEmail);
      setPhone(previousPhone);
      setFullName(previousFullName);
      setBirthday(previousBirthday);
      updateUserProfile({ email: previousEmail, phone: previousPhone, fullName: previousFullName, birthday: previousBirthday });
    } finally {
      setIsSaving(false);
    }
  };

  const isBusy = isExporting || isDeleting || isSaving;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <ScreenHeader title="Account" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Personal Details */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <Text style={styles.sectionTitle}>Personal Details</Text>
          {isHydrating ? (
            <View style={styles.skeletonWrap}>
              <SkeletonLoader width="100%" height={72} borderRadius={Radius.lg} />
              <View style={{ height: Space.sm }} />
              <SkeletonLoader width="100%" height={72} borderRadius={Radius.lg} />
              <View style={{ height: Space.sm }} />
              <SkeletonLoader width="100%" height={72} borderRadius={Radius.lg} />
              <View style={{ height: Space.sm }} />
              <SkeletonLoader width="100%" height={72} borderRadius={Radius.lg} />
            </View>
          ) : (
          <View style={styles.surfaceCard}>
            <AppInput
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              containerStyle={styles.inputSpacing}
            />
            <AppInput
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              helperText="Used for shipping labels. Not public."
              containerStyle={styles.inputSpacing}
            />
            <AppInput
              label="Phone Number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              containerStyle={styles.inputSpacing}
            />
            <AppInput
              label="Date of Birth"
              value={birthday}
              onChangeText={setBirthday}
              suffix={<Ionicons name="calendar-outline" size={20} color={Colors.textMuted} />}
            />
          </View>
          )}
        </Reanimated.View>

        {/* Preferences */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.surfaceCard}>
            <SettingsCell
              icon="sunny-outline"
              iconColor={Colors.brand}
              title="Holiday Mode"
              subtitle="Hide your items for up to 90 days"
              variant="toggle"
              toggleValue={holidayMode}
              onToggle={((v: boolean) => updateAccountPreferences({ holidayMode: v }))}
              isFirst
            />
            <SettingsCell
              icon="eye-off-outline"
              iconColor={Colors.brand}
              title="Private Profile"
              subtitle="Only followers can see your items"
              variant="toggle"
              toggleValue={privateProfile}
              onToggle={((v: boolean) => updateAccountPreferences({ privateProfile: v }))}
              isLast
            />
          </View>
        </Reanimated.View>

        {/* Security */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.surfaceCard}>
            <SettingsCell
              icon="key-outline"
              iconColor={Colors.textSecondary}
              title="Password"
              subtitle="Last changed 2 months ago"
              isFirst
              onPress={() => navigation.navigate('ChangePassword')}
            />
            <SettingsCell
              icon="shield-checkmark-outline"
              iconColor={Colors.success}
              title="Two-Factor Authentication"
              subtitle="Authenticator app verification"
              variant="toggle"
              toggleValue={twoFactorEnabled}
              onToggle={(value) => void handleToggleTwoFactor(value)}
              isLast
            />
          </View>
        </Reanimated.View>

        {/* Footer Actions */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(400)}>
          <AppButton
            title={isExporting ? 'Preparing export...' : 'Download my data'}
            subtitle={isExporting ? undefined : 'Get a machine-readable account export.'}
            icon={
              isExporting ? (
                <ActivityIndicator color={Colors.textPrimary} size="small" />
              ) : (
                <Ionicons name="download-outline" size={18} color={Colors.textPrimary} />
              )
            }
            trailingIcon={
              !isExporting ? <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} /> : undefined
            }
            onPress={() => void handleDownloadData()}
            disabled={isBusy}
            variant="secondary"
            size="lg"
            align="start"
            style={[styles.footerActionBtn, isBusy && styles.actionDisabled]}
            titleStyle={styles.footerActionTitle}
            subtitleStyle={styles.footerActionSubtitle}
            iconContainerStyle={styles.footerActionIconWrap}
            trailingIconContainerStyle={styles.footerActionChevronWrap}
            accessibilityLabel="Download my account data"
          />
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.duration(300).delay(480)}>
          <AppButton
            title={isDeleting ? 'Deleting account...' : 'Delete Account'}
            subtitle={isDeleting ? undefined : 'Permanently removes your profile and listing history.'}
            icon={
              isDeleting ? (
                <ActivityIndicator color={Colors.danger} size="small" />
              ) : (
                <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              )
            }
            trailingIcon={
              !isDeleting ? <Ionicons name="chevron-forward" size={18} color={Colors.danger} /> : undefined
            }
            onPress={handleDeleteAccount}
            disabled={isBusy}
            variant="secondary"
            size="lg"
            align="start"
            style={[styles.dangerActionBtn, isBusy && styles.actionDisabled]}
            titleStyle={styles.dangerText}
            subtitleStyle={styles.dangerSubtext}
            iconContainerStyle={styles.footerActionIconWrapDanger}
            trailingIconContainerStyle={styles.footerActionChevronWrapDanger}
            accessibilityLabel="Delete account"
          />
        </Reanimated.View>

        {/* Save */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(320)}>
          <AppButton
            title={isSaving ? 'Saving…' : 'Save Changes'}
            onPress={() => void handleSaveChanges()}
            disabled={isSaving}
            variant="primary"
            size="md"
            style={styles.saveBtn}
            accessibilityLabel="Save account settings"
          />
        </Reanimated.View>
      </ScrollView>

      {/* Disable 2FA Modal */}
      <Modal
        visible={disableTwoFactorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDisableTwoFactorModal}
      >
        <View style={styles.modalOverlay}>
          <GlassCard intensity={35} style={{ marginHorizontal: 0, marginBottom: 0 }}>
            <Text style={styles.modalTitle}>Disable 2FA</Text>
            <Text style={styles.modalCopy}>
              Confirm with your authenticator code or a recovery code.
            </Text>

            <AppInput
              label="Authenticator code"
              value={disableTwoFactorCode}
              onChangeText={setDisableTwoFactorCode}
              keyboardType="number-pad"
              placeholder="123456"
              editable={!isTogglingTwoFactor}
              maxLength={12}
              containerStyle={styles.modalInputSpacing}
            />

            <AppInput
              label="Recovery code"
              value={disableTwoFactorRecoveryCode}
              onChangeText={setDisableTwoFactorRecoveryCode}
              autoCapitalize="characters"
              placeholder="ABCD-EFGH"
              editable={!isTogglingTwoFactor}
              maxLength={32}
              containerStyle={styles.modalInputSpacing}
            />

            <View style={styles.modalActionRow}>
              <AppButton
                title="Cancel"
                onPress={closeDisableTwoFactorModal}
                disabled={isTogglingTwoFactor}
                variant="secondary"
                size="sm"
                style={[styles.modalBtn, styles.modalBtnMuted]}
                titleStyle={styles.modalBtnMutedText}
                accessibilityLabel="Cancel disabling two-factor authentication"
              />
              <AppButton
                title={isTogglingTwoFactor ? 'Disabling...' : 'Disable'}
                icon={
                  isTogglingTwoFactor ? (
                    <ActivityIndicator color={Colors.background} size="small" />
                  ) : undefined
                }
                onPress={() => void confirmDisableTwoFactor()}
                disabled={isTogglingTwoFactor}
                variant="primary"
                size="sm"
                style={[styles.modalBtn, styles.modalBtnDanger]}
                titleStyle={styles.modalBtnDangerText}
                accessibilityLabel="Confirm disable two-factor authentication"
              />
            </View>
          </GlassCard>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  skeletonWrap: {
    marginBottom: Space.sm,
  },
  sectionTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginLeft: Space.xs,
    marginTop: Space.lg,
    marginBottom: Space.sm,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
  },
  surfaceCard: {
    marginHorizontal: 0,
    marginBottom: Space.sm,
    borderRadius: Radius.xl,
    padding: Space.md,
    backgroundColor: Colors.surface,
  },
  inputSpacing: {
    marginBottom: Space.sm,
  },
  saveBtn: {
    marginTop: Space.lg,
    borderRadius: Radius.xl,
  },
  footerActionBtn: {
    marginTop: Space.md,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.xl,
  },
  footerActionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  footerActionChevronWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  footerActionIconWrapDanger: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 77, 77, 0.12)',
  },
  footerActionChevronWrapDanger: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  footerActionTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  footerActionSubtitle: {
    marginTop: 2,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  dangerActionBtn: {
    backgroundColor: 'rgba(255, 77, 77, 0.08)',
    borderRadius: Radius.xl,
    marginTop: Space.md,
  },
  dangerText: {
    color: Colors.danger,
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
  },
  dangerSubtext: {
    marginTop: 2,
    color: Colors.textMuted,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
  },
  modalCopy: {
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    marginBottom: Space.xs,
  },
  modalInputSpacing: {
    marginBottom: Space.xs,
  },
  modalActionRow: {
    marginTop: Space.xs,
    flexDirection: 'row',
    gap: Space.sm,
  },
  modalBtn: {
    flex: 1,
    height: 46,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnMuted: {
    backgroundColor: Colors.surfaceAlt,
  },
  modalBtnMutedText: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  modalBtnDanger: {
    backgroundColor: Colors.danger,
  },
  modalBtnDangerText: {
    color: Colors.background,
    fontFamily: Typography.family.bold,
    fontSize: Type.body.size,
  },
});
