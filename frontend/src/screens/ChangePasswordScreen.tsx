import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { useToast } from '../context/ToastContext';
import { changePassword } from '../services/authApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import { PasswordStrengthBar } from '../components/settings/PasswordStrengthBar';
import { Typography } from '../theme/designTokens';

export default function ChangePasswordScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
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

      <ScreenHeader title="Change Password" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
            <Text style={styles.sectionTitle}>Security</Text>
            <SettingsCard>
              <Text style={styles.infoText}>Enter your current password to confirm your identity.</Text>
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
              <View style={{ marginTop: Space.xs }}>
                <PasswordStrengthBar password={newPassword} />
              </View>

              <AppInput
                label="Confirm New Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={isSecure}
                placeholder="Re-enter new password"
                containerStyle={styles.inputSpacing}
              />
              <TouchableOpacity
                onPress={() => navigation.navigate('ForgotPassword')}
                activeOpacity={0.7}
                style={styles.forgotPasswordLink}
              >
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>
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
  infoText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginBottom: Space.sm,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
  forgotPasswordLink: {
    marginTop: Space.sm,
    alignItems: 'center',
  },
  forgotPasswordText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.brand,
    letterSpacing: Type.body.letterSpacing,
  },
});
