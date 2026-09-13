import React from 'react';
import { useToast } from '../../context/ToastContext';
import { useStore } from '../../store/useStore';
import { useConnectivity } from '../useConnectivity';
import {
  saveDac7TaxInfo,
  type Dac7TaxInfo } from '../../services/complianceApi';
import { parseApiError } from '../../lib/apiClient';
import { EU_COUNTRIES, type Dac7Step } from '../../domain/verification';

export interface UseDac7FlowOptions {
  /** Apply the freshly saved DAC7 record to the screen's backend-status state. */
  onSaved: (info: Dac7TaxInfo) => void;
}

export interface UseDac7FlowResult {
  step: Dac7Step;
  tin: string;
  setTin: (v: string) => void;
  /** Currently selected country of tax residence (ISO alpha-2). */
  country: string;
  selfDeclared: boolean;
  isSubmitting: boolean;
  /** Status-row press: toggles between the status surface and the details form. */
  toggleOpen: () => void;
  cancel: () => void;
  /** Selecting a country also derives EU residency for the payload. */
  selectCountry: (code: string) => void;
  toggleSelfDeclared: () => void;
  submit: () => Promise<void>;
}

/**
 * useDac7Flow — owns the DAC7 tax-information step machine
 * (status → details), the TIN / tax-residence / self-declaration fields,
 * and persistence via saveDac7TaxInfo.
 */
export function useDac7Flow({ onSaved }: UseDac7FlowOptions): UseDac7FlowResult {
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const currentUser = useStore((state) => state.currentUser);
  const updateCoOwnCompliance = useStore((state) => state.updateCoOwnCompliance);

  const [step, setStep] = React.useState<Dac7Step>('status');
  const [tin, setTin] = React.useState('');
  const [country, setCountry] = React.useState('GB');
  const [isEuResident, setIsEuResident] = React.useState(false);
  const [selfDeclared, setSelfDeclared] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const toggleOpen = React.useCallback(() => {
    setStep((s) => (s === 'status' ? 'details' : 'status'));
  }, []);

  const cancel = React.useCallback(() => setStep('status'), []);

  const selectCountry = React.useCallback((code: string) => {
    setCountry(code);
    setIsEuResident(EU_COUNTRIES.includes(code));
  }, []);

  const toggleSelfDeclared = React.useCallback(() => {
    setSelfDeclared((v) => !v);
  }, []);

  const submit = React.useCallback(async () => {
    if (!tin.trim()) {
      show('Enter your tax identification number', 'error');
      return;
    }
    if (!selfDeclared) {
      show('Confirm the self-declaration checkbox', 'error');
      return;
    }
    if (!currentUser?.id) {
      show('Log in to save tax information', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      // Persist DAC7 tax info to the backend
      const result = await saveDac7TaxInfo(currentUser.id, {
        tin: tin.trim(),
        taxResidenceCountry: country,
        isEuResident,
        selfDeclared: true });

      // Update local compliance state
      updateCoOwnCompliance({
        dac7Completed: true,
        dac7Tin: tin.trim(),
        dac7Country: country });

      // Update backend status state
      onSaved(result.taxInfo);

      show('Tax information saved', 'success');
      setStep('status');
    } catch (err) {
      const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));
      const parsed = parseApiError(err, isNetworkError ? 'You appear to be offline. Check your connection and try again.' : undefined);
      show(parsed.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [tin, country, isEuResident, selfDeclared, currentUser?.id, updateCoOwnCompliance, onSaved, isOffline, show]);

  return {
    step,
    tin, setTin,
    country,
    selfDeclared,
    isSubmitting,
    toggleOpen,
    cancel,
    selectCountry,
    toggleSelfDeclared,
    submit,
  };
}
