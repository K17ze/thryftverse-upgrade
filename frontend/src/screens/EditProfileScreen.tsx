import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Space, Radius, Type } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { PremiumTextField } from '../components/ui/PremiumTextField';
import { PremiumSelectRow } from '../components/ui/PremiumSelectRow';
import { PremiumFormCard } from '../components/ui/PremiumFormCard';
import {
  setStoredUserAvatar,
  setStoredUserAvatarForUser,
  setStoredUserCover,
  setStoredUserCoverForUser,
} from '../preferences/profileMediaPreferences';
import { persistProfileMediaUri } from '../utils/profileMediaAsset';
import { Typography } from '../theme/designTokens';

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

  const user = currentUser as any;
  const initialGender = user?.gender ?? 'Prefer not to say';
  const initialName = user?.fullName ?? user?.displayName ?? '';
  const initialUsername = user?.username ?? '';

  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [website, setWebsite] = useState(
    (user as any)?.website ?? ''
  );
  const [gender, setGender] = useState(initialGender);
  const [genderPickerVisible, setGenderPickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [websiteError, setWebsiteError] = useState('');

  const hasChanges =
    name !== initialName ||
    username !== initialUsername ||
    bio !== (user?.bio ?? '') ||
    website !== ((user as any)?.website ?? '') ||
    gender !== initialGender;

  const validateWebsite = (value: string) => {
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
  };

  const pickCover = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.86,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsUploadingCover(true);
        try {
          const nextCoverUri = await persistProfileMediaUri(result.assets[0].uri, 'cover');
          updateUserCover(nextCoverUri);
          await Promise.all([
            setStoredUserCover(nextCoverUri),
            currentUser?.id ? setStoredUserCoverForUser(currentUser.id, nextCoverUri) : Promise.resolve(),
          ]).catch(() => {});
          show('Cover updated', 'success');
        } finally {
          setIsUploadingCover(false);
        }
      }
    } catch (err) {
      show('Could not select cover photo', 'error');
    }
  };

  const pickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsUploadingAvatar(true);
        try {
          const nextAvatarUri = await persistProfileMediaUri(result.assets[0].uri, 'avatar');
          updateUserAvatar(nextAvatarUri);
          await Promise.all([
            setStoredUserAvatar(nextAvatarUri),
            currentUser?.id ? setStoredUserAvatarForUser(currentUser.id, nextAvatarUri) : Promise.resolve(),
          ]).catch(() => {});
          show('Avatar updated', 'success');
        } finally {
          setIsUploadingAvatar(false);
        }
      }
    } catch (err) {
      show('Could not select profile photo', 'error');
    }
  };

  const handleSave = async () => {
    if (!validateWebsite(website)) return;
    setIsSaving(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const updates: Partial<any> = { bio, website, gender };
    if (name !== initialName) updates.fullName = name;
    if (username !== initialUsername) updates.username = username;
    updateUserProfile(updates);
    setIsSaving(false);
    show('Profile updated', 'success');
    navigation.goBack();
  };

  const currentAvatar = userAvatar || user?.avatar;
  const currentCover = userCover || user?.coverPhoto;

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={Colors.background}
        />
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
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Colors.background}
      />

      {/* Header */}
      <View style={styles.header}>
        <AnimatedPressable onPress={() => navigation.goBack()} scaleValue={0.92} hapticFeedback="light">
          <Ionicons name="close" size={28} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Edit profile</Text>
        <AnimatedPressable
          onPress={() => void handleSave()}
          scaleValue={0.92}
          hapticFeedback="light"
          disabled={!hasChanges || isSaving}
        >
          <Text style={[styles.doneText, (!hasChanges || isSaving) && styles.doneTextDisabled]}>
            {isSaving ? 'Saving' : 'Done'}
          </Text>
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Helper copy */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
            <Text style={styles.helperText}>
              Your profile is visible to everyone on Thryftverse. Keep it accurate and up to date.
            </Text>
          </Reanimated.View>

          {/* Cover */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(30)} style={styles.coverSection}>
            <AnimatedPressable style={styles.coverWrap} onPress={pickCover} activeOpacity={0.85} scaleValue={0.98}>
              <CachedImage
                key={`edit-cover-${currentCover}`}
                uri={currentCover}
                style={styles.coverImage}
                containerStyle={styles.coverContainer}
                contentFit="cover"
              />
              {isUploadingCover ? (
                <View style={styles.coverOverlay}>
                  <View style={styles.coverSpinner}>
                    <Ionicons name="sync" size={22} color="#fff" />
                  </View>
                </View>
              ) : (
                <View style={styles.coverOverlay}>
                  <View style={styles.coverCameraCircle}>
                    <Ionicons name="camera" size={18} color="#fff" />
                  </View>
                </View>
              )}
            </AnimatedPressable>
            <AnimatedPressable onPress={pickCover} activeOpacity={0.8} scaleValue={0.98}>
              <Text style={styles.changeText}>Change cover photo</Text>
            </AnimatedPressable>
          </Reanimated.View>

          {/* Avatar */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(40)} style={styles.avatarSection}>
            <AnimatedPressable style={styles.avatarWrap} onPress={pickAvatar} activeOpacity={0.85} scaleValue={0.97}>
              <CachedImage
                uri={currentAvatar}
                style={styles.avatarImage}
                containerStyle={styles.avatarContainer}
                contentFit="cover"
              />
              {isUploadingAvatar ? (
                <View style={styles.avatarOverlay}>
                  <View style={styles.avatarSpinner}>
                    <Ionicons name="sync" size={22} color="#fff" />
                  </View>
                </View>
              ) : (
                <View style={styles.avatarOverlay}>
                  <View style={styles.avatarCameraCircle}>
                    <Ionicons name="camera" size={16} color="#fff" />
                  </View>
                </View>
              )}
            </AnimatedPressable>
            <AnimatedPressable onPress={pickAvatar} activeOpacity={0.8} scaleValue={0.98}>
              <Text style={styles.changeText}>Change profile photo</Text>
            </AnimatedPressable>
          </Reanimated.View>

          {/* Form */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
            <PremiumFormCard>
              <PremiumTextField
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                autoCapitalize="words"
              />
              <PremiumTextField
                label="Username"
                value={username}
                onChangeText={setUsername}
                placeholder="username"
                autoCapitalize="none"
                helperText="This is how people find you on Thryftverse."
              />
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
            </PremiumFormCard>
          </Reanimated.View>

          {/* Bio */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
            <PremiumFormCard>
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
            </PremiumFormCard>
          </Reanimated.View>

          {/* Gender */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
            <PremiumFormCard>
              <PremiumSelectRow
                label="Gender"
                value={gender}
                placeholder="Select gender"
                icon="person-outline"
                onPress={() => setGenderPickerVisible(true)}
              />
            </PremiumFormCard>
          </Reanimated.View>

          <View style={{ height: Space.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>

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
  doneText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    letterSpacing: Type.body.letterSpacing,
  },
  doneTextDisabled: {
    color: Colors.textMuted,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },
  helperText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Space.lg,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },

  // Cover
  coverSection: {
    alignItems: 'center',
    marginBottom: Space.lg,
  },
  coverWrap: {
    position: 'relative',
    marginBottom: Space.sm,
    width: '100%',
    height: 140,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  coverContainer: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.lg,
  },
  coverImage: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.lg,
  },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  coverCameraCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  coverSpinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    marginBottom: Space.xl,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: Space.sm,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  avatarCameraCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  avatarSpinner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  changeText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    letterSpacing: Type.body.letterSpacing,
  },

});
