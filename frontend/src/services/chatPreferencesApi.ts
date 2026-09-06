import { fetchJson } from '../lib/apiClient';

export const CHAT_THEMES = ['Default', 'Emerald', 'Midnight', 'Sunset', 'Lavender', 'Cobalt'] as const;
export type ChatTheme = (typeof CHAT_THEMES)[number];
export type ChatPreferences = { theme: ChatTheme };

function readPreferences(response: { ok: boolean; preferences?: ChatPreferences }): ChatPreferences {
  if (!response.ok || !response.preferences || !CHAT_THEMES.includes(response.preferences.theme)) {
    throw new Error('Chat preferences could not be confirmed.');
  }
  return response.preferences;
}

export async function fetchChatPreferences(conversationId: string, signal?: AbortSignal) {
  return readPreferences(await fetchJson<{ ok: boolean; preferences: ChatPreferences }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/preferences`, { signal },
  ));
}

export async function saveChatTheme(conversationId: string, theme: ChatTheme) {
  return readPreferences(await fetchJson<{ ok: boolean; preferences: ChatPreferences }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/preferences`,
    { method: 'PUT', body: JSON.stringify({ theme }) },
    { maxRetries: 0 },
  ));
}

// Restrained canvas tints preserve message contrast in both application themes.
const backgrounds: Record<Exclude<ChatTheme, 'Default'>, { light: string; dark: string }> = {
  Emerald: { light: '#F0F7F3', dark: '#111C17' },
  Midnight: { light: '#EDF1F7', dark: '#111722' },
  Sunset: { light: '#FCF2EB', dark: '#241912' },
  Lavender: { light: '#F5F0FA', dark: '#1D1626' },
  Cobalt: { light: '#EFF4FD', dark: '#121C2C' },
};

export function chatThemeBackground(theme: ChatTheme | undefined, isDark: boolean, fallback: string) {
  return !theme || theme === 'Default' ? fallback : backgrounds[theme][isDark ? 'dark' : 'light'];
}
