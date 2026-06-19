import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { Colors } from '../constants/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { PremiumTextField } from '../components/ui/PremiumTextField';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipProfileMedia, FlagshipScreen, FlagshipHeader, FlagshipStickyFooter, FlagshipFormSection } from '../components/flagship';
import { updateMyProfile } from '../services/profileApi';
import { useProfileMediaUpload } from '../hooks/useProfileMediaUpload';


export default function EditProfileScreen() {
  const { isDark } = useAppTheme();
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
        header={<FlagshipHeader title="Edit Profile" onBack={() => navigation.goBack()} />}
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

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Edit Profile"
          onBack={handleDiscard}
          backIcon="arrow-back"
          rightAction={undefined}
        />
      }
      keyboardAvoiding
      stickyFooter={
        <FlagshipStickyFooter
          actions={[
            {
              label: isSaving ? 'Saving...' : 'Save Changes',
              onPress: handleSave,
              variant: 'primary',
              disabled: !hasChanges || isSaving,
              loading: isSaving,
            },
          ]}
        />
      }
    >
      {/* Hero Media Section */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(30)}>
        <FlagshipProfileMedia
          coverUri={displayCover}
          avatarUri={displayAvatar}
          isSelf
          onEditCover={pickCover}
          onEditAvatar={pickAvatar}
          isUploadingCover={coverState.status === 'uploading'}
          isUploadingAvatar={avatarState.status === 'uploading'}
          style={{ marginBottom: Space.lg }}
        />

        {/* Avatar upload failure */}
        {avatarState.status === 'failed' && (
          <View style={styles.mediaErrorRow}>
            <Ionicons name="warning-outline" size={16} color={Colors.danger} />
            <Text style={styles.mediaErrorText}>{avatarState.error || 'Avatar upload failed'}</Text>
            <AnimatedPressable onPress={retryAvatar} activeOpacity={0.8} scaleValue={0.96} accessibilityLabel="Retry avatar upload" accessibilityRole="button">
              <Text style={styles.mediaActionText}>Retry</Text>
            </AnimatedPressable>
            <AnimatedPressable onPress={revertAvatar} activeOpacity={0.8} scaleValue={0.96} accessibilityLabel="Revert avatar to previous" accessibilityRole="button">
              <Text style={styles.mediaActionText}>Revert</Text>
            </AnimatedPressable>
          </View>
        )}

        {/* Cover upload failure */}
        {coverState.status === 'failed' && (
          <View style={styles.mediaErrorRow}>
            <Ionicons name="warning-outline" size={16} color={Colors.danger} />
            <Text style={styles.mediaErrorText}>{coverState.error || 'Cover upload failed'}</Text>
            <AnimatedPressable onPress={retryCover} activeOpacity={0.8} scaleValue={0.96} accessibilityLabel="Retry cover upload" accessibilityRole="button">
              <Text style={styles.mediaActionText}>Retry</Text>
            </AnimatedPressable>
            <AnimatedPressable onPress={revertCover} activeOpacity={0.8} scaleValue={0.96} accessibilityLabel="Revert cover to previous" accessibilityRole="button">
              <Text style={styles.mediaActionText}>Revert</Text>
            </AnimatedPressable>
          </View>
        )}
      </Reanimated.View>

      <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
        <FlagshipFormSection title="Identity">
          <PremiumTextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
          />
          <View style={styles.divider} />
          <PremiumTextField
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="username"
            autoCapitalize="none"
            helperText="How people find you on Thryftverse."
          />
        </FlagshipFormSection>
      </Reanimated.View>

      {/* About */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
        <FlagshipFormSection title="About">
          <PremiumTextField
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Tell people about yourself..."
            multiline
            minHeight={100}
            maxLength={200}
            helperText={`${bio.length}/200`}
          />
          <View style={styles.divider} />
          <PremiumTextField
            label="Website"
            value={website}
            onChangeText={setWebsite}
            onBlur={() => validateWebsite(website)}
            placeholder="https://"
            autoCapitalize="none"
            keyboardType="url"
            errorText={websiteError || undefined}
          />
        </FlagshipFormSection>
      </Reanimated.View>

          </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Space.md,
  },
  mediaErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    padding: Space.sm,
    backgroundColor: 'rgba(255,77,77,0.06)',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,77,77,0.15)',
  },
  mediaErrorText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.danger,
    lineHeight: Type.caption.lineHeight,
  },
  mediaActionText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    lineHeight: Type.caption.lineHeight,
  },
});
