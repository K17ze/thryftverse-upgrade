import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Typography, Radius, Type } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { parseApiError } from '../lib/apiClient';
import { EmptyState } from '../components/EmptyState';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppInput } from '../components/ui/AppInput';
import { CachedImage } from '../components/CachedImage';
import { updateMyProfile } from '../services/profileApi';
import { updateUserProfile as updateUserProfileApi } from '../services/accountApi';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { queryKeys } from '../platform/server/queryKeys';

const VERIFIED_LABEL = 'Verified';
const UNVERIFIED_LABEL = 'Not verified';

export default function EditProfileScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { show } = useToast();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();
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
  const [website, setWebsite] = useState(user?.website ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');

  const [isSaving, setIsSaving] = useState(false);
  const [websiteError, setWebsiteError] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const hasTextChanges =
    name !== initialName ||
    username !== initialUsername ||
    bio !== (user?.bio ?? '') ||
    website !== (user?.website ?? '');
  const hasPhoneChanged = phone !== (user?.phone ?? '');
  const hasChanges = hasTextChanges || hasPhoneChanged;

  const openEdit = (field: string, current: string) => {
    setEditingField(field);
    setEditValue(current);
  };
  const closeEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const email = user?.email ?? '';
  const emailVerified = !!user?.emailVerified;
  const country = user?.country ?? '';

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

      if (hasPhoneChanged) {
        const previousPhone = phone;
        updateUserProfile({ phone });
        try {
          await updateUserProfileApi({ phone });
        } catch (phoneErr) {
          const parsed = parseApiError(phoneErr, 'Unable to save phone number.');
          show(parsed.message, 'error');
          setPhone(previousPhone);
          updateUserProfile({ phone: previousPhone });
          setIsSaving(false);
          return;
        }
      }

      await fetchMyProfile();
      if (user?.id) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(user.id) });
      }
      show('Profile updated', 'success');
      navigation.goBack();
    } catch (err: any) {
      const message = err?.message || 'Failed to save profile. Please try again.';
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
        {/* ── Compact identity row ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
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
        </Reanimated.View>

        <Text style={styles.photoHint}>
          Photo and cover are managed from your profile.
        </Text>

        {/* ── Profile fields ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)} style={styles.sectionGroup}>
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
        </Reanimated.View>

        {/* ── About fields ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)} style={styles.sectionGroup}>
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
        </Reanimated.View>

        {/* ── Private details — integrated as form fields, not settings dump ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)} style={styles.sectionGroup}>
          <Text style={styles.sectionLabel}>Private details</Text>

          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Email</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{email || '—'}</Text>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Email status</Text>
              <View style={styles.detailStatusWrap}>
                {emailVerified ? (
                  <View style={[styles.statusPill, styles.statusPillVerified]}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.brand} />
                    <Text style={[styles.statusPillText, { color: colors.brand }]}>Verified</Text>
                  </View>
                ) : (
                  <View style={[styles.statusPill, styles.statusPillUnverified]}>
                    <Ionicons name="alert-circle" size={12} color={colors.textMuted} />
                    <Text style={[styles.statusPillText, { color: colors.textMuted }]}>Not verified</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.detailDivider} />
            <Pressable
              onPress={() => openEdit('phone', phone)}
              style={styles.detailRowTouchable}
              accessibilityRole="button"
              accessibilityLabel="Edit phone number"
            >
              <Text style={styles.detailLabel}>Phone</Text>
              <View style={styles.detailRight}>
                <Text style={styles.detailValue} numberOfLines={1}>{phone || '—'}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </Pressable>
          </View>
        </Reanimated.View>

        {/* ── Security — stronger hierarchy with icon chips ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(240)} style={styles.sectionGroup}>
          <Text style={styles.sectionLabel}>Security</Text>

          <View style={styles.detailCard}>
            <PressableRow
              icon="lock-closed-outline"
              iconColor={colors.brand}
              title="Password"
              subtitle="Change your password"
              onPress={() => navigation.navigate('ChangePassword')}
              isFirst
            />
            <View style={styles.detailDivider} />
            <PressableRow
              icon="shield-checkmark-outline"
              iconColor={twoFactorEnabled ? colors.brand : colors.textMuted}
              title="Two-factor authentication"
              subtitle={twoFactorEnabled ? 'Enabled' : 'Add an extra layer of security'}
              statusPill={
                twoFactorEnabled ? (
                  <View style={[styles.statusPill, styles.statusPillVerified]}>
                    <Text style={[styles.statusPillText, { color: colors.brand }]}>On</Text>
                  </View>
                ) : (
                  <View style={[styles.statusPill, styles.statusPillUnverified]}>
                    <Text style={[styles.statusPillText, { color: colors.textMuted }]}>Off</Text>
                  </View>
                )
              }
              onPress={() => navigation.navigate('TwoFactorSetup')}
              isLast
            />
          </View>
        </Reanimated.View>

        {/* ── Account — prominent, not buried ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(300)} style={styles.sectionGroup}>
          <Text style={styles.sectionLabel}>Account</Text>

          <Pressable
            onPress={() => navigation.navigate('AccountControl')}
            style={({ pressed }) => [
              styles.accountCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              pressed && { backgroundColor: colors.surfaceAlt },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Account control — download data or delete account"
          >
            <View style={styles.accountIconWrap}>
              <Ionicons name="shield-outline" size={20} color={colors.textSecondary} />
            </View>
            <View style={styles.accountText}>
              <Text style={[styles.accountTitle, { color: colors.textPrimary }]}>Account control</Text>
              <Text style={[styles.accountSubtitle, { color: colors.textSecondary }]}>Download your data or delete your account</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </Reanimated.View>
      </KeyboardAwareScrollView>

      {/* ── Phone Edit Modal — premium bottom sheet ── */}
      <Modal visible={editingField !== null} transparent animationType="slide" onRequestClose={closeEdit}>
        <Pressable style={styles.modalOverlay} onPress={closeEdit} accessibilityLabel="Close edit dialog" accessibilityRole="button">
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()} accessibilityRole="none">
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {editingField === 'phone' ? 'Phone number' : editingField}
            </Text>
            <Text style={styles.modalSubtitle}>
              Used for account security and order updates.
            </Text>
            <AppInput
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
              keyboardType={editingField === 'phone' ? 'phone-pad' : 'default'}
              placeholder={editingField === 'phone' ? 'Enter phone number' : ''}
              containerStyle={{ marginBottom: Space.md + 2 }}
            />
            <View style={styles.modalActions}>
              <AnimatedPressable
                onPress={() => { haptic.light(); closeEdit(); }}
                style={styles.modalBtnSecondary}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => {
                  if (editingField === 'phone') setPhone(editValue);
                  closeEdit();
                }}
                style={styles.modalBtnPrimary}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBtnPrimaryText}>Save</Text>
              </AnimatedPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </FlagshipScreen>
  );
}

