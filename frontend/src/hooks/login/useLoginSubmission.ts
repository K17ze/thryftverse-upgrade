import {
  loginWithPassword,
  requestEmailOtp,
  requestMagicLink,
  verifyEmailOtp,
  type LoginWithPasswordError,
  type OtpVerificationError,
} from '../../services/authApi';
import {
  formatOtpErrorMessage,
  isOtpTwoFactorRequired,
  isTwoFactorChallengeError,
  magicLinkInfoMessage,
  normalizeEmail,
  otpRequestInfoMessage,
  validateEmailForMagicLink,
  validateEmailForOtp,
  validateOtpCode,
  validateOtpTwoFactorInput,
  validatePasswordLogin,
  type LoginAuthSuccessHandler,
} from '../../components/login/loginViewModels';
import type { LoginFormState } from './useLoginFormState';

export interface LoginSubmissionParams {
  form: LoginFormState;
  triggerErrorFeedback: () => void;
  onAuthSuccess: LoginAuthSuccessHandler;
}

/**
 * Login submission domain — password login (with inline 2FA challenge),
 * OTP request/verify, OTP-inline-2FA retry, and magic-link request. Every
 * validation order, message, error branch and state transition is verbatim
 * from the original screen; auth success delegates to the orchestrator's
 * onAuthSuccess (login → track → 2FA flag → navigation → markInteractive).
 */
