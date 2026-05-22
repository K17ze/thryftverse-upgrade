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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { useToast } from '../context/ToastContext';
import { changePassword } from '../services/authApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { SettingsHeader } from '../components/settings/SettingsHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import { PasswordStrengthBar } from '../components/settings/PasswordStrengthBar';
import { Typography } from '../constants/typography';

export default function ChangePasswordScreen() {
  const navigation = useNavigation();
  const { show } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSecure, setIsSecure] = useState(true);

  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      show('Please fill in all fields', 'error');
      return;
    }
    if (newPassword.length < 8) {
      show('New password must be at least 8 characters', 'error');
      return;
    }
    if (currentPassword === newPassword) {
      show('New password must be different from current password', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      show('New passwords do not match', 'error');
      return;
    }
    setIsUpdating(true);
    try {
      await changePassword({ currentPassword, newPassword });
      show('Password updated successfully', 'success');
      navigation.goBack();
    } catch (error: any) {
      show(error.message || 'Unable to change password', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <SettingsHeader title="Change Password" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
            <Text style={styles.sectionTitle}>Security</Text>
            <SettingsCard>
              <AppInput
                label="Current Password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry={isSecure}
                placeholder="Enter current password"
                containerStyle={styles.inputSpacing}
                suffix={
                  <AnimatedPressable onPress={() => setIsSecure(!isSecure)} hitSlop={10}>
                    <Ionicons
                      name={isSecure ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={Colors.textSecondary}
                    />
                  </AnimatedPressable>
                }
              />

              <AppInput
                label="New Password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={isSecure}
                placeholder="Enter new password"
                containerStyle={styles.inputSpacing}
              />
              <PasswordStrengthBar password={newPassword} />

              <AppInput
                label="Confirm New Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={isSecure}
                placeholder="Re-enter new password"
                containerStyle={styles.inputSpacing}
              />
            </SettingsCard>
          </Reanimated.View>

          <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
            <AppButton
              title="Update Password"
              onPress={handleUpdate}
              variant="primary"
              size="md"
              style={styles.updateBtn}
              disabled={isUpdating}
              accessibilityLabel="Update password"
            />
          </Reanimated.View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  sectionTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
    marginLeft: Space.xs,
    marginBottom: Space.sm,
  },
  inputSpacing: {
    marginBottom: Space.sm,
  },
  updateBtn: {
    marginTop: Space.lg,
    borderRadius: Radius.xl,
  },
});
