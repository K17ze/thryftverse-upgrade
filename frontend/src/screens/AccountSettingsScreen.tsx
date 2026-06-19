import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { parseApiError } from '../lib/apiClient';
import { requestMyDataExport, deleteMyAccount, updateUserProfile as updateUserProfileApi } from '../services/accountApi';
import { disableTwoFactor, logoutFromSession } from '../services/authApi';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { CachedImage } from '../components/CachedImage';
import { Typography } from '../theme/designTokens';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { FlagshipScreen, FlagshipHeader, FlagshipStickyFooter, FlagshipDangerZone } from '../components/flagship';

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
  const haptic = useHaptic();

  const user = currentUser;
  const userAny = user as any;
  const [email, setEmail] = useState(userAny?.email ?? '');
  const [phone, setPhone] = useState(userAny?.phone ?? '');
  const [displayName, setDisplayName] = useState(userAny?.displayName ?? userAny?.fullName ?? user?.username ?? '');
  const [birthday, setBirthday] = useState(userAny?.birthday ?? '');

  const holidayMode = accountPreferences.holidayMode;
  const privateProfile = accountPreferences.privateProfile;

  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingTwoFactor, setIsTogglingTwoFactor] = useState(false);
  const [disableTwoFactorModalVisible, setDisableTwoFactorModalVisible] = useState(false);
  const [disableTwoFactorCode, setDisableTwoFactorCode] = useState('');
  const [disableTwoFactorRecoveryCode, setDisableTwoFactorRecoveryCode] = useState('');
  const [isHydrating, setIsHydrating] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

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
      navigation.reset({ index: 0, routes: [{ name: 'AuthLanding' }] });
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
    const previousDisplayName = displayName;
    const previousBirthday = birthday;

    updateUserProfile({ phone, displayName, birthday });
    show('Saving account details…', 'info');
    setIsSaving(true);

    try {
      await updateUserProfileApi({ phone, displayName });
      show('Account details saved', 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to save account details.');
      show(parsed.message, 'error');
      setEmail(previousEmail);
      setPhone(previousPhone);
      setDisplayName(previousDisplayName);
      setBirthday(previousBirthday);
      updateUserProfile({ phone: previousPhone, displayName: previousDisplayName, birthday: previousBirthday });
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = (field: string, current: string) => {
    setEditingField(field);
    setEditValue(current);
  };

  const closeEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const saveEdit = () => {
    if (editingField === 'email') setEmail(editValue);
    if (editingField === 'phone') setPhone(editValue);
    if (editingField === 'fullName') setDisplayName(editValue);
    if (editingField === 'birthday') setBirthday(editValue);
    closeEdit();
    handleSaveChanges();
  };

  const isBusy = isExporting || isDeleting || isSaving;

  const DetailRow = ({
    label,
    value,
    onPress,
    isFirst = false,
    isLast = false,
    danger = false,
    loading = false,
  }: {
    label: string;
    value: string;
    onPress?: () => void;
    isFirst?: boolean;
    isLast?: boolean;
    danger?: boolean;
    loading?: boolean;
  }) => (
    <SettingsRow
      title={label}
      value={loading ? undefined : value}
      onPress={onPress}
      isFirst={isFirst}
      isLast={isLast}
      danger={danger}
    >
      {loading ? <ActivityIndicator size="small" color={danger ? Colors.danger : Colors.textMuted} /> : null}
    </SettingsRow>
  );

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Account" subtitle="Manage your identity and information" onBack={() => navigation.goBack()} />}
      stickyFooter={
        <FlagshipStickyFooter
          actions={[
            {
              label: isSaving ? 'Saving…' : 'Save Changes',
              onPress: () => void handleSaveChanges(),
              variant: 'primary',
              disabled: isSaving || isBusy,
              loading: isSaving,
            },
          ]}
        />
      }
    >
      {/* Identity Summary */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
        <View style={[styles.identitySurface, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <View style={styles.identityRow}>
            {user?.avatar ? (
              <View style={styles.identityAvatar}>
                <CachedImage uri={user.avatar} style={styles.identityAvatarImage} contentFit="cover" />
              </View>
            ) : (
              <View style={[styles.identityAvatarFallback, { backgroundColor: Colors.surfaceAlt }]}>
                <Text style={styles.identityAvatarText}>{(user?.username ?? '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.identityText}>
              <Text style={styles.identityName}>{displayName || user?.username || 'Not signed in'}</Text>
              <Text style={[styles.identityMeta, { color: Colors.textMuted }]}>@{user?.username ?? '—'}</Text>
            </View>
            <AnimatedPressable
              onPress={() => navigation.navigate('EditProfile')}
              scaleValue={0.92}
              hapticFeedback="light"
            >
              <Text style={[styles.identityEdit, { color: Colors.brand }]}>Edit</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Reanimated.View>

      {/* Personal Information */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
        <SettingsSection title="Personal information" noCard>
            {isHydrating ? (
              <View style={{ padding: 16 }}>
                <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
                <View style={{ height: 8 }} />
                <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
                <View style={{ height: 8 }} />
                <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
              </View>
            ) : (
              <>
                <DetailRow label="Display name" value={displayName} onPress={() => openEdit('fullName', displayName)} />
                <DetailRow label="Username" value={user?.username ?? '—'} />
                <DetailRow
                  label="Country"
                  value={(userAny?.country as string) || '—'}
                  isLast
                />
              </>
            )}
        </SettingsSection>
      </Reanimated.View>

      {/* Contact Information */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(100)}>
        <SettingsSection title="Contact" noCard>
            {isHydrating ? (
              <View style={{ padding: 16 }}>
                <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
                <View style={{ height: 8 }} />
                <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
              </View>
            ) : (
              <>
                <DetailRow label="Phone" value={phone || '—'} onPress={() => openEdit('phone', phone)} />
                <DetailRow label="Email" value={email || '—'} isLast />
              </>
            )}
        </SettingsSection>
      </Reanimated.View>

      {/* Security */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(140)}>
        <SettingsSection title="Security" noCard>
            <DetailRow label="Password" value="••••••••" onPress={() => navigation.navigate('ChangePassword')} />
            <DetailRow
              label="Two-Factor Authentication"
              value={twoFactorEnabled ? 'Enabled' : 'Off'}
              onPress={() => handleToggleTwoFactor(!twoFactorEnabled)}
              isLast
            />
        </SettingsSection>
      </Reanimated.View>

      {/* Preferences */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(180)}>
        <SettingsSection title="Preferences" noCard>
            <DetailRow
              label="Holiday Mode"
              value={holidayMode ? 'On' : 'Off'}
              onPress={() => updateAccountPreferences({ holidayMode: !holidayMode })}
            />
            <DetailRow
              label="Private Profile"
              value={privateProfile ? 'On' : 'Off'}
              onPress={() => updateAccountPreferences({ privateProfile: !privateProfile })}
              isLast
            />
        </SettingsSection>
      </Reanimated.View>

      {/* Data Controls */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(220)}>
        <SettingsSection title="Data" noCard>
            <DetailRow
              label="Download my data"
              value=""
              onPress={() => void handleDownloadData()}
              loading={isExporting}
              isLast
            />
        </SettingsSection>
      </Reanimated.View>

      {/* Danger Zone */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(260)}>
        <FlagshipDangerZone
          title="Delete Account"
          description="This will permanently remove your account and all associated data. This action cannot be undone."
          actionLabel="Delete Account"
          onAction={handleDeleteAccount}
        />
      </Reanimated.View>

      {/* Inline Edit Modal */}
      <Modal visible={editingField !== null} transparent animationType="slide" onRequestClose={closeEdit}>
        <View style={styles.editModalOverlay}>
          <View style={[styles.editModalCard, { backgroundColor: Colors.surface }]}>
            <Text style={styles.editModalTitle}>
              Edit {editingField === 'fullName' ? 'name' : editingField}
            </Text>
            <AppInput
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
              containerStyle={{ marginBottom: Space.md }}
            />
            <View style={styles.editModalActions}>
              <AnimatedPressable onPress={() => { haptic.light(); closeEdit(); }} style={styles.editModalBtn} activeOpacity={0.8}>
                <Text style={styles.editModalBtnText}>Cancel</Text>
              </AnimatedPressable>
              <AnimatedPressable onPress={() => { haptic.medium(); saveEdit(); }} style={[styles.editModalBtn, styles.editModalBtnPrimary]} activeOpacity={0.8}>
                <Text style={[styles.editModalBtnText, styles.editModalBtnPrimaryText]}>Save</Text>
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Disable 2FA Modal */}
      <Modal visible={disableTwoFactorModalVisible} transparent animationType="fade" onRequestClose={closeDisableTwoFactorModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: Colors.surface }]}>
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
              containerStyle={{ marginBottom: Space.xs }}
            />

            <AppInput
              label="Recovery code"
              value={disableTwoFactorRecoveryCode}
              onChangeText={setDisableTwoFactorRecoveryCode}
              placeholder="XXXX-XXXX-XXXX"
              editable={!isTogglingTwoFactor}
              containerStyle={{ marginBottom: Space.xs }}
            />

            <View style={styles.modalActionRow}>
              <AnimatedPressable
                onPress={closeDisableTwoFactorModal}
                disabled={isTogglingTwoFactor}
                style={[styles.modalBtn, styles.modalBtnMuted]}
              >
                <Text style={styles.modalBtnMutedText}>Cancel</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => void confirmDisableTwoFactor()}
                disabled={isTogglingTwoFactor}
                style={[styles.modalBtn, styles.modalBtnDanger]}
              >
                {isTogglingTwoFactor ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnDangerText}>Disable</Text>
                )}
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  editModalCard: {
    padding: Space.lg,
    borderRadius: Radius.xl,
  },
  editModalTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.md,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  editModalActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  editModalBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  editModalBtnPrimary: {
    backgroundColor: Colors.brand,
  },
  editModalBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  editModalBtnPrimaryText: {
    color: Colors.textInverse,
  },
  modalCard: {
    padding: Space.lg,
    borderRadius: Radius.xl,
    marginHorizontal: 0,
    marginBottom: 0,
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
  identitySurface: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginHorizontal: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.lg,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Space.md,
    gap: Space.md,
  },
  identityAvatar: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  identityAvatarImage: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
  },
  identityAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityAvatarText: {
    fontSize: 24,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  identityText: {
    flex: 1,
  },
  identityName: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  identityMeta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  identityEdit: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
});