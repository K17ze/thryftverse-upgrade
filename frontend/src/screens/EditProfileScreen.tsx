import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Pressable,
  Keyboard,
  AccessibilityInfo,
} from 'react-native';
import { useNavigation, usePreventRemove, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { PremiumToggle } from '../components/PremiumToggle';
import { updateMyProfile, type UpdateProfileInput } from '../services/profileApi';
import { parseApiError } from '../lib/apiClient';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader, FlagshipNavigationRow } from '../components/flagship';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { queryKeys } from '../platform/server/queryKeys';
import { useProfileMediaUpload } from '../hooks/useProfileMediaUpload';
import { EditProfilePreview } from '../components/profile/EditProfilePreview';

const GENDER_OPTIONS = ['Prefer not to say', 'Female', 'Male', 'Non-binary', 'Custom'];

type EditProfileRoute = RouteProp<RootStackParamList, 'EditProfile'>;

export default function EditProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<EditProfileRoute>();
  const { show } = useToast();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const currentUser = useStore((state) => state.currentUser);
  const userAvatar = useStore((state) => state.userAvatar);
  const updateUserProfile = useStore((state) => state.updateUserProfile);
  const fetchMyProfile = useStore((state) => state.fetchMyProfile);

  const user = currentUser;
  const initialName = user?.displayName ?? user?.username ?? '';
  const initialUsername = user?.username ?? '';

  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [pronouns, setPronouns] = useState(user?.pronouns ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [location, setLocation] = useState(user?.location ?? '');
  const [website, setWebsite] = useState(user?.website ?? '');
  const [gender, setGender] = useState(user?.gender ?? 'Prefer not to say');
  const [isAiCreator, setIsAiCreator] = useState(user?.isAiCreator ?? false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [customGender, setCustomGender] = useState(!GENDER_OPTIONS.includes(user?.gender ?? '') ? user?.gender ?? '' : '');
  const nameInput = useRef<TextInput>(null);
  const usernameInput = useRef<TextInput>(null);
  const pronounsInput = useRef<TextInput>(null);
  const bioInput = useRef<TextInput>(null);
  const locationInput = useRef<TextInput>(null);
  const websiteInput = useRef<TextInput>(null);

  const {
    avatar,
    cover,
    pickAvatar,
    pickCover,
    retryAvatar,
    retryCover,
    revertAvatar,
    revertCover,
    commitMedia,
    clearCommittedMedia,
    hasUnsavedMedia,
  } = useProfileMediaUpload(
    user?.id,
    userAvatar ?? user?.avatar ?? null,
    user?.coverPhoto ?? null,
  );

  const [isSaving, setIsSaving] = useState(false);
  const [websiteError, setWebsiteError] = useState('');
  const [nameError, setNameError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [didSave, setDidSave] = useState(false);
  const savingRef = useRef(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const hasChanges =
    name !== initialName ||
    username !== initialUsername ||
    pronouns !== (user?.pronouns ?? '') ||
    bio !== (user?.bio ?? '') ||
    location !== (user?.location ?? '') ||
    website !== (user?.website ?? '') ||
    (gender === 'Custom' ? customGender.trim() : gender) !== (user?.gender ?? 'Prefer not to say') ||
    isAiCreator !== (user?.isAiCreator ?? false) ||
    hasUnsavedMedia;

  const validateWebsite = useCallback((value: string) => {
    if (!value.trim()) {
      setWebsiteError('');
      return true;
    }
    try {
      const parsed = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
      if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname.includes('.') || /\s/.test(value.trim())) throw new Error('Invalid URL');
    } catch {
      setWebsiteError('Enter a valid URL (e.g. https://example.com)');
      return false;
    }
    setWebsiteError('');
    return true;
  }, []);

  const handleSave = async () => {
    if (!hasChanges || savingRef.current || avatar.status === 'uploading' || cover.status === 'uploading') return;
    const nextNameError = !name.trim() ? 'Enter your name.' : '';
    const nextUsernameError = username.trim().length < 3 ? 'Use at least 3 characters.' : '';
    setNameError(nextNameError);
    setUsernameError(nextUsernameError);
    const validWebsite = validateWebsite(website);
    if (nextNameError || nextUsernameError || !validWebsite) {
      AccessibilityInfo.announceForAccessibility('Check the highlighted profile fields.');
      (nextNameError ? nameInput : nextUsernameError ? usernameInput : websiteInput).current?.focus();
      return;
    }
    if (gender === 'Custom' && !customGender.trim()) {
      setSaveError('Enter your gender or choose Prefer not to say.');
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    setSaveError('');
    Keyboard.dismiss();
    try {
      // Upload pending media first — asset IDs are included in the profile patch
      const mediaUpdate = await commitMedia();

      const updates: UpdateProfileInput = {};
      if (name !== initialName) updates.displayName = name.trim();
      if (username !== initialUsername) updates.username = username.trim();
      if (pronouns !== (user?.pronouns ?? '')) updates.pronouns = pronouns.trim();
      if (bio !== (user?.bio ?? '')) updates.bio = bio;
      if (location !== (user?.location ?? '')) updates.location = location;
      if (website !== (user?.website ?? '')) updates.website = website;
      const savedGender = gender === 'Custom' ? customGender.trim() : gender;
      if (savedGender !== (user?.gender ?? 'Prefer not to say')) updates.gender = savedGender;
      if (isAiCreator !== (user?.isAiCreator ?? false)) updates.isAiCreator = isAiCreator;
      if (mediaUpdate.avatarAssetId) updates.avatarAssetId = mediaUpdate.avatarAssetId;
      if (mediaUpdate.coverAssetId) updates.coverAssetId = mediaUpdate.coverAssetId;
      if (Object.keys(updates).length > 0) {
        const updated = await updateMyProfile(updates);
        updateUserProfile({
          username: updated.username,
          displayName: updated.displayName,
          bio: updated.bio,
          pronouns: updated.pronouns ?? undefined,
          gender: updated.gender ?? undefined,
          isAiCreator: updated.isAiCreator ?? undefined,
          website: updated.website,
          location: updated.location,
          phone: updated.phone,
          avatar: updated.avatar,
          coverPhoto: updated.coverPhoto,
          coverVideo: updated.coverVideo,
        });
      }

      clearCommittedMedia();
      await fetchMyProfile();
      if (user?.id) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(user.id) });
      }
      show('Profile updated', 'success');
      setDidSave(true);
    } catch (err: unknown) {
      const parsed = parseApiError(err, 'Could not save your profile. Try again.');
      const message = parsed.isNetworkError
        ? 'Save could not be confirmed. Your edits are still here. Reconnect and save again to confirm them.'
        : parsed.message;
      setSaveError(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  usePreventRemove(!didSave && (hasChanges || isSaving), ({ data }) => {
    if (isSaving || avatar.status === 'uploading' || cover.status === 'uploading') {
      show('Wait for your profile to finish saving.', 'info');
      return;
    }
    setConfirmSheet({
      visible: true,
      title: 'Unsaved changes',
      message: 'Discard your changes and go back?',
      confirmLabel: 'Discard',
      variant: 'danger',
      onConfirm: () => {
        revertAvatar();
        revertCover();
        navigation.dispatch(data.action);
      } });
  });

  useEffect(() => {
    if (didSave) navigation.goBack();
  }, [didSave, navigation]);

  // P1-6: Auto-open picker when navigated with focus param
  const autoOpenRef = useRef(false);
  useEffect(() => {
    if (autoOpenRef.current || !user) return;
    autoOpenRef.current = true;
    const focus = route.params?.focus;
    if (focus === 'avatar') {
      void pickAvatar();
    } else if (focus === 'cover') {
      void pickCover();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Edit profile"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <EmptyState
          icon="person-outline"
          title="Not signed in"
          subtitle="Sign in to edit your profile."
          ctaLabel="Sign In"
          onCtaPress={() => navigation.navigate('Login')}
        />
      </FlagshipScreen>
    );
  }

  const canSave = hasChanges && !isSaving && avatar.status !== 'uploading' && cover.status !== 'uploading';
  const saveAction = (
    <AnimatedPressable
      onPress={() => void handleSave()}
      disabled={!canSave}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={isSaving ? 'Saving' : 'Save changes'}
      accessibilityState={{ disabled: !canSave, busy: isSaving }}
      style={[styles.saveBtn, (canSave || isSaving) && styles.saveBtnActive]}
    >
      {isSaving ? (
        <ActivityIndicator size="small" color={colors.textInverse} />
      ) : (
        <Text style={[styles.saveBtnText, canSave && styles.saveBtnTextActive]}>
          Save
        </Text>
      )}
    </AnimatedPressable>
  );

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Edit profile"
          onBack={() => navigation.goBack()}
          rightAction={saveAction}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, Space.md) + Space.lg }}
      >
        <EditProfilePreview
          coverUri={cover.pendingLocal || cover.confirmedRemote || user?.coverPhoto || ''}
          avatarUri={avatar.pendingLocal || avatar.confirmedRemote || userAvatar || user?.avatar || ''}
          displayName={name}
          username={username}
          bio={bio}
          location={location}
          memberSince={user?.createdAt ? new Date(user.createdAt).getFullYear().toString() : '2026'}
          onEditCover={() => void pickCover()}
          onEditAvatar={() => void pickAvatar()}
          isUploadingCover={cover.status === 'uploading'}
          isUploadingAvatar={avatar.status === 'uploading'}
          hasCoverError={cover.status === 'failed'}
          hasAvatarError={avatar.status === 'failed'}
        />

        {avatar.status === 'failed' && (
          <View style={styles.statusBlock}>
            <Text style={styles.fieldError} accessibilityRole="alert">
              {avatar.error || 'Your avatar could not be saved.'}
            </Text>
            <View style={styles.recoveryActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry avatar upload"
                onPress={() => void retryAvatar()}
                style={({ pressed }) => [styles.recoveryButton, pressed && styles.pressed]}
              >
                <Text style={styles.editPictureActionText}>Retry</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Discard pending avatar"
                onPress={() => revertAvatar()}
                style={({ pressed }) => [styles.recoveryButton, pressed && styles.pressed]}
              >
                <Text style={styles.fieldHelper}>Discard</Text>
              </Pressable>
            </View>
          </View>
        )}

        {cover.status === 'failed' && (
          <View style={styles.statusBlock}>
            <Text style={styles.fieldError} accessibilityRole="alert">
              {cover.error || 'Your cover could not be saved.'}
            </Text>
            <View style={styles.recoveryActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry cover upload"
                onPress={() => void retryCover()}
                style={({ pressed }) => [styles.recoveryButton, pressed && styles.pressed]}
              >
                <Text style={styles.editPictureActionText}>Retry</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Discard pending cover"
                onPress={() => revertCover()}
                style={({ pressed }) => [styles.recoveryButton, pressed && styles.pressed]}
              >
                <Text style={styles.fieldHelper}>Discard</Text>
              </Pressable>
            </View>
          </View>
        )}

        {saveError ? (
          <View style={styles.statusBlock}>
            <Text style={styles.fieldError} accessibilityRole="alert" accessibilityLiveRegion="assertive">{saveError}</Text>
          </View>
        ) : null}

        <View style={styles.sectionGroup}>
          <Text style={styles.sectionLabel}>Public profile</Text>

          <ProfileEditField
            label="Name"
            value={name}
            onChangeText={(value) => { setName(value); setNameError(''); }}
            inputRef={nameInput}
            onSubmitEditing={() => usernameInput.current?.focus()}
            error={nameError}
            maxLength={120}
            editable={!isSaving}
            placeholder="Your name"
            autoCapitalize="words"
            returnKeyType="next"
          />

          <ProfileEditField
            label="Username"
            value={username}
            onChangeText={(value) => { setUsername(value); setUsernameError(''); }}
            inputRef={usernameInput}
            onSubmitEditing={() => pronounsInput.current?.focus()}
            error={usernameError}
            maxLength={32}
            editable={!isSaving}
            placeholder="username"
            autoCapitalize="none"
            returnKeyType="next"
          />

          <ProfileEditField
            label="Pronouns"
            value={pronouns}
            onChangeText={setPronouns}
            inputRef={pronounsInput}
            onSubmitEditing={() => bioInput.current?.focus()}
            maxLength={60}
            editable={!isSaving}
            placeholder="they/them, she/her, he/him"
            autoCapitalize="none"
            returnKeyType="next"
          />
        </View>

        <View style={styles.sectionGroup}>
          <ProfileEditField
            label="Bio"
            value={bio}
            onChangeText={setBio}
            inputRef={bioInput}
            editable={!isSaving}
            placeholder="Tell people about yourself…"
            multiline
            maxLength={500}
            autoCapitalize="sentences"
          />

          <ProfileEditField
            label="Location"
            value={location}
            onChangeText={setLocation}
            inputRef={locationInput}
            onSubmitEditing={() => websiteInput.current?.focus()}
            maxLength={120}
            editable={!isSaving}
            placeholder="City, Country"
            autoCapitalize="words"
            returnKeyType="next"
          />

          <ProfileEditField
            label="Website"
            value={website}
            onChangeText={(value) => { setWebsite(value); setWebsiteError(''); }}
            inputRef={websiteInput}
            maxLength={255}
            editable={!isSaving}
            onBlur={() => validateWebsite(website)}
            placeholder="https://"
            error={websiteError}
            autoCapitalize="none"
            keyboardType="url"
            returnKeyType="done"
          />

        </View>

        <View style={styles.sectionGroup}>
          <Text style={styles.sectionLabel}>Creator disclosure</Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabelWrap}>
              <Text style={styles.toggleTitle}>AI-generated content</Text>
              <Text style={styles.toggleSubtitle}>
                AI-generated content label
              </Text>
            </View>
            <PremiumToggle
              value={isAiCreator}
              onValueChange={setIsAiCreator}
              disabled={isSaving}
              accessibilityLabel={`AI-generated content, ${isAiCreator ? 'enabled' : 'disabled'}`}
            />
          </View>
        </View>

        <View style={styles.sectionGroup}>
          <Text style={styles.sectionLabel}>Private details</Text>

          <Pressable
            style={({ pressed }) => [styles.selectableField, pressed && styles.pressed]}
            onPress={() => setShowGenderPicker(true)}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel={`Gender, currently ${gender === 'Custom' ? customGender || 'Custom' : gender}`}
            accessibilityState={{ disabled: isSaving }}
          >
            <View style={styles.selectableFieldContent}>
              <Text style={styles.fieldLabel}>Gender</Text>
              <Text style={styles.selectableFieldValue}>{gender === 'Custom' ? customGender || 'Custom' : gender}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
          {gender === 'Custom' && <ProfileEditField label="Your gender" value={customGender} onChangeText={setCustomGender} maxLength={80} editable={!isSaving} returnKeyType="done" />}

          <ProfileEditField
            label="Email"
            value={user.email ?? '—'}
            onChangeText={() => {}}
            readOnly
          />

          <ProfileEditField
            label="Email verification"
            value={user.emailVerified === true ? 'Verified' : user.emailVerified === false ? 'Not verified' : 'Not available'}
            onChangeText={() => {}}
            readOnly
            isLast
          />
        </View>

        <View style={styles.navSection}>
          <Text style={[styles.sectionLabel, styles.navSectionLabel]}>Security</Text>

          <FlagshipNavigationRow
            title="Password"
            onPress={() => navigation.navigate('ChangePassword')}
            accessibilityHint="Change your password"
          />

          <FlagshipNavigationRow
            title="Two-factor authentication"
            subtitle={user.twoFactorEnabled ? 'On' : 'Off'}
            onPress={() => navigation.navigate('TwoFactorSetup')}
            separator={false}
            accessibilityHint="Manage two-factor authentication"
          />
        </View>

        <View style={styles.navSection}>
          <Text style={[styles.sectionLabel, styles.navSectionLabel]}>Account</Text>

          <FlagshipNavigationRow
            title="Account control"
            subtitle="Deactivate or delete your account"
            danger
            onPress={() => navigation.navigate('AccountControl')}
            separator={false}
            accessibilityHint="Manage account control and deletion"
          />
        </View>
      </KeyboardAwareScrollView>

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
      />

      <BottomSheetPicker
        visible={showGenderPicker}
        onClose={() => setShowGenderPicker(false)}
        title="Gender"
        options={GENDER_OPTIONS}
        selectedValue={GENDER_OPTIONS.includes(gender) ? gender : 'Custom'}
        onSelect={(val) => setGender(val)}
      />
    </FlagshipScreen>
  );
}

interface ProfileEditFieldProps {
  inputRef?: React.Ref<TextInput>;
  onSubmitEditing?: () => void;
  editable?: boolean;
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
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
  readOnly?: boolean;
}

function ProfileEditField({
  inputRef,
  onSubmitEditing,
  editable = true,
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
  readOnly }: ProfileEditFieldProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isFocused, setIsFocused] = useState(false);
  const hasError = Boolean(error);
  const showCounter = multiline && maxLength !== undefined;
  const counterText = showCounter ? `${value.length}/${maxLength}` : helper;
  const isNearLimit = showCounter && value.length >= (maxLength ?? 0) * 0.9;

  if (readOnly) {
    return (
      <View style={[styles.fieldGroup, isLast && styles.fieldGroupLast]}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.readOnlyValue}>
          {value || '—'}
        </Text>
      </View>
    );
  }

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
          ref={inputRef}
          editable={editable}
          accessibilityLabel={label}
          accessibilityHint={error || helper}
          accessibilityState={{ disabled: !editable }}
          aria-invalid={hasError}
          onSubmitEditing={onSubmitEditing}
          submitBehavior={onSubmitEditing ? 'submit' : multiline ? 'newline' : 'blurAndSubmit'}
          autoCorrect={autoCapitalize !== 'none'}
          underlineColorAndroid="transparent"
          style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
          value={value}
          onChangeText={onChangeText ?? undefined}
          onFocus={() => setIsFocused(true)}
          onBlur={() => { setIsFocused(false); onBlur?.(); }}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          multiline={multiline}
          maxLength={maxLength}
          textAlignVertical={multiline ? 'top' : 'center'}
          selectionColor={colors.brand}
        />
        {showCounter && (
          <Text style={[styles.fieldCounter, isNearLimit && styles.fieldCounterError]}>
            {counterText}
          </Text>
        )}
      </View>
      {helper && !showCounter ? (
        <Text style={styles.fieldHelper}>{helper}</Text>
      ) : null}
      {hasError ? (
        <Text style={styles.fieldError} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    saveBtn: {
      paddingHorizontal: Space.md,
      minHeight: 52,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: Control.hit,
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: colors.border },
    saveBtnActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand },
    saveBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textMuted },
    saveBtnTextActive: {
      color: colors.textInverse },
    sectionGroup: {
      paddingTop: Space.lg,
      paddingHorizontal: Space.md },
    navSection: {
      paddingTop: Space.lg },
    sectionLabel: {
      fontSize: TypographyV2.captionElevated.size,
      fontFamily: TypographyV2.captionElevated.fontFamily,
      color: colors.textSecondary,
      letterSpacing: TypographyV2.captionElevated.letterSpacing,
      lineHeight: TypographyV2.captionElevated.lineHeight,
      marginBottom: Space.sm },
    navSectionLabel: {
      paddingHorizontal: Space.md },
    fieldGroup: {
      marginBottom: Space.md },
    fieldGroupLast: {
      marginBottom: 0 },
    readOnlyValue: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textMuted,
      paddingVertical: Space.sm },
    fieldLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      marginBottom: Space.xs + 2,
      lineHeight: TypographyV2.meta.lineHeight },
    fieldSurface: {
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      backgroundColor: colors.input,
      paddingHorizontal: Space.md,
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    fieldSurfaceFocused: {
      borderColor: colors.brand,
      borderWidth: Stroke.emphasis },
    fieldSurfaceError: {
      borderColor: colors.danger,
      borderWidth: Stroke.emphasis },
    fieldSurfaceMultiline: {
      alignItems: 'flex-end',
      paddingVertical: Space.sm,
      minHeight: 104 },
    fieldInput: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      paddingVertical: Space.sm,
      paddingHorizontal: 0 },
    fieldInputMultiline: {
      flex: 1,
      minHeight: 72,
      lineHeight: TypographyV2.body.lineHeight,
      paddingVertical: 0 },
    fieldCounter: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      paddingBottom: Space.xs / 2,
      fontVariant: ['tabular-nums'] as ['tabular-nums'] },
    fieldCounterError: {
      color: colors.danger },
    fieldHelper: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      marginTop: Space.xs + 2,
      lineHeight: TypographyV2.meta.lineHeight },
    fieldError: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.danger,
      marginTop: Space.xs + 2,
      lineHeight: TypographyV2.meta.lineHeight },
    selectableField: {
      minHeight: 52,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      backgroundColor: colors.input,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Space.xs,
    },
    selectableFieldContent: {
      flex: 1,
    },
    selectableFieldValue: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      lineHeight: TypographyV2.body.lineHeight,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      minHeight: Control.hit,
    },
    toggleLabelWrap: {
      flex: 1,
      marginRight: Space.md,
    },
    toggleTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      marginBottom: 2,
    },
    toggleSubtitle: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      color: colors.textMuted,
      lineHeight: TypographyV2.caption.lineHeight,
    },
    sectionHint: {
      fontSize: TypographyV2.caption.size,
      fontFamily: TypographyV2.caption.fontFamily,
      color: colors.textMuted,
      marginBottom: Space.sm,
    },
    statusBlock: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      backgroundColor: colors.surfaceAlt,
      marginHorizontal: Space.md,
      borderRadius: Radius.md,
      marginTop: Space.md,
    },
    recoveryActions: {
      flexDirection: 'row',
      gap: Space.md,
      marginTop: Space.xs,
    },
    recoveryButton: {
      paddingVertical: Space.xs,
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    editPictureActionText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.brand,
    },
    pressed: {
      opacity: 0.65,
    },
  });
}
