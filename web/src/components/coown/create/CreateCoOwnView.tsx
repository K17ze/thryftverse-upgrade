'use client';

/**
 * CreateCoOwnView — the web issue studio. Native parity with
 * CreateSyndicateScreen (preflight → listing → economics → structure →
 * authenticity → review), adapted to a desktop stepped wizard.
 *
 * Live-only write: fixture mode renders an honest notice rather than a
 * simulated issuance; guests hit an auth wall; the KYC preflight fails
 * closed (email tier / null / error all block progression).
 */

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
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
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
import { IssueStepper } from './IssueStepper';
import { PreflightStep } from './PreflightStep';
import { ListingStep } from './ListingStep';
import { EconomicsStep } from './EconomicsStep';
import { StructureStep } from './StructureStep';
import { AuthenticityStep } from './AuthenticityStep';
import { ReviewStep } from './ReviewStep';
import { RecourseStep } from './RecourseStep';
import type { CoOwnAsset } from '@/lib/contracts/coown';

interface SubmitError {
  message: string;
  code: string | null;
}

function SubmitErrorBanner({
  error,
  onJump,
}: {
  error: SubmitError;
  onJump: (step: IssueStep) => void;
}) {
  const target = stepForSubmitError(error.code);
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-border-subtle pb-4"
    >
      <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-danger-text" />
      <div className="min-w-0 flex-1">
        {/* Server text verbatim — the issuer needs the real refusal. */}
        <p className="text-body text-text-primary">{error.message}</p>
        {target ? (
          <button
            type="button"
            onClick={() => onJump(target)}
            className="pressable mt-1 text-caption font-medium text-text-primary underline underline-offset-2"
          >
            Go to {target === 'verify' ? 'verification' : target}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CreateCoOwnView() {
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

  const maxUnits = policyQuery.data?.maxIssuanceUnits ?? FALLBACK_MAX_ISSUANCE_UNITS;
  const policyUnavailable = live && policyQuery.isError;
  const selectedListing =
    listings.items.find((l) => l.id === draft.listingId) ?? null;
  const submitting = create.isPending;
  // Bound once the asset exists — '' never fires because sign() guards on
  // createdAsset first.
  const signRecourse = useSignCoOwnRecourse(createdAsset?.id ?? '');
  const signing = signRecourse.isPending;

  // ── Gates ──

  if (!live) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="layers"
          title="Issuing needs the live backend"
          subtitle="Creating a Co-Own is a real write against the market — it's enabled in live data mode, not in this fixture build."
          actionLabel="Back to Co-Own"
          onAction={() => router.push('/co-own')}
        />
      </div>
    );
  }

  if (sessionLoading) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 pt-6 sm:px-6">
        <div className="flex flex-col gap-4" aria-busy aria-label="Loading issue studio">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (isGuest || !user || !issuerId) {
    return (
      <EmptyState
        icon="lock"
        title="Sign in to issue a Co-Own"
        subtitle="Issuance splits one of your listings into tradable units — sign in to start."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  // ── Navigation ──

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
    if (!selectedListing) return;
    issuanceIdRef.current ??= newCoOwnIssuanceId();
    submitLock.current = true;
    setSubmitError(null);
    try {
      const asset = await create.mutateAsync(
        buildIssuePayload(draft, selectedListing, issuerId, issuanceIdRef.current),
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

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-6 sm:px-6">
      <h1 className="text-screen-title text-text-primary">Issue a Co-Own</h1>
      <p className="mt-1 text-body text-text-secondary">
        Split one of your listings into tradable units.
      </p>

      <div className="mt-6">
        <IssueStepper
          current={step}
          onSelect={setStep}
          // Once the asset exists the draft steps are committed — frozen
          // so they read as history, not editable targets.
          enabled={!createdAsset}
        />
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {submitError ? (
          <SubmitErrorBanner error={submitError} onJump={setStep} />
        ) : null}

        {step === 'verify' ? <PreflightStep query={verification} /> : null}

        {step === 'listing' ? (
          <ListingStep
            draft={draft}
            items={listings.items}
            inventoryCount={listings.inventoryCount}
            isLoading={listings.isLoading}
            isError={listings.isError}
            onRefetch={listings.refetch}
            errors={fieldErrors}
            onPatch={patch}
            clearError={clearError}
          />
        ) : null}

        {step === 'economics' && selectedListing ? (
          <EconomicsStep
            draft={draft}
            listing={selectedListing}
            maxUnits={maxUnits}
            policyUnavailable={policyUnavailable}
            errors={fieldErrors}
            onPatch={patch}
            clearError={clearError}
          />
        ) : null}

        {step === 'structure' ? (
          <StructureStep
            draft={draft}
            errors={fieldErrors}
            onPatch={patch}
            clearError={clearError}
          />
        ) : null}

        {step === 'authenticity' ? (
          <AuthenticityStep
            draft={draft}
            errors={fieldErrors}
            onPatch={patch}
            clearError={clearError}
          />
        ) : null}

        {step === 'review' && selectedListing ? (
          <ReviewStep draft={draft} listing={selectedListing} />
        ) : null}

        {step === 'recourse' && createdAsset ? (
          <>
            <RecourseStep
              asset={createdAsset}
              listingTitle={selectedListing?.title ?? createdAsset.title}
              accepted={recourseAccepted}
              onAccept={(v) => {
                setRecourseAccepted(v);
                setSignError(null);
              }}
            />
            {signError ? (
              <p role="alert" className="text-meta text-danger-text">
                {signError}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-border-subtle pt-5">
        {step === 'recourse' && createdAsset ? (
          <>
            <Button
              variant="quiet"
              onClick={() =>
                router.push(`/co-own/${encodeURIComponent(createdAsset.id)}`)
              }
              disabled={signing}
            >
              Finish later
            </Button>
            <Button
              onClick={() => void sign()}
              disabled={!recourseAccepted || signing}
            >
              {signing ? 'Signing…' : 'Sign and take live'}
            </Button>
          </>
        ) : (
          <>
            {stepIndex === 0 ? (
              <Button variant="quiet" onClick={() => router.push('/co-own')}>
                Back to Co-Own
              </Button>
            ) : (
              <Button
                variant="quiet"
                icon="back"
                onClick={goBack}
                disabled={submitting}
              >
                Back
              </Button>
            )}
            {step === 'review' ? (
              <Button
                onClick={() => void submit()}
                disabled={!stepValid || submitting}
              >
                {submitting ? 'Issuing…' : 'Issue Co-Own'}
              </Button>
            ) : (
              <Button onClick={goNext} disabled={!stepValid}>
                Continue
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
