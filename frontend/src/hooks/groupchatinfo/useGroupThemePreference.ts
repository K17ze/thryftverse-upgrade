/**
 * useGroupThemePreference — chat-theme preference state for the group
 * details screen: the persisted query data (which drives the picker
 * selection), the theme sheet visibility, the save flow with a re-entrancy
 * guard and the inline retry-able error copy.
 * Extracted verbatim from GroupChatInfoScreen.
 */

import { useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { useChatPreferences } from '../useChatPreferences';
import type { ChatTheme } from '../../services/chatPreferencesApi';

export function useGroupThemePreference(conversationId: string) {
  const { show } = useToast();
  const preferences = useChatPreferences(conversationId);
  const [themeSaveError, setThemeSaveError] = useState<string | null>(null);
  const [isThemeSheetVisible, setIsThemeSheetVisible] = useState(false);
  const themePending = useRef(false);

  // Drive the picker selection from the persisted query data, not local state.
  const selectedTheme = preferences.query.data?.theme ?? 'Default';

  const selectTheme = async (theme: ChatTheme) => {
    if (themePending.current) return;
    themePending.current = true;
    setThemeSaveError(null);
    try {
      await preferences.mutation.mutateAsync(theme);
      setIsThemeSheetVisible(false);
      show('Chat theme saved', 'success');
    } catch {
      setThemeSaveError('Could not confirm the change. Check the saved theme or select it again to retry.');
    } finally {
      themePending.current = false;
    }
  };

  return {
    preferences,
    selectedTheme,
    themeSaveError,
    isThemeSheetVisible,
    setIsThemeSheetVisible,
    selectTheme,
  };
}
