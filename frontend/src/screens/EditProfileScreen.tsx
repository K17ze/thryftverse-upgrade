import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Space, Typography, Radius, Type } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { parseApiError } from '../lib/apiClient';
import { EmptyState } from '../components/EmptyState';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppInput } from '../components/ui/AppInput';
import { updateMyProfile } from '../services/profileApi';
import { updateUserProfile as updateUserProfileApi } from '../services/accountApi';
import { useProfileMediaUpload } from '../hooks/useProfileMediaUpload';
import { EditProfilePreview } from '../components/profile/EditProfilePreview';
import { ProfileMediaEditor } from '../components/profile/ProfileMediaEditor';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader, FlagshipStickyFooter } from '../components/flagship';

const VERIFIED_LABEL = 'Verified';
const UNVERIFIED_LABEL = 'Not verified';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { show } = useToast();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const currentUser = useStore((state) => state.currentUser);
  const twoFactorEnabled = useStore((state) => state.twoFactorEnabled);
  const userAvatar = useStore((state) => state.userAvatar);
  const userCover = useStore((state) => state.userCover);
  const updateUserAvatar = useStore((state) => state.updateUserAvatar);
  const updateUserCover = useStore((state) => state.updateUserCover);
  const updateUserProfile = useStore((state) => state.updateUserProfile);
  const fetchMyProfile = useStore((state) => state.fetchMyProfile);

  const user = currentUser;
  const userAny = user as any;
  const initialName = user?.displayName ?? user?.username ?? '';
  const initialUsername = user?.username ?? '';

  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [website, setWebsite] = useState(user?.website ?? '');
  const [phone, setPhone] = useState(userAny?.phone ?? '');

  const [isSaving, setIsSaving] = useState(false);
  const [websiteError, setWebsiteError] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const hasTextChanges =
    name !== initialName ||
    username !== initialUsername ||
    bio !== (user?.bio ?? '') ||
    website !== (user?.website ?? '');
  const hasPhoneChanged = phone !== (userAny?.phone ?? '');

  const {
    avatar: avatarState,
    cover: coverState,
    pickAvatar,
    pickCover,
    retryAvatar,
    retryCover,
    revertAvatar,
    revertCover,
    hasUnsavedMedia,
  } = useProfileMediaUpload(
    currentUser?.id,
    user?.avatar ?? null,
    user?.coverPhoto ?? null,
    updateUserAvatar,
    updateUserCover
  );

  const hasChanges = hasTextChanges || hasPhoneChanged;
  const isMediaActive = avatarState.status === 'uploading' || coverState.status === 'uploading';
  const hasMediaFailure = avatarState.status === 'failed' || coverState.status === 'failed';

  // ── Private details helpers ──
  const openEdit = (field: string, current: string) => {
    setEditingField(field);
    setEditValue(current);
  };
  const closeEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  // Derived private-details display values
  const email = userAny?.email ?? '';
  const emailVerified = !!user?.emailVerified;
  const country = (userAny?.country as string) || '';

  // Safe-area-aware bottom clearance so the sticky Save footer never covers form fields.
  // Footer = paddingTop(8) + button(48) + paddingBottom(max(insets.bottom, 16)) ≈ 112 on most devices.
  const EDIT_PROFILE_FOOTER_CLEARANCE = Math.max(insets.bottom, Space.md) + 112;

  const validateWebsite = useCallback((value: string) => {
    if (!value) {
      setWebsiteError('');
      return true;
    }
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
    if (!urlRegex.test(value)) {
      setWebsiteError('Enter a valid URL (e.g. https://example.com)');
      return false;
    }
    setWebsiteError('');
    return true;
  }, []);

  const handleSave = async () => {
    if (!validateWebsite(website)) return;
    if (isMediaActive) {
      show('Media upload in progress. Please wait.', 'info');
      return;
    }
    setIsSaving(true);
    try {
      // ── Save public profile fields ──
      const updates: Record<string, unknown> = {};
      if (name !== initialName) updates.displayName = name;
      if (username !== initialUsername) updates.username = username;
      if (bio !== (user?.bio ?? '')) updates.bio = bio;
      if (website !== (user?.website ?? '')) updates.website = website;
      if (Object.keys(updates).length > 0) {
        const updated = await updateMyProfile(updates);
        updateUserProfile({
          username: updated.username,
          displayName: updated.displayName,
          bio: updated.bio,
          website: updated.website,
          location: updated.location,
          phone: updated.phone,
          avatar: updated.avatar,
          coverPhoto: updated.coverPhoto,
          coverVideo: updated.coverVideo,
        });
      }

      // ── Save private phone field ──
      if (hasPhoneChanged) {
        const previousPhone = phone;
        updateUserProfile({ phone });
        try {
          await updateUserProfileApi({ phone });
        } catch (phoneErr) {
          const parsed = parseApiError(phoneErr, 'Unable to save phone number.');
          show(parsed.message, 'error');
          setPhone(previousPhone);
          updateUserProfile({ phone: previousPhone });
          setIsSaving(false);
          return;
        }
      }

      await fetchMyProfile();
      if (hasMediaFailure) {
        show('Text saved. Media upload failed — retry or revert below.', 'info');
      } else {
        show('Profile updated', 'success');
        navigation.goBack();
      }
    } catch (err: any) {
      const message = err?.message || 'Failed to save profile. Please try again.';
      show(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const displayAvatar = avatarState.pendingLocal || avatarState.confirmedRemote || userAvatar || '';
  const displayCover = coverState.pendingLocal || coverState.confirmedRemote || userCover || '';

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : undefined;

  const handleDiscard = () => {
    if (!hasChanges && !hasUnsavedMedia) {
      navigation.goBack();
      return;
    }
    // hasChanges already includes hasPhoneChanged via hasTextChanges || hasPhoneChanged
    let message = 'You have unsaved changes. Are you sure you want to discard them?';
    if (isMediaActive) message = 'Media upload in progress. Leaving now will discard the upload.';
    if (hasMediaFailure) message = 'Media upload failed. Leaving now will discard your changes.';
    Alert.alert(
      'Unsaved changes',
      message,
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ]
    );
  };

  if (!user) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Edit profile"
            subtitle="Public profile"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <EmptyState
          icon="person-outline"
          title="Not signed in"
          subtitle="Sign in to edit your profile."
          ctaLabel="Sign In"
          onCtaPress={() => (navigation as any).navigate('Login')}
        />
      </FlagshipScreen>
    );
  }

  const saveDisabled = !hasChanges || isSaving;

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Edit profile"
          subtitle="Profile & account"
          onBack={handleDiscard}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      stickyFooter={
        <FlagshipStickyFooter
          actions={[
            {
              label: isSaving ? 'Saving…' : 'Save changes',
              onPress: () => void handleSave(),
              variant: 'primary',
              disabled: saveDisabled,
              loading: isSaving,
            },
          ]}
        />
      }
    >
      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: EDIT_PROFILE_FOOTER_CLEARANCE }}
      >
        {/* ── 1. INTRO COPY — calm, focused intent ── */}
        <Text style={styles.introCopy}>
          Information you add here is visible on your public profile.
        </Text>

        {/* ── 2. LIVE PROFILE PREVIEW (compact, deterministic) ── */}
        <EditProfilePreview
          coverUri={displayCover}
          avatarUri={displayAvatar}
          displayName={name}
          username={username}
          bio={bio}
          location={user?.location}
          memberSince={memberSince}
          onEditCover={pickCover}
          onEditAvatar={pickAvatar}
          isUploadingCover={coverState.status === 'uploading'}
          isUploadingAvatar={avatarState.status === 'uploading'}
        />

        {/* ── 3. MEDIA STATUS SURFACES (uploading / failed / retry only — no idle duplicate) ── */}
        {(coverState.status === 'uploading' || coverState.status === 'failed') && (
          <ProfileMediaEditor
            label="Cover"
            status={coverState.status}
            error={coverState.error}
            onChange={pickCover}
            onRetry={retryCover}
            onRevert={revertCover}
          />
        )}
        {(avatarState.status === 'uploading' || avatarState.status === 'failed') && (
          <ProfileMediaEditor
            label="Avatar"
            status={avatarState.status}
            error={avatarState.error}
            onChange={pickAvatar}
            onRetry={retryAvatar}
            onRevert={revertAvatar}
          />
        )}

        {/* ── 4. CORE IDENTITY FIELDS ── */}
        <View style={styles.sectionGroup}>
          <Text style={styles.sectionHeading}>Public identity</Text>

          <ProfileEditField
            label="Display name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            helper="Shown on your public profile."
            autoCapitalize="words"
            returnKeyType="next"
          />

          <ProfileEditField
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="username"
            helper="Your public handle. How people find you on Thryftverse."
            autoCapitalize="none"
            returnKeyType="next"
          />
        </View>

        {/* ── 5. BIO AND ADDITIONAL FIELDS ── */}
        <View style={styles.sectionGroup}>
          <Text style={styles.sectionHeading}>Public about</Text>

          <ProfileEditField
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Tell people about yourself…"
            multiline
            maxLength={200}
          />

          <ProfileEditField
            label="Website"
            value={website}
            onChangeText={setWebsite}
            onBlur={() => validateWebsite(website)}
            placeholder="https://"
            helper="A link to your shop, portfolio, or social profile."
            error={websiteError}
            autoCapitalize="none"
            keyboardType="url"
            returnKeyType="done"
            isLast
          />
        </View>

        {/* ── 6. PRIVATE DETAILS ── */}
        <SettingsSection
          title="Private details"
          description="Used for account security and order updates. Not shown on your public profile."
        >
          <SettingsRow
            title="Email"
            value={email || '—'}
            isFirst
          />
          <SettingsRow
            title="Email status"
            value={emailVerified ? VERIFIED_LABEL : UNVERIFIED_LABEL}
          />
          <SettingsRow
            title="Phone"
            value={phone || '—'}
            onPress={() => openEdit('phone', phone)}
            isLast
          />
        </SettingsSection>

        {/* ── 7. PERSONAL INFORMATION (read-only) ── */}
        <SettingsSection title="Personal information">
          <SettingsRow
            title="Country or region"
            value={country || '—'}
            isFirst
            isLast
          />
        </SettingsSection>

        {/* ── 8. SECURITY ── */}
        <SettingsSection title="Security" description="Protect your account and sign-ins.">
          <SettingsRow
            title="Password"
            value="••••••••"
            icon="lock-closed-outline"
            onPress={() => (navigation as any).navigate('ChangePassword')}
            isFirst
          />
          <SettingsRow
            title="Two-factor authentication"
            subtitle={twoFactorEnabled ? 'Enabled — extra layer of security' : 'Add an extra layer of security'}
            value={twoFactorEnabled ? 'Enabled' : 'Off'}
            icon="shield-checkmark-outline"
            iconColor={twoFactorEnabled ? Colors.success : Colors.textMuted}
            onPress={() => (navigation as any).navigate('TwoFactorSetup')}
            isLast
          />
        </SettingsSection>

        {/* ── 9. PREFERENCES ── */}
        <SettingsSection title="Preferences">
          <SettingsRow
            title="Personalisation"
            subtitle="Style and experience preferences"
            icon="apps-outline"
            onPress={() => (navigation as any).navigate('Personalisation')}
            isFirst
            isLast
          />
        </SettingsSection>

        {/* ── 10. ACCOUNT ── */}
        <SettingsSection
          title="Account"
          style={{ marginBottom: Math.max(insets.bottom, Space.md) + Space.lg }}
        >
          <SettingsRow
            title="Account control"
            subtitle="Download data, delete account"
            icon="warning-outline"
            iconColor={Colors.danger}
            danger
            onPress={() => (navigation as any).navigate('AccountControl')}
            isFirst
            isLast
          />
        </SettingsSection>
      </KeyboardAwareScrollView>

      {/* ── Inline Phone Edit Modal ── */}
      <Modal visible={editingField !== null} transparent animationType="slide" onRequestClose={closeEdit}>
        <View style={styles.editModalOverlay}>
          <View style={[styles.editModalCard, { backgroundColor: Colors.surface }]}>
            <Text style={styles.editModalTitle}>
              Edit {editingField === 'phone' ? 'phone number' : editingField}
            </Text>
            <AppInput
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
              keyboardType={editingField === 'phone' ? 'phone-pad' : 'default'}
              containerStyle={{ marginBottom: Space.md }}
            />
            <View style={styles.editModalActions}>
              <AnimatedPressable
                onPress={() => { haptic.light(); closeEdit(); }}
                style={styles.editModalBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.editModalBtnText}>Cancel</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => {
                  if (editingField === 'phone') setPhone(editValue);
                  closeEdit();
                }}
                style={[styles.editModalBtn, styles.editModalBtnPrimary]}
                activeOpacity={0.8}
              >
                <Text style={[styles.editModalBtnText, styles.editModalBtnPrimaryText]}>Save</Text>
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>
    </FlagshipScreen>
  );
}

