import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlagshipHeader, FlagshipScreen } from '../components/flagship';
import { AppIcon } from '../components/common/AppIcon';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { RootStackParamList } from '../navigation/types';
import {
  fetchGroupSettingsFromApi,
  updateGroupSettingsOnApi,
  type GroupPermissionScope,
  type GroupSettings,
  type GroupSettingsCapabilities,
} from '../services/chatApi';
import { Control, Radius, Space, Stroke, TypeStyles } from '../theme/designTokens';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupPermissions'>;
type EditablePermission = 'editGroupInfo' | 'sendMessages' | 'addMembers';

const PERMISSIONS: Array<{
  key: EditablePermission;
  title: string;
  description: string;
}> = [
  {
    key: 'editGroupInfo',
    title: 'Edit group info',
    description: 'Change the name, description, group photo and cover.',
  },
  {
    key: 'sendMessages',
    title: 'Send messages',
    description: 'Choose whether the group is collaborative or announcement-only.',
  },
  {
    key: 'addMembers',
    title: 'Add and invite members',
    description: 'Add people directly or create a group invite link.',
  },
];

const FALLBACK_SETTINGS: GroupSettings = {
  editGroupInfo: 'admins',
  sendMessages: 'everyone',
  addMembers: 'admins',
  updatedBy: null,
  updatedAt: null,
};

