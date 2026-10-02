'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseApiError } from '@/lib/api/http';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { useCoOwnPolicy, useSignCoOwnRecourse } from '@/lib/hooks/coown-queries';
import {
  useCreateCoOwnAsset,
  useIssuableListings,
  useIssuerVerification,
} from '@/lib/hooks/coown-issuance-queries';
import {
  canIssueCoOwn,
  FALLBACK_MAX_ISSUANCE_UNITS,
  newCoOwnIssuanceId,
} from '@/lib/api/services/coownIssuance';
import {
  buildIssuePayload,
  INITIAL_ISSUE_DRAFT,
  ISSUE_STEPS,
  stepForSubmitError,
  validateAuthenticityStep,
  validateEconomicsStep,
  validateListingStep,
  validateStructureStep,
  type IssueDraft,
  type IssueFieldErrors,
  type IssueStep,
} from './issueDraft';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import type { SubmitError } from './SubmitErrorBanner';

export function useCreateCoOwnWorkflow() {
  const router = useRouter();
  const { user, isGuest, sessionLoading } = useSession();
  const live = DATA_MODE === 'live';
  const issuerId = user?.id;

  const verification = useIssuerVerification(issuerId);
  const listings = useIssuableListings({ enabled: live && !!issuerId });
  const policyQuery = useCoOwnPolicy();
  const create = useCreateCoOwnAsset();

  const [step, setStep] = useState<IssueStep>('verify');
  const [draft, setDraft] = useState<IssueDraft>(INITIAL_ISSUE_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<IssueFieldErrors>({});
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  /** The committed asset — set the moment POST succeeds; from that point
   *  the wizard only signs, it can never issue twice. */
  const [createdAsset, setCreatedAsset] = useState<CoOwnAsset | null>(null);
  const [recourseAccepted, setRecourseAccepted] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  /** One issuance id per form session — held across retries so a replayed
   *  submit lands on the same asset row instead of double-issuing. */
  const issuanceIdRef = useRef<string | null>(null);
  const submitLock = useRef(false);

  const patch = (p: Partial<IssueDraft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setSubmitError(null);
  };

  const clearError = (field: keyof IssueDraft) =>
    setFieldErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

  const maxUnits =
    policyQuery.data?.maxIssuanceUnits ?? FALLBACK_MAX_ISSUANCE_UNITS;
  const policyUnavailable = live && policyQuery.isError;
  const selectedListing =
    listings.items.find((l) => l.id === draft.listingId) ?? null;
  const submitting = create.isPending;
  // Bound once the asset exists — '' never fires because sign() guards on
  // createdAsset first.
  const signRecourse = useSignCoOwnRecourse(createdAsset?.id ?? '');
  const signing = signRecourse.isPending;

  const stepIndex = ISSUE_STEPS.indexOf(step);

  const stepErrors = (): IssueFieldErrors => {
    switch (step) {
      case 'listing':
        return validateListingStep(draft, listings.items);
      case 'economics':
        return validateEconomicsStep(draft, maxUnits);
      case 'structure':
        return validateStructureStep(draft);
      case 'authenticity':
        return validateAuthenticityStep(draft);
      default:
        return {};
    }
  };

  /** Disabled state is computed live; error text lands on a failed
   *  Continue press (validating on every keystroke nags before input). */
  const stepValid =
    step === 'verify'
      ? canIssueCoOwn(verification.data)
      : step === 'review'
        ? !!selectedListing
        : Object.keys(stepErrors()).length === 0;

  const goNext = () => {
    // The KYC preflight has no field errors — it gates on the advisory
    // read itself. Belt-and-braces with the disabled Continue button.
    if (step === 'verify' && !canIssueCoOwn(verification.data)) return;
    const errors = stepErrors();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const next = ISSUE_STEPS[stepIndex + 1];
    if (next) {
      setStep(next);
      setFieldErrors({});
      window.scrollTo({ top: 0 });
    }
  };

  const goBack = () => {
    const prev = ISSUE_STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const submit = async () => {
    if (submitLock.current || submitting) return;
    if (!selectedListing || !issuerId) return;
    issuanceIdRef.current ??= newCoOwnIssuanceId();
    submitLock.current = true;
    setSubmitError(null);
    try {
      const asset = await create.mutateAsync(
        buildIssuePayload(
          draft,
          selectedListing,
          issuerId,
          issuanceIdRef.current,
        ),
      );
      // The asset exists at 'preview' — issuing is done, signing remains.
      setCreatedAsset(asset);
      setStep('recourse');
      window.scrollTo({ top: 0 });
    } catch (err) {
      const parsed = parseApiError(err, 'Issuance failed — try again');
      setSubmitError({ message: parsed.message, code: parsed.code });
      const target = stepForSubmitError(parsed.code);
      if (target) {
        setStep(target);
        if (target === 'listing') listings.refetch();
        if (target === 'verify') void verification.refetch();
        window.scrollTo({ top: 0 });
      }
    } finally {
      submitLock.current = false;
    }
  };

  /** The signature — a deliberate write: locked against double-click,
   *  server errors surface verbatim, and success lands on the now-live
   *  market. */
  const sign = async () => {
    if (!createdAsset || !recourseAccepted || signing) return;
    setSignError(null);
    try {
      await signRecourse.mutateAsync({ personalGuarantee: true });
      router.push(`/co-own/${encodeURIComponent(createdAsset.id)}`);
    } catch (err) {
      setSignError(parseApiError(err, 'Signing failed — try again').message);
    }
  };

  return {
    router,
    live,
    user,
    isGuest,
    sessionLoading,
    issuerId,
    verification,
    listings,
    policyUnavailable,
    step,
    setStep,
    stepIndex,
    draft,
    fieldErrors,
    submitError,
    createdAsset,
    recourseAccepted,
    setRecourseAccepted,
    signError,
    setSignError,
    maxUnits,
    selectedListing,
    submitting,
    signing,
    stepValid,
    patch,
    clearError,
    goNext,
    goBack,
    submit,
    sign,
  };
}
