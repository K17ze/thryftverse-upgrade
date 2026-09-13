import { useState } from 'react';
import { sanitizeNumericCode, sanitizeRecoveryCode } from '../../components/login/loginViewModels';

/**
 * Owns the login screen's field/message/loading state machine plus the
 * field-level change handlers (each resets the exact slice of state the
 * original inline handlers did). Loading flags live here because both the
 * submission and social hooks read/mutate them.
 *
 * Handlers are plain per-render closures — identical semantics to the
 * original screen, no memoisation, no stale-closure risk.
 */
export function useLoginFormState() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMagicSending, setIsMagicSending] = useState(false);
  const [isOtpSending, setIsOtpSending] = useState(false);
  const [isOtpVerifying, setIsOtpVerifying] = useState(false);
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  // Inline 2FA challenge for the OTP flow. The backend does NOT consume the
  // OTP challenge when TWO_FACTOR_REQUIRED is returned (the transaction rolls
  // back), so the same challengeId + OTP code can be retried with a 2FA code.
  const [otpTwoFactorRequired, setOtpTwoFactorRequired] = useState(false);
  const [otpTwoFactorCode, setOtpTwoFactorCode] = useState('');
  const [otpRecoveryCode, setOtpRecoveryCode] = useState('');
  const [otpUseRecovery, setOtpUseRecovery] = useState(false);
  const [isOtpTwoFactorVerifying, setIsOtpTwoFactorVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Editing the email invalidates every pending challenge — verbatim reset.
  const onEmailChange = (value: string) => {
    setEmail(value);
    setRequiresTwoFactor(false);
    setTwoFactorCode('');
    setRecoveryCode('');
    if (otpChallengeId) {
      setOtpChallengeId(null);
      setOtpCode('');
    }
    setOtpTwoFactorRequired(false);
    setOtpTwoFactorCode('');
    setOtpRecoveryCode('');
    setOtpUseRecovery(false);
    if (errorMsg) {
      setErrorMsg('');
    }
    if (emailError) {
      setEmailError('');
    }
    if (infoMsg) {
      setInfoMsg('');
    }
  };

  const onPasswordChange = (value: string) => {
    setPassword(value);
    if (errorMsg) {
      setErrorMsg('');
    }
    if (passwordError) {
      setPasswordError('');
    }
  };

  const onTwoFactorCodeChange = (value: string) => {
    setTwoFactorCode(sanitizeNumericCode(value));
    if (errorMsg) {
      setErrorMsg('');
    }
  };

  const onRecoveryCodeChange = (value: string) => {
    setRecoveryCode(sanitizeRecoveryCode(value));
    if (errorMsg) {
      setErrorMsg('');
    }
  };

  const onOtpTwoFactorCodeChange = (value: string) => {
    setOtpTwoFactorCode(sanitizeNumericCode(value));
    if (errorMsg) {
      setErrorMsg('');
    }
  };

  const onOtpRecoveryCodeChange = (value: string) => {
    setOtpRecoveryCode(sanitizeRecoveryCode(value));
    if (errorMsg) {
      setErrorMsg('');
    }
  };

  const onToggleOtpUseRecovery = () => {
    setOtpUseRecovery((prev) => !prev);
    if (errorMsg) {
      setErrorMsg('');
    }
  };

  const cancelOtpTwoFactor = () => {
    setOtpTwoFactorRequired(false);
    setOtpTwoFactorCode('');
    setOtpRecoveryCode('');
    setOtpUseRecovery(false);
    setInfoMsg('Enter the OTP code from your email.');
    setErrorMsg('');
  };

  return {
    email,
    password,
    isSubmitting,
    isMagicSending,
    isOtpSending,
    isOtpVerifying,
    otpChallengeId,
    otpCode,
    requiresTwoFactor,
    twoFactorCode,
    recoveryCode,
    otpTwoFactorRequired,
    otpTwoFactorCode,
    otpRecoveryCode,
    otpUseRecovery,
    isOtpTwoFactorVerifying,
    errorMsg,
    infoMsg,
    emailError,
    passwordError,
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
    onEmailChange,
    onPasswordChange,
    onTwoFactorCodeChange,
    onRecoveryCodeChange,
    onOtpTwoFactorCodeChange,
    onOtpRecoveryCodeChange,
    onToggleOtpUseRecovery,
    cancelOtpTwoFactor,
  };
}

export type LoginFormState = ReturnType<typeof useLoginFormState>;
