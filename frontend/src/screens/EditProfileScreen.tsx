import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Space, Typography, Radius } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { updateMyProfile } from '../services/profileApi';
import { useProfileMediaUpload } from '../hooks/useProfileMediaUpload';
import { EditProfilePreview } from '../components/profile/EditProfilePreview';
import { ProfileMediaEditor } from '../components/profile/ProfileMediaEditor';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader, FlagshipStickyFooter } from '../components/flagship';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { show } = useToast();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const userAvatar = useStore((state) => state.userAvatar);
  const userCover = useStore((state) => state.userCover);
  const updateUserAvatar = useStore((state) => state.updateUserAvatar);
  const updateUserCover = useStore((state) => state.updateUserCover);
  const updateUserProfile = useStore((state) => state.updateUserProfile);
  const fetchMyProfile = useStore((state) => state.fetchMyProfile);

  const user = currentUser;
  const initialName = user?.displayName ?? user?.username ?? '';
  const initialUsername = user?.username ?? '';

  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [website, setWebsite] = useState(user?.website ?? '');

  const [isSaving, setIsSaving] = useState(false);
  const [websiteError, setWebsiteError] = useState('');

  const hasTextChanges =
    name !== initialName ||
    username !== initialUsername ||
    bio !== (user?.bio ?? '') ||
    website !== (user?.website ?? '');

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

  const hasChanges = hasTextChanges;
  const isMediaActive = avatarState.status === 'uploading' || coverState.status === 'uploading';
  const hasMediaFailure = avatarState.status === 'failed' || coverState.status === 'failed';

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
          subtitle="Public profile"
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
      </KeyboardAwareScrollView>
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
});
