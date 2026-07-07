import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { Typography } from '../theme/designTokens';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { parseApiError } from '../lib/apiClient';
import { updateUserProfile as updateUserProfileApi } from '../services/accountApi';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { FlagshipScreen, FlagshipHeader, FlagshipStickyFooter } from '../components/flagship';

const VERIFIED_LABEL = 'Verified';
const UNVERIFIED_LABEL = 'Not verified';

export default function AccountSettingsScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const twoFactorEnabled = useStore((state) => state.twoFactorEnabled);
  const updateUserProfile = useStore((state) => state.updateUserProfile);
  const { show } = useToast();
  const haptic = useHaptic();

  const user = currentUser;
  const userAny = user as any;
  const [phone, setPhone] = useState(userAny?.phone ?? '');

  const [isSaving, setIsSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const hasPhoneChanged = phone !== (userAny?.phone ?? '');

  const handleSaveChanges = async () => {
    if (isSaving || !hasPhoneChanged) return;
    const previousPhone = phone;

    updateUserProfile({ phone });
    setIsSaving(true);

    try {
      await updateUserProfileApi({ phone });
      show('Phone number saved', 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to save phone number.');
      show(parsed.message, 'error');
      setPhone(previousPhone);
      updateUserProfile({ phone: previousPhone });
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = (field: string, current: string) => {
    setEditingField(field);
    setEditValue(current);
  };

  const closeEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const saveEdit = () => {
    if (editingField === 'phone') setPhone(editValue);
    closeEdit();
    void handleSaveChanges();
  };

  const displayName = userAny?.displayName ?? user?.username ?? '—';
  const username = user?.username ?? '—';
  const email = userAny?.email ?? '';
  const emailVerified = !!user?.emailVerified;
  const country = (userAny?.country as string) || '';

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Private details" subtitle="Account information" onBack={() => navigation.goBack()} />}
      stickyFooter={
        hasPhoneChanged ? (
          <FlagshipStickyFooter
            actions={[
              {
                label: isSaving ? 'Saving…' : 'Save changes',
                onPress: () => void handleSaveChanges(),
                variant: 'primary',
                disabled: isSaving,
                loading: isSaving,
              },
            ]}
          />
        ) : undefined
      }
    >
      {/* ── Identity summary — compact, routes to public profile editor ── */}
      <View style={[styles.identitySurface, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <View style={styles.identityRow}>
          {user?.avatar ? (
            <View style={styles.identityAvatar}>
              <CachedImage uri={user.avatar} style={styles.identityAvatarImage} contentFit="cover" />
            </View>
          ) : (
            <View style={[styles.identityAvatarFallback, { backgroundColor: Colors.surfaceAlt }]}>
              <Text style={styles.identityAvatarText}>{(user?.username ?? '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.identityText}>
            <Text style={styles.identityName}>{displayName}</Text>
            <Text style={[styles.identityMeta, { color: Colors.textMuted }]}>@{username}</Text>
          </View>
          <AnimatedPressable
            onPress={() => (navigation as any).navigate('EditProfile')}
            scaleValue={0.92}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Edit public profile"
            style={styles.identityEditBtn}
          >
            <Text style={[styles.identityEdit, { color: Colors.brand }]}>Edit</Text>
          </AnimatedPressable>
        </View>
      </View>

      {/* ── Private contact — editable here ── */}
      <SettingsSection title="Private contact" description="Used for account security and order updates.">
        <SettingsRow
          title="Email"
          value={email || '—'}
          isFirst
        />
        <SettingsRow
          title="Email status"
          value={emailVerified ? VERIFIED_LABEL : UNVERIFIED_LABEL}
        />
        <SettingsRow
          title="Phone"
          value={phone || '—'}
          onPress={() => openEdit('phone', phone)}
          isLast
        />
      </SettingsSection>

      {/* ── Personal information — read-only ── */}
      <SettingsSection title="Personal information">
        <SettingsRow
          title="Country or region"
          value={country || '—'}
          isFirst
          isLast
        />
      </SettingsSection>

      {/* ── Security — prominent, trust-centre feel ── */}
      <SettingsSection title="Security">
        <SettingsRow
          title="Password"
          value="••••••••"
          icon="lock-closed-outline"
          onPress={() => navigation.navigate('ChangePassword')}
          isFirst
        />
        <SettingsRow
          title="Two-factor authentication"
          value={twoFactorEnabled ? 'Enabled' : 'Off'}
          icon="shield-checkmark-outline"
          iconColor={twoFactorEnabled ? Colors.success : Colors.textMuted}
          onPress={() => navigation.navigate('TwoFactorSetup')}
          isLast
        />
      </SettingsSection>

      {/* ── Account control — sober navigation, bottom-padded for visibility ── */}
      <SettingsSection title="Account" style={{ marginBottom: Math.max(insets.bottom, Space.md) + Space.lg }}>
        <SettingsRow
          title="Account control"
          subtitle="Download data, delete account"
          icon="warning-outline"
          iconColor={Colors.danger}
          danger
          onPress={() => (navigation as any).navigate('AccountControl')}
          isFirst
          isLast
        />
      </SettingsSection>

      {/* ── Inline Edit Modal ── */}
      <Modal visible={editingField !== null} transparent animationType="slide" onRequestClose={closeEdit}>
        <View style={styles.editModalOverlay}>
          <View style={[styles.editModalCard, { backgroundColor: Colors.surface }]}>
            <Text style={styles.editModalTitle}>
              Edit {editingField === 'phone' ? 'phone number' : editingField}
            </Text>
            <AppInput
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
              keyboardType={editingField === 'phone' ? 'phone-pad' : 'default'}
              containerStyle={{ marginBottom: Space.md }}
            />
            <View style={styles.editModalActions}>
              <AnimatedPressable onPress={() => { haptic.light(); closeEdit(); }} style={styles.editModalBtn} activeOpacity={0.8}>
                <Text style={styles.editModalBtnText}>Cancel</Text>
              </AnimatedPressable>
              <AnimatedPressable onPress={() => { haptic.medium(); saveEdit(); }} style={[styles.editModalBtn, styles.editModalBtnPrimary]} activeOpacity={0.8}>
                <Text style={[styles.editModalBtnText, styles.editModalBtnPrimaryText]}>Save</Text>
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>

    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  // ── Identity surface ── compact
  identitySurface: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    marginBottom: Space.md,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  identityAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  identityAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  identityAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityAvatarText: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  identityName: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  identityMeta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  identityEditBtn: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityEdit: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  // ── Edit modal ──
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  editModalCard: {
    padding: Space.lg,
    borderRadius: Radius.xl,
  },
  editModalTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.md,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  editModalActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  editModalBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  editModalBtnPrimary: {
    backgroundColor: Colors.brand,
  },
  editModalBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  editModalBtnPrimaryText: {
    color: Colors.textInverse,
  },
});
