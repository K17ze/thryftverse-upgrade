import React, { useState } from 'react';
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
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/apiClient';
import { requestMyDataExport, deleteMyAccount } from '../services/accountApi';
import { disableTwoFactor, logoutFromSession } from '../services/authApi';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { SettingsHeader } from '../components/settings/SettingsHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import { SettingsCell } from '../components/SettingsCell';
import { MY_USER } from '../data/mockData';

export default function AccountSettingsScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const currentUser = useStore((state) => state.currentUser);
  const logout = useStore((state) => state.logout);
  const twoFactorEnabled = useStore((state) => state.twoFactorEnabled);
  const setTwoFactorEnabled = useStore((state) => state.setTwoFactorEnabled);
  const { show } = useToast();

  const user = currentUser ?? MY_USER;

  // Personal details (User type extensions are cast for settings forms)
  const userAny = user as any;
  const [email, setEmail] = useState(userAny?.email ?? '');
  const [phone, setPhone] = useState(userAny?.phone ?? '');
  const [fullName, setFullName] = useState(userAny?.fullName ?? user?.username ?? '');
  const [birthday, setBirthday] = useState(userAny?.birthday ?? '');

  // Preferences
  const [holidayMode, setHolidayMode] = useState(false);
  const [privateProfile, setPrivateProfile] = useState(false);

  // Linked accounts
  const facebookLinked = false;
  const googleLinked = false;

  // Async states
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingTwoFactor, setIsTogglingTwoFactor] = useState(false);
  const [disableTwoFactorModalVisible, setDisableTwoFactorModalVisible] = useState(false);
  const [disableTwoFactorCode, setDisableTwoFactorCode] = useState('');
  const [disableTwoFactorRecoveryCode, setDisableTwoFactorRecoveryCode] = useState('');

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

  const handleFacebookLink = () => {
    show('Facebook account linking is not available yet. Use Help Centre for support.', 'info');
  };

  const handleGoogleLink = () => {
    show('Google sign-in is available from the auth landing screen.', 'info');
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

  const handleSaveChanges = () => {
    show('Account details saved', 'success');
  };

  const isBusy = isExporting || isDeleting;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <SettingsHeader title="Account" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Personal Details */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <Text style={styles.sectionTitle}>Personal Details</Text>
          <SettingsCard>
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
          </SettingsCard>
        </Reanimated.View>

        {/* Preferences */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <SettingsCard>
            <SettingsCell
              icon="sunny-outline"
              iconColor={Colors.brand}
              title="Holiday Mode"
              subtitle="Hide your items for up to 90 days"
              variant="toggle"
              toggleValue={holidayMode}
              onToggle={setHolidayMode}
              isFirst
            />
            <SettingsCell
              icon="eye-off-outline"
              iconColor={Colors.brand}
              title="Private Profile"
              subtitle="Only followers can see your items"
              variant="toggle"
              toggleValue={privateProfile}
              onToggle={setPrivateProfile}
              isLast
            />
          </SettingsCard>
        </Reanimated.View>

        {/* Security */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
          <Text style={styles.sectionTitle}>Security</Text>
          <SettingsCard>
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
          </SettingsCard>
        </Reanimated.View>

        {/* Linked Accounts */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(240)}>
          <Text style={styles.sectionTitle}>Linked Accounts</Text>
          <SettingsCard>
            <SettingsCell
              icon="logo-facebook"
              iconColor="#1877F2"
              title="Facebook"
              value={facebookLinked ? 'Linked' : 'Link'}
              isFirst
              onPress={handleFacebookLink}
            />
            <SettingsCell
              icon="logo-google"
              iconColor="#EA4335"
              title="Google"
              value={googleLinked ? 'Linked' : 'Link'}
              isLast
              onPress={handleGoogleLink}
            />
          </SettingsCard>
        </Reanimated.View>

        {/* Save */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(320)}>
          <AppButton
            title="Save Changes"
            onPress={handleSaveChanges}
            variant="primary"
            size="md"
            style={styles.saveBtn}
            accessibilityLabel="Save account settings"
          />
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
      </ScrollView>

      {/* Disable 2FA Modal */}
      <Modal
        visible={disableTwoFactorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDisableTwoFactorModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
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
          </View>
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
  sectionTitle: {
    fontSize: Type.meta.size,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    marginLeft: Space.xs,
    marginTop: Space.lg,
    marginBottom: Space.sm,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
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
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footerActionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: 'rgba(255, 77, 77, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 77, 0.28)',
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
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
  },
  footerActionSubtitle: {
    marginTop: 2,
    fontSize: Type.caption.size,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  dangerActionBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 77, 0.26)',
    backgroundColor: 'rgba(255, 77, 77, 0.1)',
    borderRadius: Radius.lg,
    marginTop: Space.md,
  },
  dangerText: {
    color: Colors.danger,
    fontSize: Type.body.size,
    fontFamily: 'Inter_700Bold',
  },
  dangerSubtext: {
    marginTop: 2,
    color: Colors.textMuted,
    fontSize: Type.caption.size,
    fontFamily: 'Inter_500Medium',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Space.md,
    gap: Space.sm,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
  },
  modalCopy: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
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
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalBtnMutedText: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: Type.body.size,
  },
  modalBtnDanger: {
    backgroundColor: Colors.danger,
  },
  modalBtnDangerText: {
    color: Colors.background,
    fontFamily: 'Inter_700Bold',
    fontSize: Type.body.size,
  },
});