// ── PressableRow — compact row with icon chip for security section ──
interface PressableRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  title: string;
  subtitle?: string;
  statusPill?: React.ReactNode;
  onPress: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

function PressableRow({ icon, iconColor, title, subtitle, statusPill, onPress, isLast }: PressableRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressableRow,
        pressed && styles.pressableRowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.rowIconChip, { backgroundColor: `${iconColor}15` }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={styles.rowRight}>
        {statusPill}
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
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
  // ── Top-right Done button — visible pill ──
  saveBtn: {
    paddingHorizontal: Space.md,
    height: 34,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
  },
  saveBtnTextActive: {
    color: colors.textInverse,
  },

  // ── Identity row ──
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  identityAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  identityAvatarText: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 44,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  identityName: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  identityHandle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    letterSpacing: Type.caption.letterSpacing,
  },
  photoHint: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    paddingBottom: 0,
  },

  // ── Sections — tighter spacing ──
  sectionGroup: {
    paddingTop: Space.md,
    paddingHorizontal: Space.md,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
    marginBottom: Space.sm - 2,
  },

  // ── Fields — subtle surface, clean border ──
  fieldGroup: {
    marginBottom: Space.sm,
  },
  fieldGroupLast: {
    marginBottom: 0,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  fieldSurface: {
    borderRadius: Radius.md + 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: Space.md - 2,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  fieldSurfaceFocused: {
    borderColor: colors.brand,
    borderWidth: 1.5,
  },
  fieldSurfaceError: {
    borderColor: colors.danger,
  },
  fieldSurfaceMultiline: {
    alignItems: 'flex-end',
    paddingVertical: Space.sm,
    minHeight: 80,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  fieldInputMultiline: {
    flex: 1,
    minHeight: 56,
    lineHeight: 21,
    paddingVertical: 0,
  },
  fieldCounter: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    paddingBottom: 2,
  },
  fieldCounterError: {
    color: colors.danger,
  },
  fieldHelper: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: 5,
    lineHeight: 15,
  },
  fieldError: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: colors.danger,
    marginTop: 5,
    lineHeight: 15,
  },

  // ── Detail card (private details + security) ──
  detailCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md - 2,
    minHeight: 48,
  },
  detailRowTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md - 2,
    minHeight: 48,
  },
  detailLabel: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
  },
  detailValue: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: 180,
  },
  detailRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  detailStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: Space.md - 2,
  },

  // ── Status pills ──
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  statusPillVerified: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  statusPillUnverified: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  statusPillText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },

  // ── Pressable row (security) ──
  pressableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md - 2,
    minHeight: 52,
    gap: Space.sm,
  },
  pressableRowPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  rowIconChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },

  // ── Account control — prominent card ──
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 4,
    paddingHorizontal: Space.md - 2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    minHeight: 56,
  },
  accountIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  accountTitle: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
  },
  accountSubtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
  },

  // ── Phone edit modal — premium bottom sheet ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Space.xl,
    paddingTop: Space.sm,
    paddingHorizontal: Space.lg,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: Space.md,
  },
  modalTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    marginBottom: 2,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginBottom: Space.md + 2,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  modalBtnSecondary: {
    flex: 1,
    height: 50,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBtnPrimary: {
    flex: 1,
    height: 50,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  modalBtnSecondaryText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  modalBtnPrimaryText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: colors.textInverse,
  },
  });
}
