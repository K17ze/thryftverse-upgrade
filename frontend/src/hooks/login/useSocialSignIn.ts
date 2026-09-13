import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import { loginWithAppleIdentityToken, loginWithGoogleIdToken } from '../../services/authApi';
import {
  hasGoogleOAuthConfig,
  type LoginAuthSuccessHandler,
} from '../../components/login/loginViewModels';

export interface SocialSignInParams {
  isSubmitting: boolean;
  setErrorMsg: (message: string) => void;
  onAuthSuccess: LoginAuthSuccessHandler;
}

/**
 * Social sign-in domain for the login screen — Google id-token request,
 * the response effect that completes the OAuth round-trip, Apple
 * authentication, and the shared socialLoading flag. Auth success routes
 * through the screen's onAuthSuccess so login/track/navigation ordering is
 * owned by the orchestrator.
 */
export function useSocialSignIn({ isSubmitting, setErrorMsg, onAuthSuccess }: SocialSignInParams) {
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const hasGoogleOAuth = hasGoogleOAuthConfig();

  const [googleRequest, googleResponse, promptGoogleAuth] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || 'dev-client-id-placeholder',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID || 'dev-android-client-id-placeholder',
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID });

  // Handle Google OAuth response for login
  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== 'success') {
      setSocialLoading(null);
      return;
    }
    const idToken = googleResponse.authentication?.idToken
      ?? (typeof googleResponse.params?.id_token === 'string' ? googleResponse.params.id_token : null);
    if (!idToken) {
      setSocialLoading(null);
      setErrorMsg('Google sign-in failed: Unable to get identity token.');
      return;
    }
    void (async () => {
      try {
        const result = await loginWithGoogleIdToken(idToken);
        onAuthSuccess(result, 'google', 'login_complete_google');
      } catch (error) {
        setErrorMsg(`Google sign-in failed: ${(error as Error).message}`);
      } finally {
        setSocialLoading(null);
      }
    })();
  }, [googleResponse, onAuthSuccess, setErrorMsg]);

  const handleGoogleSignIn = async () => {
    if (socialLoading || isSubmitting) return;
    if (!googleRequest) {
      setErrorMsg('Google sign-in unavailable. Configure Google OAuth client IDs.');
      return;
    }
    setSocialLoading('google');
    setErrorMsg('');
    try {
      const response = await promptGoogleAuth();
      if (response.type !== 'success') setSocialLoading(null);
    } catch (error) {
      setSocialLoading(null);
      setErrorMsg(`Google sign-in failed: ${(error as Error).message}`);
    }
  };

  const handleAppleSignIn = async () => {
    if (socialLoading || isSubmitting) return;
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      setErrorMsg('Apple sign-in is only available on supported iOS devices.');
      return;
    }
    setSocialLoading('apple');
    setErrorMsg('');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ] });
      if (!credential.identityToken) throw new Error('Missing Apple identity token');
      const result = await loginWithAppleIdentityToken(credential.identityToken);
      onAuthSuccess(result, 'apple', 'login_complete_apple');
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        setErrorMsg(`Apple sign-in failed: ${(error as Error).message}`);
      }
    } finally {
      setSocialLoading(null);
    }
  };

  return { socialLoading, hasGoogleOAuth, handleGoogleSignIn, handleAppleSignIn };
}
