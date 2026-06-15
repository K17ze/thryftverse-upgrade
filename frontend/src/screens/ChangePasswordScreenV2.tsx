import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { Space, Type } from '../theme/designTokens';
import { useToast } from '../context/ToastContext';
import { changePassword } from '../services/authApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { PremiumTextField } from '../components/ui/PremiumTextField';
import { PasswordStrengthBar } from '../components/settings/PasswordStrengthBar';
import { Typography } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader, FlagshipStickyFooter, FlagshipFormSection } from '../components/flagship';

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
    <FlagshipScreen
      header={<FlagshipHeader title="Change Password" subtitle="Update your security" onBack={() => navigation.goBack()} />}
      keyboardAvoiding
      stickyFooter={
        <FlagshipStickyFooter
          actions={[
            {
              label: isUpdating ? 'Updating…' : 'Update Password',
              onPress: handleUpdate,
              variant: 'primary',
              disabled: isUpdating,
              loading: isUpdating,
            },
          ]}
        />
      }
    >
      <FlagshipFormSection title="Security" description="Enter your current password to confirm your identity.">
        <PremiumTextField
          label="Current Password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry={isSecure}
          placeholder="Enter current password"
          rightAction={eyeIcon}
        />
        <PremiumTextField
          label="New Password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry={isSecure}
          placeholder="Enter new password"
        />
        <View style={{ marginTop: Space.xs, marginBottom: Space.sm }}>
          <PasswordStrengthBar password={newPassword} />
        </View>
        <PremiumTextField
          label="Confirm New Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={isSecure}
          placeholder="Re-enter new password"
        />
        <TouchableOpacity
          onPress={() => navigation.navigate('ForgotPassword')}
          activeOpacity={0.7}
          style={styles.forgotPasswordLink}
        >
          <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
        </TouchableOpacity>
      </FlagshipFormSection>
    </FlagshipScreen>
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
