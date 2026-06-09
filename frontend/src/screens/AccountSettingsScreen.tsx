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
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/apiClient';
import { requestMyDataExport, deleteMyAccount, updateUserProfile as updateUserProfileApi } from '../services/accountApi';
import { disableTwoFactor, logoutFromSession } from '../services/authApi';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Typography } from '../theme/designTokens';

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

  function DetailRow({
    label,
    value,
    editable = true,
    onPress,
    isLast = false,
  }: {
    label: string;
    value: string;
    editable?: boolean;
    onPress?: () => void;
    isLast?: boolean;
  }) {
    return (
      <AnimatedPressable
        onPress={onPress}
        activeOpacity={0.75}
        scaleValue={0.995}
        hapticFeedback="light"
        disabled={!onPress}
      >
        <View style={[styles.detailRow, !isLast && styles.detailRowBorder]}>
          <Text style={styles.detailLabel}>{label}</Text>
          <View style={styles.detailRight}>
            <Text style={styles.detailValue} numberOfLines={1}>{value || '—'}</Text>
            {editable && onPress && (
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginLeft: 4 }} />
            )}
          </View>
        </View>
      </AnimatedPressable>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      {/* Header */}
      <View style={styles.header}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.headerBack}
          scaleValue={0.92}
          hapticFeedback="light"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Account details</Text>
        <View style={styles.headerBack} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* User Details */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <Text style={styles.sectionLabel}>User details</Text>
          {isHydrating ? (
            <View style={styles.skeletonWrap}>
              <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
              <View style={{ height: Space.sm }} />
              <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
              <View style={{ height: Space.sm }} />
              <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
            </View>
          ) : (
            <View style={styles.rowGroup}>
              <DetailRow
                label="Username"
                value={user?.username ?? '—'}
                editable={false}
                isLast={false}
              />
              <DetailRow
                label="Email"
                value={email}
                onPress={() => openEdit('email', email)}
              />
              <DetailRow
                label="Picture"
                value={user?.avatar ? 'Change' : 'Add'}
                onPress={() => navigation.navigate('EditProfile')}
                isLast
              />
            </View>
          )}
        </Reanimated.View>

        {/* About me */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
          <Text style={styles.sectionLabel}>About me</Text>
          {isHydrating ? (
            <View style={styles.skeletonWrap}>
              <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
              <View style={{ height: Space.sm }} />
              <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
              <View style={{ height: Space.sm }} />
              <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
              <View style={{ height: Space.sm }} />
              <SkeletonLoader width="100%" height={56} borderRadius={Radius.lg} />
            </View>
          ) : (
            <View style={styles.rowGroup}>
              <DetailRow
                label="Display name"
                value={displayName}
                onPress={() => openEdit('fullName', displayName)}
              />
              <DetailRow
                label="Date of birth"
                value={birthday}
                onPress={() => openEdit('birthday', birthday)}
              />
              <DetailRow
                label="Phone"
                value={phone}
                onPress={() => openEdit('phone', phone)}
              />
              <DetailRow
                label="Country"
                value={(userAny?.country as string) || 'United Kingdom'}
                editable={false}
                isLast
              />
            </View>
          )}
        </Reanimated.View>

        {/* Preferences */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(100)}>
          <Text style={styles.sectionLabel}>Preferences</Text>
          <View style={styles.rowGroup}>
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
          </View>
        </Reanimated.View>

        {/* Security */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(140)}>
          <Text style={styles.sectionLabel}>Security</Text>
          <View style={styles.rowGroup}>
            <DetailRow
              label="Password"
              value="••••••••"
              onPress={() => navigation.navigate('ChangePassword')}
            />
            <DetailRow
              label="Two-Factor Authentication"
              value={twoFactorEnabled ? 'On' : 'Off'}
              onPress={() => handleToggleTwoFactor(!twoFactorEnabled)}
              isLast
            />
          </View>
        </Reanimated.View>

        {/* Manage */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(180)}>
          <Text style={styles.sectionLabel}>Manage</Text>
          <View style={styles.rowGroup}>
            <AnimatedPressable
              onPress={() => void handleDownloadData()}
              activeOpacity={0.75}
              scaleValue={0.995}
              hapticFeedback="light"
            >
              <View style={[styles.detailRow, styles.detailRowBorder]}>
                <Text style={styles.detailLabel}>Download my data</Text>
                <View style={styles.detailRight}>
                  {isExporting ? (
                    <ActivityIndicator size="small" color={Colors.textMuted} />
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  )}
                </View>
              </View>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={handleDeleteAccount}
              activeOpacity={0.75}
              scaleValue={0.995}
              hapticFeedback="medium"
            >
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: Colors.danger }]}>Delete account</Text>
                <View style={styles.detailRight}>
                  {isDeleting ? (
                    <ActivityIndicator size="small" color={Colors.danger} />
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={Colors.danger} />
                  )}
                </View>
              </View>
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        {/* Save */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(220)}>
          <AppButton
            title={isSaving ? 'Saving…' : 'Save Changes'}
            onPress={() => void handleSaveChanges()}
            disabled={isSaving || isBusy}
            variant="primary"
            size="md"
            style={styles.saveBtn}
            accessibilityLabel="Save account settings"
          />
        </Reanimated.View>

        <View style={{ height: Space.xl }} />
      </ScrollView>

      {/* Inline Edit Modal */}
      <Modal
        visible={editingField !== null}
        transparent
        animationType="slide"
        onRequestClose={closeEdit}
      >
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalCard}>
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
              <AnimatedPressable onPress={closeEdit} style={styles.editModalBtn}>
                <Text style={styles.editModalBtnText}>Cancel</Text>
              </AnimatedPressable>
              <AnimatedPressable onPress={saveEdit} style={[styles.editModalBtn, styles.editModalBtnPrimary]}>
                <Text style={[styles.editModalBtnText, styles.editModalBtnPrimaryText]}>Save</Text>
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Disable 2FA Modal */}
      <Modal
        visible={disableTwoFactorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDisableTwoFactorModal}
      >
        <View style={styles.modalOverlay}>
          <View style={{ marginHorizontal: 0, marginBottom: 0, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg }}>
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
              placeholder="XXXX-XXXX-XXXX"
              editable={!isTogglingTwoFactor}
              containerStyle={styles.modalInputSpacing}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 4,
  },
  headerBack: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },
  skeletonWrap: {
    marginBottom: Space.md,
  },
  sectionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.sm + 4,
    marginTop: Space.lg,
    letterSpacing: Type.body.letterSpacing,
  },
  rowGroup: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: Space.md,
    minHeight: 56,
  },
  detailRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  detailRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    maxWidth: 160,
    letterSpacing: Type.body.letterSpacing,
  },
  saveBtn: {
    marginTop: Space.lg,
    borderRadius: Radius.xl,
  },

  // Edit modal
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
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

  // 2FA modal
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
