import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { PremiumTextField } from '../components/ui/PremiumTextField';
import { PremiumSelectRow } from '../components/ui/PremiumSelectRow';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import { FlagshipProfileMedia, FlagshipActionCluster } from '../components/flagship';
import { updateMyProfile } from '../services/profileApi';
import { uploadMedia } from '../services/mediaUpload';
import {
  setStoredUserAvatar,
  setStoredUserAvatarForUser,
  setStoredUserCover,
  setStoredUserCoverForUser,
} from '../preferences/profileMediaPreferences';
import { persistProfileMediaUri } from '../utils/profileMediaAsset';

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

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
  const initialGender = user?.gender ?? 'Prefer not to say';
  const initialName = user?.displayName ?? user?.username ?? '';
  const initialUsername = user?.username ?? '';

  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [website, setWebsite] = useState(user?.website ?? '');
  const [gender, setGender] = useState(initialGender);
  const [genderPickerVisible, setGenderPickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [websiteError, setWebsiteError] = useState('');

  const hasTextChanges =
    name !== initialName ||
    username !== initialUsername ||
    bio !== (user?.bio ?? '') ||
    website !== (user?.website ?? '') ||
    gender !== initialGender;

  const hasMediaChanges = React.useMemo(() => {
    const avatarChanged = userAvatar !== (user?.avatar ?? null);
    const coverChanged = userCover !== (user?.coverPhoto ?? null);
    return avatarChanged || coverChanged;
  }, [userAvatar, userCover, user]);

  const hasChanges = hasTextChanges || hasMediaChanges;

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

  const pickCover = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.9,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const pickedUri = result.assets[0].uri;
        setIsUploadingCover(true);
        try {
          const localUri = await persistProfileMediaUri(pickedUri, 'cover');
          updateUserCover(localUri);
          const publicUrl = await uploadMedia(pickedUri, 'covers');
          await updateMyProfile({ coverPhoto: publicUrl });
          updateUserCover(publicUrl);
          await Promise.all([
            setStoredUserCover(publicUrl),
            currentUser?.id ? setStoredUserCoverForUser(currentUser.id, publicUrl) : Promise.resolve(),
          ]).catch(() => {});
          show('Cover updated', 'success');
        } catch {
          show('Cover upload requires media storage connection.', 'error');
        } finally {
          setIsUploadingCover(false);
        }
      }
    } catch {
      show('Could not select cover photo', 'error');
    }
  };

  const pickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const pickedUri = result.assets[0].uri;
        setIsUploadingAvatar(true);
        try {
          const localUri = await persistProfileMediaUri(pickedUri, 'avatar');
          updateUserAvatar(localUri);
          const publicUrl = await uploadMedia(pickedUri, 'avatars');
          await updateMyProfile({ avatar: publicUrl });
          updateUserAvatar(publicUrl);
          await Promise.all([
            setStoredUserAvatar(publicUrl),
            currentUser?.id ? setStoredUserAvatarForUser(currentUser.id, publicUrl) : Promise.resolve(),
          ]).catch(() => {});
          show('Avatar updated', 'success');
        } catch {
          show('Avatar upload requires media storage connection.', 'error');
        } finally {
          setIsUploadingAvatar(false);
        }
      }
    } catch {
      show('Could not select profile photo', 'error');
    }
  };

  const handleSave = async () => {
    if (!validateWebsite(website)) return;
    setIsSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (name !== initialName) updates.displayName = name;
      if (username !== initialUsername) updates.username = username;
      if (bio !== (user?.bio ?? '')) updates.bio = bio;
      if (website !== (user?.website ?? '')) updates.website = website;
      if (gender !== initialGender) updates.gender = gender;
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
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      show('Profile updated', 'success');
      navigation.goBack();
    } catch {
      show('Failed to save profile. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const currentAvatar = user?.avatar || userAvatar || '';
  const currentCover = user?.coverPhoto || userCover || '';

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
        <EmptyState
          icon="person-outline"
          title="Not signed in"
          subtitle="Sign in to edit your profile."
          ctaLabel="Sign In"
          onCtaPress={() => (navigation as any).navigate('Login')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <ScreenHeader
            title="Edit Profile"
            onBack={() => navigation.goBack()}
            showBackButton
            backIcon="arrow-back"
          />

          {/* Hero Media Section */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(30)}>
            <FlagshipProfileMedia
              coverUri={currentCover}
              avatarUri={currentAvatar}
              isSelf
              onEditCover={pickCover}
              onEditAvatar={pickAvatar}
              isUploadingCover={isUploadingCover}
              isUploadingAvatar={isUploadingAvatar}
              style={{ marginBottom: Space.lg }}
            />
          </Reanimated.View>

          {/* Identity Fields */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(80)} style={styles.section}>
            <Text style={styles.sectionLabel}>Identity</Text>
            <SettingsCard variant="surface">
              <PremiumTextField label="Name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" containerStyle={styles.fieldInCard} />
              <View style={styles.divider} />
              <PremiumTextField
                label="Username"
                value={username}
                onChangeText={setUsername}
                placeholder="username"
                autoCapitalize="none"
                helperText="How people find you on Thryftverse."
                containerStyle={styles.fieldInCard}
              />
            </SettingsCard>
          </Reanimated.View>

          {/* About */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(120)} style={styles.section}>
            <Text style={styles.sectionLabel}>About</Text>
            <View style={styles.fieldGroup}>
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
            </View>
          </Reanimated.View>

          {/* Personal */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(160)} style={styles.section}>
            <Text style={styles.sectionLabel}>Personal</Text>
            <SettingsCard variant="surface">
              <PremiumSelectRow
                label="Gender"
                value={gender}
                placeholder="Select gender"
                icon="person-outline"
                onPress={() => setGenderPickerVisible(true)}
                style={styles.selectInCard}
              />
            </SettingsCard>
          </Reanimated.View>

          <View style={{ height: Space.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky Save Action */}
      <View style={styles.actionBar}>
        <FlagshipActionCluster
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
      </View>

      <BottomSheetPicker
        visible={genderPickerVisible}
        onClose={() => setGenderPickerVisible(false)}
        title="Gender"
        options={GENDER_OPTIONS}
        selectedValue={gender}
        onSelect={(value) => setGender(value)}
      />
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
  headerTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xxl,
  },



  // Sections
  section: {
    marginBottom: Space.lg,
  },
  sectionLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Space.sm,
    marginLeft: Space.xs,
  },
  fieldGroup: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Space.md,
  },
  fieldInCard: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  selectInCard: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },

  // Action bar
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.md + 8,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
