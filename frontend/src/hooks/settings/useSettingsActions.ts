import React from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { t } from '../../i18n';
import { logoutFromSession } from '../../services/authApi';
import { clearUserScopedQueryCache } from '../../platform/server';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface UseSettingsActionsResult {
  /** Sign-out flow: server logout → query cache wipe → store logout → auth landing. */
  handleLogout: () => Promise<void>;
  handleClearSearchHistory: () => Promise<void>;
  handleOpenExternal: (url: string) => Promise<void>;
}

/**
 * Sign-out, clear-search-history, and open-external-link actions for the
 * Settings screen.
 */
export function useSettingsActions(): UseSettingsActionsResult {
  const navigation = useNavigation<NavT>();
  const logout = useStore((state) => state.logout);
  const { show } = useToast();
  const { t: ts } = useAppTranslation('settings');

  const handleLogout = React.useCallback(async () => {
    await logoutFromSession();
    clearUserScopedQueryCache();
    logout();
    navigation.replace('AuthLanding');
  }, [logout, navigation]);

  const handleClearSearchHistory = React.useCallback(async () => {
    try {
      await AsyncStorage.removeItem('@thryftverse_recent_searches');
      show(ts('toast.searchHistoryCleared'), 'success');
    } catch {
      show(ts('toast.searchHistoryClearFailed'), 'error');
    }
  }, [show, ts]);

  const handleOpenExternal = React.useCallback(
    async (url: string) => {
      try {
        await Linking.openURL(url);
      } catch {
        show(t('settings.toast.unableOpenLink'), 'error');
      }
    },
    [show]
  );

  return {
    handleLogout,
    handleClearSearchHistory,
    handleOpenExternal,
  };
}
