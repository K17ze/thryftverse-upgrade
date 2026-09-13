import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { FlatRow } from '../ui/FlatRow';
import { Space } from '../../theme/designTokens';

type NavT = NativeStackNavigationProp<RootStackParamList>;

/** Compact identity row at the top of Settings — avatar + display name +
 *  handle/email, taps through to EditProfile. */
export function SettingsIdentityRow() {
  const navigation = useNavigation<NavT>();
  const { colors } = useAppTheme();
  const { t: ts } = useAppTranslation('settings');
  const currentUser = useStore((state) => state.currentUser);

  const avatarUri = currentUser?.avatar || null;
  const displayName = currentUser?.displayName ?? currentUser?.username ?? 'Not signed in';
  const username = currentUser?.username ?? '';

  return (
    <FlatRow
      label={displayName}
      labelStyle={{ color: colors.textPrimary }}
      secondary={username ? `@${username}${currentUser?.email ? ` · ${currentUser.email}` : ''}` : (currentUser?.email ?? 'Not signed in')}
      imageUri={avatarUri ?? undefined}
      imageSize={48}
      imageRadius={24}
      onPress={() => navigation.navigate('EditProfile', {})}
      separator={false}
      accessibilityLabel={ts('accessibility.editProfileAccount')}
      accessibilityHint={ts('accessibility.editProfileAccountHint')}
      style={{ paddingVertical: Space.sm }}
    />
  );
}
