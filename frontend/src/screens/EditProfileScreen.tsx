import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Typography, Radius, Type, Stroke, Control } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { updateMyProfile } from '../services/profileApi';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsRow } from '../components/settings/SettingsRow';
import { queryKeys } from '../platform/server/queryKeys';

export default function EditProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { show } = useToast();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const currentUser = useStore((state) => state.currentUser);
  const twoFactorEnabled = useStore((state) => state.twoFactorEnabled);
  const userAvatar = useStore((state) => state.userAvatar);
  const updateUserProfile = useStore((state) => state.updateUserProfile);
  const fetchMyProfile = useStore((state) => state.fetchMyProfile);

  const user = currentUser;
  const initialName = user?.displayName ?? user?.username ?? '';
  const initialUsername = user?.username ?? '';

  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [location, setLocation] = useState(user?.location ?? '');
  const [website, setWebsite] = useState(user?.website ?? '');

  const [isSaving, setIsSaving] = useState(false);
  const [websiteError, setWebsiteError] = useState('');

  const hasChanges =
    name !== initialName ||
    username !== initialUsername ||
    bio !== (user?.bio ?? '') ||
    location !== (user?.location ?? '') ||
    website !== (user?.website ?? '');

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
    if (!hasChanges || isSaving) return;
    if (!validateWebsite(website)) return;
    setIsSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (name !== initialName) updates.displayName = name;
      if (username !== initialUsername) updates.username = username;
      if (bio !== (user?.bio ?? '')) updates.bio = bio;
      if (location !== (user?.location ?? '')) updates.location = location;
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
      if (user?.id) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(user.id) });
      }
      show('Profile updated', 'success');
      navigation.goBack();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save profile. Try again.';
      show(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!hasChanges) {
      navigation.goBack();
      return;
    }
    Alert.alert(
      'Unsaved changes',
      'You have unsaved changes. Are you sure you want to discard them?',
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

  // ── Top-right Save/Done — visible pill, brand-filled when active ──
  const canSave = hasChanges && !isSaving;
  const saveAction = (
    <AnimatedPressable
      onPress={() => void handleSave()}
      disabled={!canSave}
      scaleValue={0.94}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={isSaving ? 'Saving' : 'Save changes'}
      style={[styles.saveBtn, canSave && styles.saveBtnActive]}
    >
      {isSaving ? (
        <ActivityIndicator size="small" color={colors.textInverse} />
      ) : (
        <Text style={[styles.saveBtnText, canSave && styles.saveBtnTextActive]}>
          Done
        </Text>
      )}
    </AnimatedPressable>
  );

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Edit profile"
          onBack={handleDiscard}
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
        {/* ── Profile preview — identity row ── */}
        <View style={styles.identityRow}>
          {userAvatar ? (
            <CachedImage
              uri={userAvatar}
              style={styles.identityAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.identityAvatar, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={styles.identityAvatarText}>
                {(user?.username ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.identityText}>
            <Text style={styles.identityName} numberOfLines={1}>{name || username}</Text>
            <Text style={styles.identityHandle} numberOfLines={1}>@{username}</Text>
          </View>
        </View>

        <Text style={styles.photoHint}>
          Photo and cover are managed from your profile.
        </Text>

        {/* ── Profile fields ── */}
        <View style={styles.sectionGroup}>
          <Text style={styles.sectionLabel}>Profile</Text>

          <ProfileEditField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
            returnKeyType="next"
          />

          <ProfileEditField
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="username"
            autoCapitalize="none"
            returnKeyType="next"
          />
        </View>

        {/* ── About fields ── */}
        <View style={styles.sectionGroup}>
          <Text style={styles.sectionLabel}>About</Text>

          <ProfileEditField
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Tell people about yourself…"
            multiline
            maxLength={200}
          />

          <ProfileEditField
            label="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="City, Country"
            autoCapitalize="words"
            returnKeyType="next"
          />

          <ProfileEditField
            label="Website"
            value={website}
            onChangeText={setWebsite}
            onBlur={() => validateWebsite(website)}
            placeholder="https://"
            error={websiteError}
            autoCapitalize="none"
            keyboardType="url"
            returnKeyType="done"
            isLast
          />
        </View>

        {/* ── Security — flat grouped native rows, navigation only ── */}
        <View style={styles.sectionGroupFlush}>
          <Text style={[styles.sectionLabel, { paddingHorizontal: Space.md }]}>Security</Text>
          <SettingsRow
            icon="lock-closed-outline"
            iconColor={colors.brand}
            title="Password"
            subtitle="Change your password"
            onPress={() => navigation.navigate('ChangePassword')}
            isFirst
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            iconColor={twoFactorEnabled ? colors.brand : colors.textMuted}
            title="Two-factor authentication"
            subtitle={twoFactorEnabled ? 'Enabled' : 'Add an extra layer of security'}
            value={twoFactorEnabled ? 'On' : 'Off'}
            onPress={() => navigation.navigate('TwoFactorSetup')}
            isLast
          />
        </View>

        {/* ── Account — flat native row, navigation only ── */}
        <View style={styles.sectionGroupFlush}>
          <Text style={[styles.sectionLabel, { paddingHorizontal: Space.md }]}>Account</Text>
          <SettingsRow
            icon="shield-outline"
            title="Account control"
            subtitle="Download your data or delete your account"
            onPress={() => navigation.navigate('AccountControl')}
            isFirst
            isLast
          />
        </View>
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

// ── Premium form field ──
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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isFocused, setIsFocused] = useState(false);
  const hasError = Boolean(error);
  const showCounter = maxLength !== undefined;
  const counterText = showCounter ? `${value.length}/${maxLength}` : helper;
  const isNearLimit = showCounter && value.length >= (maxLength ?? 0) * 0.9;

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
        <Text style={styles.fieldError}>{error}</Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Top-right Done button — visible pill, brand-filled when active ──
    saveBtn: {
      paddingHorizontal: Space.md,
      height: Control.chrome,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: Control.hit,
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
    },
    saveBtnActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    saveBtnText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
    },
    saveBtnTextActive: {
      color: colors.textInverse,
    },

    // ── Identity row — profile preview ──
    identityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingHorizontal: Space.md,
      paddingTop: Space.md + 2,
      paddingBottom: Space.sm,
    },
    identityAvatar: {
      width: 52,
      height: 52,
      borderRadius: Radius.full,
    },
    identityAvatarText: {
      fontSize: Type.bodyLarge.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      textAlign: 'center',
      lineHeight: 52,
    },
    identityText: {
      flex: 1,
      minWidth: 0,
      gap: Space.xs / 4,
    },
    identityName: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
      lineHeight: Type.bodyEmphasis.lineHeight,
    },
    identityHandle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      letterSpacing: Type.caption.letterSpacing,
    },
    photoHint: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      paddingHorizontal: Space.md,
      paddingTop: 0,
      paddingBottom: Space.sm,
      lineHeight: Type.caption.lineHeight,
    },

    // ── Sections — form groups with horizontal padding ──
    sectionGroup: {
      paddingTop: Space.lg,
      paddingHorizontal: Space.md,
    },
    // ── Flush sections — no horizontal padding so SettingsRow owns its padding ──
    sectionGroupFlush: {
      paddingTop: Space.lg,
    },
    sectionLabel: {
      fontSize: Type.metaElevated.size,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: Type.metaElevated.letterSpacing,
      marginBottom: Space.sm,
    },

    // ── Fields — premium inputs with clear focus states ──
    fieldGroup: {
      marginBottom: Space.md,
    },
    fieldGroupLast: {
      marginBottom: 0,
    },
    fieldLabel: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      marginBottom: Space.xs + 2,
      lineHeight: Type.captionElevated.lineHeight,
    },
    fieldSurface: {
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      backgroundColor: colors.input,
      paddingHorizontal: Space.md,
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    fieldSurfaceFocused: {
      borderColor: colors.brand,
      borderWidth: Stroke.emphasis,
    },
    fieldSurfaceError: {
      borderColor: colors.danger,
      borderWidth: Stroke.emphasis,
    },
    fieldSurfaceMultiline: {
      alignItems: 'flex-end',
      paddingVertical: Space.sm,
      minHeight: 104,
    },
    fieldInput: {
      flex: 1,
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
      paddingVertical: Space.sm,
      paddingHorizontal: 0,
    },
    fieldInputMultiline: {
      flex: 1,
      minHeight: 72,
      lineHeight: Type.body.lineHeight,
      paddingVertical: 0,
    },
    fieldCounter: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      paddingBottom: Space.xs / 2,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    },
    fieldCounterError: {
      color: colors.danger,
    },
    fieldHelper: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: Space.xs + 2,
      lineHeight: Type.caption.lineHeight,
    },
    fieldError: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.danger,
      marginTop: Space.xs + 2,
      lineHeight: Type.caption.lineHeight,
    },
  });
}