export function useLoginSubmission({ form, triggerErrorFeedback, onAuthSuccess }: LoginSubmissionParams) {
  const {
    email,
    password,
    isSubmitting,
    isMagicSending,
    isOtpSending,
    isOtpVerifying,
    otpChallengeId,
    otpCode,
    twoFactorCode,
    recoveryCode,
    otpTwoFactorCode,
    otpRecoveryCode,
    otpUseRecovery,
    isOtpTwoFactorVerifying,
    setIsSubmitting,
    setIsMagicSending,
    setIsOtpSending,
    setIsOtpVerifying,
    setOtpChallengeId,
    setOtpCode,
    setRequiresTwoFactor,
    setOtpTwoFactorRequired,
    setOtpTwoFactorCode,
    setOtpRecoveryCode,
    setOtpUseRecovery,
    setIsOtpTwoFactorVerifying,
    setErrorMsg,
    setInfoMsg,
    setEmailError,
    setPasswordError,
  } = form;

  const handleLogin = async () => {
    if (isSubmitting) {
      return;
    }

    const normalizedEmail = normalizeEmail(email);

    const validation = validatePasswordLogin(email, password);
    if (validation) {
      setErrorMsg(validation.errorMsg);
      // Clear the counterpart field too — a stale error from a previous
      // attempt must not stay rendered under a field that now validates.
      setEmailError(validation.emailError ?? '');
      setPasswordError(validation.passwordError ?? '');
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    setErrorMsg('');
    setEmailError('');
    setPasswordError('');
    setInfoMsg('');
    setIsSubmitting(true);

    try {
      const result = await loginWithPassword({
        email: normalizedEmail,
        password,
        twoFactorCode: recoveryCode.trim() ? undefined : twoFactorCode.trim() || undefined,
        recoveryCode: recoveryCode.trim() || undefined });

      onAuthSuccess(result, 'email', 'login_complete');
    } catch (error) {
      const authError = error as LoginWithPasswordError;
      if (isTwoFactorChallengeError(authError.code)) {
        setRequiresTwoFactor(true);
        setInfoMsg('Enter your authenticator code (or a recovery code) to continue.');
      }
      setErrorMsg(authError.message || 'Unable to log in right now.');
      triggerErrorFeedback();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestOtp = async () => {
    if (isOtpSending || isSubmitting) {
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const emailValidationError = validateEmailForOtp(email);
    if (emailValidationError) {
      setErrorMsg(emailValidationError);
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsOtpSending(true);

    try {
      const result = await requestEmailOtp(normalizedEmail);
      setOtpChallengeId(result.challengeId);
      setOtpCode('');
      // A fresh challenge resets the 2FA sub-state — a stale
      // otpTwoFactorRequired from a previous challenge would lock
      // canVerifyOtp and surface the 2FA block before it's needed.
      setOtpTwoFactorRequired(false);

      setInfoMsg(otpRequestInfoMessage(result));
    } catch (error) {
      setErrorMsg((error as Error).message || 'Unable to send OTP right now.');
      setInfoMsg('');
      triggerErrorFeedback();
    } finally {
      setIsOtpSending(false);
    }
  };

  const handleRequestMagicLink = async () => {
    if (isMagicSending || isSubmitting) {
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const emailValidationError = validateEmailForMagicLink(email);
    if (emailValidationError) {
      setErrorMsg(emailValidationError);
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsMagicSending(true);

    try {
      const result = await requestMagicLink(normalizedEmail);
      setInfoMsg(magicLinkInfoMessage(result));
    } catch (error) {
      setErrorMsg((error as Error).message || 'Unable to send magic link right now.');
      setInfoMsg('');
      triggerErrorFeedback();
    } finally {
      setIsMagicSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpChallengeId || isOtpVerifying || isSubmitting) {
      return;
    }

    const normalizedCode = otpCode.trim();
    const codeValidationError = validateOtpCode(otpCode);
    if (codeValidationError) {
      setErrorMsg(codeValidationError);
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsOtpVerifying(true);

    try {
      const result = await verifyEmailOtp({
        challengeId: otpChallengeId,
        code: normalizedCode });

      onAuthSuccess(result, 'email', 'login_complete_otp');
    } catch (error) {
      // The backend does NOT consume the OTP challenge when
      // TWO_FACTOR_REQUIRED is returned (the transaction rolls back), so
      // the same challengeId + OTP code can be retried with a 2FA code.
      // Show an inline 2FA challenge instead of redirecting to password
      // login. The challengeId and otpCode are retained for retry.
      const otpError = error as OtpVerificationError;
      if (isOtpTwoFactorRequired(otpError.code)) {
        setOtpTwoFactorRequired(true);
        setOtpTwoFactorCode('');
        setOtpRecoveryCode('');
        setOtpUseRecovery(false);
        setInfoMsg('Two-factor authentication is required. Enter the code from your authenticator app to continue.');
        setErrorMsg('');
      } else {
        setErrorMsg(formatOtpErrorMessage(error));
        triggerErrorFeedback();
      }
    } finally {
      setIsOtpVerifying(false);
    }
  };

  const handleVerifyOtpTwoFactor = async () => {
    if (!otpChallengeId || isOtpTwoFactorVerifying || isSubmitting) {
      return;
    }

    const twoFactorCode = otpTwoFactorCode.trim();
    const recoveryCode = otpRecoveryCode.trim();

    const twoFactorValidationError = validateOtpTwoFactorInput({
      useRecovery: otpUseRecovery,
      twoFactorCode,
      recoveryCode });
    if (twoFactorValidationError) {
      setErrorMsg(twoFactorValidationError);
      setInfoMsg('');
      triggerErrorFeedback();
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsOtpTwoFactorVerifying(true);

    try {
      const result = await verifyEmailOtp({
        challengeId: otpChallengeId,
        code: otpCode.trim(),
        twoFactorCode: otpUseRecovery ? undefined : twoFactorCode,
        recoveryCode: otpUseRecovery ? recoveryCode : undefined });

      onAuthSuccess(result, 'email', 'login_complete_otp');
    } catch (error) {
      // The challenge is not consumed on TWO_FACTOR_REQUIRED — keep it so
      // the user can retry with a corrected code.
      setErrorMsg((error as Error).message || 'Unable to verify two-factor code.');
      triggerErrorFeedback();
    } finally {
      setIsOtpTwoFactorVerifying(false);
    }
  };

  return {
    handleLogin,
    handleRequestOtp,
    handleRequestMagicLink,
    handleVerifyOtp,
    handleVerifyOtpTwoFactor,
  };
}
