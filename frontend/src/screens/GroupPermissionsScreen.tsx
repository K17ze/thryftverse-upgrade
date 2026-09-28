import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlagshipHeader, FlagshipScreen, FlagshipState } from '../components/flagship';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { RootStackParamList } from '../navigation/types';
import {
  fetchGroupSettingsFromApi,
  updateGroupSettingsOnApi,
  type GroupPermissionScope,
  type GroupSettings,
  type GroupSettingsCapabilities,
} from '../services/chatApi';
import { Control, Radius, Space, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Ionicons } from '@expo/vector-icons';

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
    description: 'Change the name, description and group photo.',
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

export default function GroupPermissionsScreen({ navigation, route }: Props) {
  const { conversationId } = route.params ?? {};
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const requestSequence = useRef(0);
  // §37.5 fail-closed: settings start as null and render only from the
  // server row. No client-side fallback defaults that could contradict
  // actual group authority.
  const [settings, setSettings] = useState<GroupSettings | null>(null);
  const [capabilities, setCapabilities] = useState<GroupSettingsCapabilities | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pendingKey, setPendingKey] = useState<EditablePermission | null>(null);
  const [expandedKey, setExpandedKey] = useState<EditablePermission | null>(null);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setPendingKey(null);
    setExpandedKey(null);
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
    if (!settings || !capabilities?.canManage || pendingKey || isOffline || settings[key] === value) return;
    const sequence = ++requestSequence.current;
    haptic.selection();
    setPendingKey(key);
    setSettings((current) => current ? { ...current, [key]: value } : null);
    try {
      const confirmed = await updateGroupSettingsOnApi(conversationId, { [key]: value });
      if (sequence !== requestSequence.current) return;
      setSettings(confirmed);
      setExpandedKey(null);
      haptic.success();
    } catch {
      if (sequence !== requestSequence.current) return;
      // A PATCH can finish even when its response is lost. Reconcile with the
      // server before reverting so the UI never lies about group authority.
      try {
        const reconciled = await fetchGroupSettingsFromApi(conversationId);
        if (sequence !== requestSequence.current) return;
        setSettings(reconciled.settings);
        setCapabilities(reconciled.capabilities);
        if (reconciled.settings[key] === value) {
          show('Permission updated', 'success');
        } else {
          show('Could not update this permission', 'error');
        }
      } catch {
        if (sequence !== requestSequence.current) return;
        setState('error');
        show('Could not confirm the change. Check your connection and try again.', 'error');
      }
    } finally {
      if (sequence === requestSequence.current) setPendingKey(null);
    }
  }, [settings, capabilities?.canManage, conversationId, haptic, pendingKey, show, isOffline]);

  // Intro doubles as the read-only explainer: the reason changes are
  // unavailable sits directly above the first affected control, not below
  // the full list. Offline and authority-denied read differently — they
  // are different problems with different remedies.
  const introBlock = (
    <View style={styles.intro}>
      <Text style={styles.introCopy}>
        Owners and admins retain access. Changes apply to the whole group.
      </Text>
      {capabilities && !capabilities.canManage ? (
        <Text style={styles.introCopy}>
          You can review these settings, but only an owner or admin can change them.
        </Text>
      ) : null}
      {isOffline ? (
        <Text style={styles.introCopy}>
          Offline — reconnect to change permissions.
        </Text>
      ) : null}
    </View>
  );

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Group permissions" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
    >
      {state === 'loading' ? (
        // Three skeleton rows matching the loaded geometry — hairline-
        // separated label rows with a trailing chevron slot, no card stack.
        <View
          style={styles.content}
          accessible
          accessibilityLabel="Loading group permissions"
        >
          {introBlock}
          <View style={styles.permissionList} testID="group-permissions-skeleton">
            {PERMISSIONS.map((permission, index) => (
              <View
                key={permission.key}
                style={[styles.permissionBlock, index > 0 && styles.permissionDivider]}
              >
                <View style={styles.permissionHeading}>
                  <View style={styles.permissionCopy}>
                    <SkeletonLoader
                      width="55%"
                      height={TypographyV2.bodyStrong.lineHeight}
                      borderRadius={Radius.sm}
                    />
                    <SkeletonLoader
                      width="32%"
                      height={TypographyV2.meta.lineHeight}
                      borderRadius={Radius.sm}
                      style={styles.skeletonMeta}
                    />
                  </View>
                  <SkeletonLoader width={20} height={20} borderRadius={Radius.full} />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : state === 'error' ? (
        <FlagshipState
          variant={isOffline ? 'offline' : 'error'}
          title="Permissions unavailable"
          subtitle={
            isOffline
              ? 'You are offline. Reconnect to view and change group permissions.'
              : 'Check your connection, then try again.'
          }
          actionLabel="Retry"
          onAction={() => void load()}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {introBlock}

          <View style={styles.permissionList}>
            {PERMISSIONS.map((permission, index) => (
              <View
                key={permission.key}
                style={[styles.permissionBlock, index > 0 && styles.permissionDivider]}
              >
                <Pressable
                  style={({ pressed }) => [styles.permissionHeading, pressed && styles.pressed]}
                  onPress={() => setExpandedKey(expandedKey === permission.key ? null : permission.key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: expandedKey === permission.key }}
                  accessibilityLabel={`${permission.title}, ${settings?.[permission.key] === 'everyone' ? 'Everyone' : 'Admins only'}`}
                >
                  <View style={styles.permissionCopy}>
                    <Text style={styles.permissionTitle}>{permission.title}</Text>
                    <Text style={styles.permissionDescription}>{settings?.[permission.key] === 'everyone' ? 'Everyone' : 'Admins only'}</Text>
                  </View>
                  {pendingKey === permission.key ? (
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  ) : <Ionicons name={expandedKey === permission.key ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />}
                </Pressable>

                {expandedKey === permission.key ? <>
                <Text style={styles.permissionDescription}>{permission.description}</Text>
                <View style={styles.scopeControl} accessibilityRole="radiogroup">
                  {(['everyone', 'admins'] as const).map((scope) => {
                    const selected = settings?.[permission.key] === scope;
                    const disabled = !capabilities?.canManage || pendingKey !== null || isOffline;
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
                        accessibilityState={{ checked: selected, disabled }}
                        accessibilityLabel={`${permission.title}: ${scope === 'everyone' ? 'Everyone' : 'Admins only'}`}
                      >
                        <Text style={[styles.scopeLabel, selected && styles.scopeLabelSelected]}>
                          {scope === 'everyone' ? 'Everyone' : 'Admins only'}
                        </Text>
                        {selected ? <Ionicons name="checkmark" size={20} color={colors.textPrimary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
                </> : null}
              </View>
            ))}
          </View>
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
    skeletonMeta: {
      marginTop: Space.xs,
    },
    intro: {
      paddingBottom: Space.xl,
    },
    introCopy: {
      fontFamily: TypographyV2.body.fontFamily,
      fontSize: TypographyV2.body.size,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
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
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontSize: TypographyV2.bodyStrong.size,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textPrimary,
    },
    permissionDescription: {
      fontFamily: TypographyV2.meta.fontFamily,
      fontSize: TypographyV2.meta.size,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textMuted,
      marginTop: Space.xs,
      maxWidth: 560,
    },
    scopeControl: {
      flexDirection: 'column',
      marginTop: Space.md,
    },
    scopeOption: {
      minHeight: Control.hit,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      paddingHorizontal: Space.sm,
    },
    scopeOptionSelected: {
      backgroundColor: colors.surfaceAlt,
    },
    scopeLabel: {
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontSize: TypographyV2.bodyStrong.size,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textMuted,
    },
    scopeLabelSelected: {
      color: colors.textPrimary,
    },
    pressed: {
      opacity: 0.68,
    },
  });
}
