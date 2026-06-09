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
          {/* Header */}
          <View style={styles.header}>
            <AnimatedPressable onPress={() => navigation.goBack()} scaleValue={0.92} hapticFeedback="light">
              <Ionicons name="close" size={28} color={Colors.textPrimary} />
            </AnimatedPressable>
            <Text style={styles.headerTitle}>Edit Profile</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Hero Media Section */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(30)}>
            <View style={styles.heroSection}>
              <AnimatedPressable onPress={pickCover} activeOpacity={0.92} scaleValue={0.985}>
                <View style={styles.coverFrame}>
                  {currentCover ? (
                    <CachedImage uri={currentCover} style={styles.coverImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.coverImage, { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="image-outline" size={32} color={Colors.textMuted} />
                    </View>
                  )}
                  {isUploadingCover && (
                    <View style={styles.uploadOverlay}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  )}
                  {!isUploadingCover && (
                    <View style={styles.coverEditBadge}>
                      <Ionicons name="camera" size={14} color="#fff" />
                    </View>
                  )}
                </View>
              </AnimatedPressable>

              <View style={styles.avatarOuter}>
                <AnimatedPressable onPress={pickAvatar} activeOpacity={0.92} scaleValue={0.97}>
                  <View style={styles.avatarFrame}>
                    {currentAvatar ? (
                      <CachedImage uri={currentAvatar} style={styles.avatarImage} contentFit="cover" />
                    ) : (
                      <View style={[styles.avatarImage, { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="person" size={32} color={Colors.textMuted} />
                      </View>
                    )}
                    {isUploadingAvatar && (
                      <View style={styles.uploadOverlay}>
                        <ActivityIndicator color="#fff" size="small" />
                      </View>
                    )}
                    {!isUploadingAvatar && (
                      <View style={styles.avatarEditBadge}>
                        <Ionicons name="camera" size={12} color="#fff" />
                      </View>
                    )}
                  </View>
                </AnimatedPressable>
              </View>
            </View>
          </Reanimated.View>

          {/* Identity Fields */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(80)} style={styles.section}>
            <Text style={styles.sectionLabel}>Identity</Text>
            <View style={styles.fieldGroup}>
              <PremiumTextField label="Name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
              <View style={styles.divider} />
              <PremiumTextField
                label="Username"
                value={username}
                onChangeText={setUsername}
                placeholder="username"
                autoCapitalize="none"
                helperText="How people find you on Thryftverse."
              />
            </View>
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
            <View style={styles.fieldGroup}>
              <PremiumSelectRow
                label="Gender"
                value={gender}
                placeholder="Select gender"
                icon="person-outline"
                onPress={() => setGenderPickerVisible(true)}
              />
            </View>
          </Reanimated.View>

          <View style={{ height: Space.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky Save Action */}
      <View style={styles.actionBar}>
        <AppButton
          title={isSaving ? 'Saving...' : 'Save Changes'}
          variant="primary"
          onPress={handleSave}
          disabled={!hasChanges || isSaving}
          loading={isSaving}
          hapticFeedback="medium"
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

  // Hero
  heroSection: {
    alignItems: 'center',
    marginBottom: Space.xl,
  },
  coverFrame: {
    width: '100%',
    height: 160,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEditBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  avatarOuter: {
    marginTop: -48,
    alignItems: 'center',
  },
  avatarFrame: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 3,
    borderColor: Colors.background,
  },
  avatarImage: {
    width: 96,
    height: 96,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
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
