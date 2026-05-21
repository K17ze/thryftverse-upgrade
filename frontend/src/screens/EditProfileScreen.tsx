import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActiveTheme, Colors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Space, Radius, Type } from '../theme/designTokens';
import { MY_USER } from '../data/mockData';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { SettingsHeader } from '../components/settings/SettingsHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import {
  setStoredUserAvatar,
  setStoredUserAvatarForUser,
  setStoredUserCover,
  setStoredUserCoverForUser,
} from '../preferences/profileMediaPreferences';
import { persistProfileMediaUri } from '../utils/profileMediaAsset';

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const userAvatar = useStore((state) => state.userAvatar);
  const userCover = useStore((state) => state.userCover);
  const updateUserAvatar = useStore((state) => state.updateUserAvatar);
  const updateUserCover = useStore((state) => state.updateUserCover);
  const updateUserProfile = useStore((state) => state.updateUserProfile);

  const user = currentUser ? { ...MY_USER, ...currentUser } : MY_USER;

  const [bio, setBio] = useState(user?.bio ?? '');
  const [location, setLocation] = useState(user?.location ?? 'London, UK');
  const [gender, setGender] = useState('Non-binary');
  const [website, setWebsite] = useState(
    (user as any)?.website ?? `https://vsco.co/${user?.username ?? 'user'}`
  );
  const [genderPickerVisible, setGenderPickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [websiteError, setWebsiteError] = useState('');

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

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsUploadingAvatar(true);
      try {
        const nextAvatarUri = await persistProfileMediaUri(result.assets[0].uri, 'avatar');
        updateUserAvatar(nextAvatarUri);
        await Promise.all([
          setStoredUserAvatar(nextAvatarUri),
          setStoredUserAvatarForUser(MY_USER.id, nextAvatarUri),
          currentUser?.id ? setStoredUserAvatarForUser(currentUser.id, nextAvatarUri) : Promise.resolve(),
        ]).catch(() => {
          // Keep UX responsive when local persistence fails.
        });
        show('Avatar updated', 'success');
      } finally {
        setIsUploadingAvatar(false);
      }
    }
  };

  const pickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });
    if (!result.canceled) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const nextCoverUri = await persistProfileMediaUri(result.assets[0].uri, 'cover');
      updateUserCover(nextCoverUri);
      Promise.all([
        setStoredUserCover(nextCoverUri),
        setStoredUserCoverForUser(MY_USER.id, nextCoverUri),
        currentUser?.id ? setStoredUserCoverForUser(currentUser.id, nextCoverUri) : Promise.resolve(),
      ]).catch(() => {
        // Keep UX responsive when local persistence fails.
      });
      show('Cover updated', 'success');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await new Promise((resolve) => setTimeout(resolve, 600));
    updateUserProfile({ bio, location, gender, website });
    setIsSaving(false);
    show('Profile updated', 'success');
    navigation.goBack();
  };

  const currentAvatar = userAvatar || user.avatar;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <SettingsHeader title="Edit Profile" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Cover Section */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
            <AnimatedPressable
              style={styles.coverSection}
              onPress={pickCover}
              activeOpacity={0.9}
              scaleValue={0.98}
            >
              <CachedImage
                uri={userCover || user.coverPhoto || 'https://picsum.photos/seed/profilecoverdefault/1200/800'}
                style={styles.coverImage}
                contentFit="cover"
              />
              <View style={styles.coverOverlay}>
                <View style={styles.coverCameraCircle}>
                  <Ionicons name="camera" size={18} color="#fff" />
                </View>
              </View>
            </AnimatedPressable>
          </Reanimated.View>

          {/* Avatar Section */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(0)} style={styles.avatarSection}>
            <AnimatedPressable style={styles.avatarWrap} onPress={pickAvatar} activeOpacity={0.85} scaleValue={0.97}>
              <CachedImage
                uri={currentAvatar}
                style={styles.avatarImage}
                containerStyle={styles.avatarContainer}
                contentFit="cover"
              />
              {isUploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <View style={styles.avatarSpinner}>
                    <Ionicons name="sync" size={22} color="#fff" />
                  </View>
                </View>
              )}
              {!isUploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <View style={styles.avatarCameraCircle}>
                    <Ionicons name="camera" size={18} color="#fff" />
                  </View>
                </View>
              )}
            </AnimatedPressable>
            <Text style={styles.changeText}>Tap to change</Text>
          </Reanimated.View>

          {/* Form */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
            <SettingsCard>
              <AppInput
                label="Username"
                value={user.username}
                editable={false}
                suffix={<Ionicons name="lock-closed" size={16} color={Colors.textMuted} />}
                containerStyle={styles.inputSpacing}
              />

              <AnimatedPressable
                onPress={() => setGenderPickerVisible(true)}
                activeOpacity={0.8}
                scaleValue={0.98}
                hapticFeedback="light"
                style={{ marginBottom: Space.sm }}
              >
                <AppInput
                  label="Gender"
                  value={gender}
                  editable={false}
                  suffix={<Ionicons name="chevron-down" size={16} color={Colors.textMuted} />}
                  containerStyle={styles.inputSpacing}
                />
              </AnimatedPressable>

              <AppInput
                label="About You"
                value={bio}
                onChangeText={setBio}
                multiline
                maxLength={200}
                placeholder="Tell people about yourself..."
                containerStyle={styles.inputSpacing}
                inputStyle={{ minHeight: 80, textAlignVertical: 'top' }}
              />
              <Text style={styles.charCount}>{bio.length}/200</Text>

              <AppInput
                label="Location"
                value={location}
                onChangeText={setLocation}
                prefix={<Ionicons name="location-outline" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />}
                placeholder="City, Country"
                containerStyle={styles.inputSpacing}
              />

              <AppInput
                label="Website (Optional)"
                value={website}
                onChangeText={setWebsite}
                onBlur={() => validateWebsite(website)}
                prefix={<Ionicons name="link-outline" size={18} color={websiteError ? Colors.danger : Colors.textMuted} style={{ marginRight: 8 }} />}
                placeholder="https://"
                keyboardType="url"
                autoCapitalize="none"
                containerStyle={styles.inputSpacing}
                errorText={websiteError}
              />
            </SettingsCard>
          </Reanimated.View>

          {/* Save Button */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
            <AppButton
              title={isSaving ? 'Saving...' : 'Save Changes'}
              onPress={() => void handleSave()}
              disabled={isSaving || isUploadingAvatar}
              variant="primary"
              size="md"
              style={styles.saveBtn}
              accessibilityLabel="Save profile changes"
            />
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
  content: {
    padding: Space.md,
    paddingBottom: Space.xl,
  },
  coverSection: {
    height: 120,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Space.md,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  coverCameraCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: Space.lg,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  avatarCameraCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  avatarSpinner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  changeText: {
    marginTop: Space.sm,
    fontSize: Type.caption.size,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
    letterSpacing: Type.caption.letterSpacing,
  },
  inputSpacing: {
    marginBottom: Space.sm,
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: Type.meta.size,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    marginTop: -Space.xs,
    marginBottom: Space.sm,
    letterSpacing: Type.meta.letterSpacing,
  },
  saveBtn: {
    marginTop: Space.lg,
    borderRadius: Radius.xl,
  },
});
