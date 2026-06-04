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
import {
  setStoredUserAvatar,
  setStoredUserAvatarForUser,
} from '../preferences/profileMediaPreferences';
import { persistProfileMediaUri } from '../utils/profileMediaAsset';
import { Typography } from '../constants/typography';

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const userAvatar = useStore((state) => state.userAvatar);
  const updateUserAvatar = useStore((state) => state.updateUserAvatar);
  const updateUserProfile = useStore((state) => state.updateUserProfile);

  const user = currentUser ? { ...MY_USER, ...currentUser } : MY_USER;

  const [name, setName] = useState(user?.username ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [website, setWebsite] = useState(
    (user as any)?.website ?? ''
  );
  const [gender, setGender] = useState('Non-binary');
  const [genderPickerVisible, setGenderPickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [websiteError, setWebsiteError] = useState('');

  const hasChanges =
    name !== (user?.username ?? '') ||
    username !== (user?.username ?? '') ||
    bio !== (user?.bio ?? '') ||
    website !== ((user as any)?.website ?? '') ||
    gender !== 'Non-binary';

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
        ]).catch(() => {});
        show('Avatar updated', 'success');
      } finally {
        setIsUploadingAvatar(false);
      }
    }
  };

  const handleSave = async () => {
    if (!validateWebsite(website)) return;
    setIsSaving(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await new Promise((resolve) => setTimeout(resolve, 400));
    updateUserProfile({ bio, website, username: name });
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
            <View style={styles.formGroup}>
              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Name</Text>
                <TextInput
                  style={styles.inputField}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.inputDivider} />

              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Username</Text>
                <TextInput
                  style={[styles.inputField, { color: Colors.textMuted }]}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="username"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  editable={false}
                />
              </View>

              <View style={styles.inputDivider} />

              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Website</Text>
                <TextInput
                  style={styles.inputField}
                  value={website}
                  onChangeText={setWebsite}
                  onBlur={() => validateWebsite(website)}
                  placeholder="https://"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>
              {websiteError ? (
                <Text style={styles.errorText}>{websiteError}</Text>
              ) : null}
            </View>
          </Reanimated.View>

          {/* Bio row */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
            <View style={styles.formGroup}>
              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Bio</Text>
                <TextInput
                  style={[styles.inputField, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell people about yourself..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  maxLength={200}
                />
              </View>
              <Text style={styles.charCount}>{bio.length}/200</Text>
            </View>
          </Reanimated.View>

          {/* Gender row */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
            <AnimatedPressable
              onPress={() => setGenderPickerVisible(true)}
              activeOpacity={0.8}
              scaleValue={0.98}
              hapticFeedback="light"
            >
              <View style={styles.formGroup}>
                <View style={styles.rowBlock}>
                  <Text style={styles.inputLabel}>Gender</Text>
                  <View style={styles.rowValue}>
                    <Text style={styles.rowValueText}>{gender}</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </View>
                </View>
              </View>
            </AnimatedPressable>
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

  // Form
  formGroup: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Space.md,
  },
  inputBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    minHeight: 56,
  },
  inputDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: Space.md,
  },
  inputLabel: {
    width: 100,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  inputField: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
    padding: 0,
  },
  rowBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: Space.md,
    minHeight: 56,
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  rowValueText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    letterSpacing: Type.body.letterSpacing,
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: -Space.xs,
    marginRight: Space.md,
    marginBottom: Space.sm,
    letterSpacing: Type.meta.letterSpacing,
  },
  errorText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.danger,
    marginLeft: Space.md,
    marginBottom: Space.sm,
    letterSpacing: Type.caption.letterSpacing,
  },
});
