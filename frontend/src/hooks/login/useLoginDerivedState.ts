import {
  deriveLoginActionState,
  type LoginActionInput,
} from '../../components/login/loginViewModels';

/**
 * Login action enablement — canSubmit / canRequestMagicLink / canRequestOtp
 * / canVerifyOtp derived from the form state machine. Thin wrapper over the
 * pure view-model derivation so the flags stay unit-testable.
 */
export function useLoginDerivedState(input: LoginActionInput) {
  return deriveLoginActionState(input);
}