export default function GroupPermissionsScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const requestSequence = useRef(0);
  const [settings, setSettings] = useState<GroupSettings>(FALLBACK_SETTINGS);
  const [capabilities, setCapabilities] = useState<GroupSettingsCapabilities | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pendingKey, setPendingKey] = useState<EditablePermission | null>(null);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setState('loading');
    try {
      const snapshot = await fetchGroupSettingsFromApi(conversationId);
      if (sequence !== requestSequence.current) return;
      setSettings(snapshot.settings);
      setCapabilities(snapshot.capabilities);
      setState('ready');
    } catch {
      if (sequence !== requestSequence.current) return;
      setState('error');
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  const updatePermission = useCallback(async (
    key: EditablePermission,
    value: GroupPermissionScope,
  ) => {
    if (!capabilities?.canManage || pendingKey || settings[key] === value) return;
    const previous = settings;
    haptic.selection();
    setPendingKey(key);
    setSettings((current) => ({ ...current, [key]: value }));
    try {
      const confirmed = await updateGroupSettingsOnApi(conversationId, { [key]: value });
      setSettings(confirmed);
      haptic.success();
    } catch {
      // A PATCH can finish even when its response is lost. Reconcile with the
      // server before reverting so the UI never lies about group authority.
      try {
        const reconciled = await fetchGroupSettingsFromApi(conversationId);
        setSettings(reconciled.settings);
        setCapabilities(reconciled.capabilities);
        if (reconciled.settings[key] === value) {
          show('Permission updated', 'success');
        } else {
          show('Could not update this permission', 'error');
        }
      } catch {
        setSettings(previous);
        show('Could not confirm the change. Check your connection and try again.', 'error');
      }
    } finally {
      setPendingKey(null);
    }
  }, [capabilities?.canManage, conversationId, haptic, pendingKey, settings, show]);

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Group permissions" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
    >
      {state === 'loading' ? (
        <View style={styles.centerState} accessibilityLabel="Loading group permissions">
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      ) : state === 'error' ? (
        <View style={styles.centerState}>
          <AppIcon name="offline" size="lg" color="textMuted" accessible={false} />
          <Text style={styles.stateTitle}>Permissions unavailable</Text>
          <Text style={styles.stateCopy}>Check your connection, then try again.</Text>
          <Pressable
            onPress={() => void load()}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading group permissions"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.intro}>
            <Text style={styles.introTitle}>Choose who can do what</Text>
            <Text style={styles.introCopy}>
              Owners and admins always keep access. Changes apply to every member and device.
            </Text>
          </View>

          <View style={styles.permissionList}>
            {PERMISSIONS.map((permission, index) => (
              <View
                key={permission.key}
                style={[styles.permissionBlock, index > 0 && styles.permissionDivider]}
              >
                <View style={styles.permissionHeading}>
                  <View style={styles.permissionCopy}>
                    <Text style={styles.permissionTitle}>{permission.title}</Text>
                    <Text style={styles.permissionDescription}>{permission.description}</Text>
                  </View>
                  {pendingKey === permission.key ? (
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  ) : null}
                </View>

                <View style={styles.scopeControl} accessibilityRole="radiogroup">
                  {(['everyone', 'admins'] as const).map((scope) => {
                    const selected = settings[permission.key] === scope;
                    const disabled = !capabilities?.canManage || pendingKey !== null;
                    return (
                      <Pressable
                        key={scope}
                        onPress={() => void updatePermission(permission.key, scope)}
                        disabled={disabled}
                        style={({ pressed }) => [
                          styles.scopeOption,
                          selected && styles.scopeOptionSelected,
                          pressed && !disabled && styles.pressed,
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, disabled }}
                        accessibilityLabel={`${permission.title}: ${scope === 'everyone' ? 'Everyone' : 'Admins only'}`}
                      >
                        <Text style={[styles.scopeLabel, selected && styles.scopeLabelSelected]}>
                          {scope === 'everyone' ? 'Everyone' : 'Admins only'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          {!capabilities?.canManage ? (
            <Text style={styles.readOnlyCopy}>Only an owner or admin can change these permissions.</Text>
          ) : null}
        </ScrollView>
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: Space.lg,
      paddingTop: Space.md,
      paddingBottom: Space.xxl,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.xl,
    },
    stateTitle: {
      ...TypeStyles.heading,
      color: colors.textPrimary,
      marginTop: Space.xs,
    },
    stateCopy: {
      ...TypeStyles.body,
      color: colors.textMuted,
      textAlign: 'center',
    },
    retryButton: {
      minHeight: Control.hit,
      justifyContent: 'center',
      paddingHorizontal: Space.lg,
      marginTop: Space.sm,
    },
    retryText: {
      ...TypeStyles.bodyStrong,
      color: colors.textPrimary,
    },
    intro: {
      paddingBottom: Space.xl,
    },
    introTitle: {
      ...TypeStyles.title,
      color: colors.textPrimary,
      fontFamily: TypeStyles.title.fontFamily,
    },
    introCopy: {
      ...TypeStyles.body,
      color: colors.textSecondary,
      marginTop: Space.sm,
      maxWidth: 520,
    },
    permissionList: {
      borderTopWidth: Stroke.hairline,
      borderBottomWidth: Stroke.hairline,
      borderColor: colors.borderSubtle,
    },
    permissionBlock: {
      paddingVertical: Space.lg,
    },
    permissionDivider: {
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.borderSubtle,
    },
    permissionHeading: {
      minHeight: Control.hit,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.md,
    },
    permissionCopy: {
      flex: 1,
    },
    permissionTitle: {
      ...TypeStyles.bodyStrong,
      color: colors.textPrimary,
    },
    permissionDescription: {
      ...TypeStyles.metadata,
      color: colors.textMuted,
      marginTop: Space.xs,
      maxWidth: 560,
    },
    scopeControl: {
      flexDirection: 'row',
      padding: 3,
      marginTop: Space.md,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      gap: 3,
    },
    scopeOption: {
      minHeight: Control.hit,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.sm,
    },
    scopeOptionSelected: {
      backgroundColor: colors.surface,
      borderWidth: Stroke.hairline,
      borderColor: colors.border,
    },
    scopeLabel: {
      ...TypeStyles.bodyStrong,
      color: colors.textMuted,
    },
    scopeLabelSelected: {
      color: colors.textPrimary,
    },
    readOnlyCopy: {
      ...TypeStyles.metadata,
      color: colors.textMuted,
      marginTop: Space.lg,
    },
    pressed: {
      opacity: 0.68,
    },
  });
}
