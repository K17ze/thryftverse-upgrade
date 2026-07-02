import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Space, Typography } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { updateMyProfile } from '../services/profileApi';
import { useProfileMediaUpload } from '../hooks/useProfileMediaUpload';
import { EditProfilePreview } from '../components/profile/EditProfilePreview';
import { ProfileMediaEditor } from '../components/profile/ProfileMediaEditor';
import { FlagshipScreen, FlagshipHeader, FlagshipStickyFooter } from '../components/flagship';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { show } = useToast();
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: Space.xl }}
        >
          {/* ── 2. LIVE PROFILE PREVIEW ── */}
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

          {/* ── 3. COVER EDITING CONTROLS ── */}
          <View style={styles.mediaEditorZone}>
            <Text style={styles.publicProfileNote}>These fields appear on your public profile.</Text>
            <ProfileMediaEditor
              label="Cover"
              status={coverState.status}
              error={coverState.error}
              onChange={pickCover}
              onRetry={retryCover}
              onRevert={revertCover}
            />
          </View>

          {/* ── 4. AVATAR EDITING CONTROLS ── */}
          <View style={styles.mediaEditorZone}>
            <ProfileMediaEditor
              label="Avatar"
              status={avatarState.status}
              error={avatarState.error}
              onChange={pickAvatar}
              onRetry={retryAvatar}
              onRevert={revertAvatar}
            />
          </View>

          {/* ── 5. CORE IDENTITY FIELDS ── */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionHeading}>Public identity</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Display name</Text>
              <TextInput
                style={styles.fieldInput}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <Text style={styles.fieldHelper}>Shown on your public profile.</Text>
              <View style={styles.hairline} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput
                style={styles.fieldInput}
                value={username}
                onChangeText={setUsername}
                placeholder="username"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                returnKeyType="next"
              />
              <Text style={styles.fieldHelper}>Your public handle. How people find you on Thryftverse.</Text>
              <View style={styles.hairline} />
            </View>
          </View>

          {/* ── 6. BIO AND ADDITIONAL FIELDS ── */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionHeading}>Public about</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Bio</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputMultiline]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell people about yourself…"
                placeholderTextColor={Colors.textMuted}
                multiline
                maxLength={200}
                textAlignVertical="top"
              />
              <Text style={styles.fieldHelper}>{bio.length}/200</Text>
              <View style={styles.hairline} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Website</Text>
              <TextInput
                style={styles.fieldInput}
                value={website}
                onChangeText={setWebsite}
                onBlur={() => validateWebsite(website)}
                placeholder="https://"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                keyboardType="url"
                returnKeyType="done"
              />
              {websiteError ? (
                <Text style={styles.fieldError}>{websiteError}</Text>
              ) : null}
              <View style={styles.hairline} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  // Media editor zone
  mediaEditorZone: {
    paddingVertical: 2,
  },
  publicProfileNote: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
    letterSpacing: 0.3,
  },

  // Section groups
  sectionGroup: {
    paddingTop: Space.lg,
    paddingHorizontal: Space.md,
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: Typography.family.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Space.sm,
  },

  // Fields
  fieldGroup: {
    paddingVertical: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  fieldInput: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: 0,
    minHeight: 40,
  },
  fieldInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  fieldHelper: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 4,
  },
  fieldError: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    marginTop: 4,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginTop: 8,
  },

});
