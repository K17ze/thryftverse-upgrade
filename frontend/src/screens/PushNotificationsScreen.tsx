import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { PUSH_NOTIFICATION_DEFINITIONS } from '../preferences/settingsPreferences';
import { useToast } from '../context/ToastContext';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { useStore } from '../store/useStore';
import { parseApiError } from '../lib/apiClient';
import { deactivateNotificationDevice, registerNotificationDevice } from '../services/notificationsApi';
import { SettingsHeader } from '../components/settings/SettingsHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import { SettingsCell } from '../components/SettingsCell';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Typography } from '../constants/typography';

type Props = StackScreenProps<RootStackParamList, 'PushNotifications'>;

const NOTIFICATIONS = PUSH_NOTIFICATION_DEFINITIONS;

export default function PushNotificationsScreen({ navigation }: Props) {
  const currentUser = useStore((state) => state.currentUser);
  const { show } = useToast();
  const {
    pushNotificationToggles: toggles,
    pushEnabledCount: enabledCount,
    pushTotalCount,
    setPushNotificationToggle,
    setAllPushNotificationToggles,
  } = useSettingsPreferences();
  const [isSyncingDevice, setIsSyncingDevice] = React.useState(false);
  const [registeredToken, setRegisteredToken] = React.useState<string | null>(null);
  const [isDeviceRegistered, setIsDeviceRegistered] = React.useState(false);

  const resolvePushPlatform = React.useCallback((): 'ios' | 'android' | 'web' => {
    if (Platform.OS === 'ios') return 'ios';
    if (Platform.OS === 'android') return 'android';
    return 'web';
  }, []);

  const resolveProjectId = React.useCallback(() => {
    const fromExpoConfig = (Constants.expoConfig as { extra?: { eas?: { projectId?: string } } } | null)
      ?.extra?.eas?.projectId;
    const fromEasConfig = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    return fromExpoConfig ?? fromEasConfig;
  }, []);

  const ensureDeviceRegistration = React.useCallback(async () => {
    if (!currentUser?.id) {
      show('Please sign in to enable push notifications.', 'error');
      return;
    }
    setIsSyncingDevice(true);
    try {
      const permission = await Notifications.getPermissionsAsync();
      let finalStatus = permission.status;
      if (finalStatus !== 'granted') {
        const request = await Notifications.requestPermissionsAsync();
        finalStatus = request.status;
      }
      if (finalStatus !== 'granted') {
        show('Push permissions were denied on this device.', 'error');
        return;
      }
      const projectId = resolveProjectId();
      const tokenResponse = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      const token = tokenResponse.data;
      await registerNotificationDevice({
        userId: currentUser.id,
        token,
        platform: resolvePushPlatform(),
        appVersion: (Constants.expoConfig as { version?: string } | null)?.version,
        metadata: { enabledNotificationTypes: enabledCount },
      });
      setRegisteredToken(token);
      setIsDeviceRegistered(true);
      show('This device is now registered for push delivery.', 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to register this device for push notifications.');
      show(parsed.message, 'error');
    } finally {
      setIsSyncingDevice(false);
    }
  }, [currentUser?.id, enabledCount, resolveProjectId, resolvePushPlatform, show]);

  const disableDeviceRegistration = React.useCallback(async () => {
    if (!registeredToken) {
      setIsDeviceRegistered(false);
      show('This device is already not registered for push delivery.', 'info');
      return;
    }
    setIsSyncingDevice(true);
    try {
      await deactivateNotificationDevice(registeredToken);
      setIsDeviceRegistered(false);
      setRegisteredToken(null);
      show('Push delivery paused for this device.', 'info');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to pause push delivery for this device.');
      show(parsed.message, 'error');
    } finally {
      setIsSyncingDevice(false);
    }
  }, [registeredToken, show]);

  const toggle = async (key: string) => {
    const nextEnabled = !toggles[key];
    setPushNotificationToggle(key, nextEnabled);
    const nextCount = nextEnabled ? enabledCount + 1 : enabledCount - 1;
    if (nextCount === 1 && nextEnabled && !isDeviceRegistered) {
      await ensureDeviceRegistration();
    }
    if (nextCount === 0 && !nextEnabled && isDeviceRegistered) {
      await disableDeviceRegistration();
    }
  };

  const handleToggleAll = React.useCallback(async () => {
    const shouldEnableAll = enabledCount !== pushTotalCount;
    setAllPushNotificationToggles(shouldEnableAll);
    if (shouldEnableAll && !isDeviceRegistered) {
      await ensureDeviceRegistration();
    }
    if (!shouldEnableAll && isDeviceRegistered) {
      await disableDeviceRegistration();
    }
    show(
      shouldEnableAll ? 'All push notifications enabled' : 'All push notifications paused',
      shouldEnableAll ? 'success' : 'info'
    );
  }, [
    disableDeviceRegistration,
    enabledCount,
    ensureDeviceRegistration,
    isDeviceRegistered,
    pushTotalCount,
    setAllPushNotificationToggles,
    show,
  ]);

  const allEnabled = enabledCount === pushTotalCount;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <SettingsHeader
        title="Push Notifications"
        onBack={() => navigation.goBack()}
        rightAction={
          <AnimatedPressable
            onPress={() => void handleToggleAll()}
            disabled={isSyncingDevice}
            accessibilityLabel={allEnabled ? 'Disable all push notifications' : 'Enable all push notifications'}
            hapticFeedback="medium"
            style={styles.iconBtn}
          >
            {isSyncingDevice ? (
              <ActivityIndicator size="small" color={Colors.textPrimary} />
            ) : (
              <Ionicons
                name={allEnabled ? 'notifications-off-outline' : 'notifications-outline'}
                size={22}
                color={Colors.textPrimary}
              />
            )}
          </AnimatedPressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Progress indicator */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(enabledCount / Math.max(pushTotalCount, 1)) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.progressLabel}>
              {enabledCount}/{pushTotalCount} enabled
            </Text>
          </View>
        </Reanimated.View>

        {/* Notification types */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
          <Text style={styles.sectionTitle}>Notification Types</Text>
          <SettingsCard>
            {NOTIFICATIONS.map((item, idx) => (
              <SettingsCell
                key={item.key}
                title={item.label}
                subtitle={item.subtitle}
                variant="toggle"
                toggleValue={toggles[item.key]}
                onToggle={() => void toggle(item.key)}
                isFirst={idx === 0}
                isLast={idx === NOTIFICATIONS.length - 1}
              />
            ))}
          </SettingsCard>
        </Reanimated.View>

        {/* Footer note */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
          <Text style={styles.footerNote}>
            You can also manage push notifications from your device Settings app.
          </Text>
        </Reanimated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  content: {
    padding: Space.md,
    paddingBottom: Space.xl,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.md,
    marginHorizontal: Space.xs,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.brand,
  },
  progressLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: Type.caption.letterSpacing,
    minWidth: 60,
    textAlign: 'right',
  },
  sectionTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginLeft: Space.xs,
    marginBottom: Space.sm,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
  },
  footerNote: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: Type.caption.lineHeight,
    marginTop: Space.sm,
    marginHorizontal: Space.xs,
    letterSpacing: Type.caption.letterSpacing,
  },
});