// ── Premium rounded form field for edit-profile ──
// Rounded surface, label-above, focus border, helper/error/counter below.
// Matches AppInput's elevated input language but tuned for the edit-profile
// form rhythm: 52pt single-line height, compact multiline Bio, counter chip.
interface ProfileEditFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  helper?: string;
  error?: string;
  multiline?: boolean;
  maxLength?: number;
  autoCapitalize?: 'none' | 'words' | 'sentences';
  keyboardType?: 'default' | 'url' | 'email-address' | 'phone-pad';
  returnKeyType?: 'done' | 'next' | 'go';
  isLast?: boolean;
}

function ProfileEditField({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  helper,
  error,
  multiline,
  maxLength,
  autoCapitalize = 'none',
  keyboardType = 'default',
  returnKeyType = 'next',
  isLast,
}: ProfileEditFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const hasError = Boolean(error);
  const showCounter = maxLength !== undefined;
  const counterText = showCounter ? `${value.length}/${maxLength}` : helper;

  return (
    <View style={[styles.fieldGroup, isLast && styles.fieldGroupLast]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.fieldSurface,
          isFocused && !hasError && styles.fieldSurfaceFocused,
          hasError && styles.fieldSurfaceError,
          multiline && styles.fieldSurfaceMultiline,
        ]}
      >
        <TextInput
          style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
          value={value}
          onChangeText={onChangeText}
          onFocus={(e) => setIsFocused(true)}
          onBlur={(e) => { setIsFocused(false); onBlur?.(); }}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          multiline={multiline}
          maxLength={maxLength}
          textAlignVertical={multiline ? 'top' : 'center'}
          selectionColor={Colors.brand}
        />
        {showCounter && (
          <Text style={[styles.fieldCounter, hasError && styles.fieldCounterError]}>
            {counterText}
          </Text>
        )}
      </View>
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : helper && !showCounter ? (
        <Text style={styles.fieldHelper}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Section groups
  sectionGroup: {
    paddingTop: Space.lg,
    paddingHorizontal: Space.md,
  },
  introCopy: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 18,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: Typography.family.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Space.sm,
  },

  // Fields — premium rounded surfaces
  fieldGroup: {
    marginBottom: Space.sm + 2,
  },
  fieldGroupLast: {
    marginBottom: 0,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  fieldSurface: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: Space.md - 2,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  fieldSurfaceFocused: {
    borderColor: Colors.textSecondary,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
  },
  fieldSurfaceError: {
    borderColor: Colors.danger,
    backgroundColor: Colors.background,
  },
  fieldSurfaceMultiline: {
    alignItems: 'flex-end',
    paddingVertical: Space.sm,
    minHeight: 96,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  fieldInputMultiline: {
    flex: 1,
    minHeight: 64,
    lineHeight: 21,
    paddingVertical: 0,
  },
  fieldCounter: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    paddingBottom: 2,
  },
  fieldCounterError: {
    color: Colors.danger,
  },
  fieldHelper: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 6,
    lineHeight: 15,
  },
  fieldError: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    marginTop: 6,
    lineHeight: 15,
  },
  // ── Phone edit modal ──
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
});
