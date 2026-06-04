import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { useToast } from '../context/ToastContext';
import { changePassword } from '../services/authApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { PasswordStrengthBar } from '../components/settings/PasswordStrengthBar';
import { Typography } from '../constants/typography';
import { SettingsPage } from '../components/settings/SettingsPage';
import { SettingsSection } from '../components/settings/SettingsSection';

export default function ChangePasswordScreenV2() {
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

  const eyeIcon = (
    <AnimatedPressable onPress={() => setIsSecure(!isSecure)} hitSlop={10}>
      <Ionicons
        name={isSecure ? 'eye-off-outline' : 'eye-outline'}
        size={20}
        color={Colors.textSecondary}
      />
    </AnimatedPressable>
  );

  return (
    <SettingsPage title="Change Password" onBack={() => navigation.goBack()}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <SettingsSection title="Security">
            <Text style={styles.infoText}>Enter your current password to confirm your identity.</Text>
            <AppInput
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={isSecure}
              placeholder="Enter current password"
              containerStyle={styles.inputSpacing}
              suffix={eyeIcon}
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
          </SettingsSection>
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.duration(300).delay(80)} style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <AppButton
            title="Update Password"
            onPress={handleUpdate}
            variant="primary"
            size="md"
            style={{ borderRadius: Radius.xl }}
            disabled={isUpdating}
            accessibilityLabel="Update password"
          />
        </Reanimated.View>
      </KeyboardAvoidingView>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  infoText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginBottom: Space.sm,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
    paddingHorizontal: 16,
  },
  inputSpacing: {
    marginBottom: Space.sm,
    paddingHorizontal: 16,
  },
  forgotPasswordLink: {
    marginTop: Space.sm,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  forgotPasswordText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.brand,
    letterSpacing: Type.body.letterSpacing,
  },
});
