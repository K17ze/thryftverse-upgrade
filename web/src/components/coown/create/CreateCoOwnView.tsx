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

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { IssueStepper } from './IssueStepper';
import { PreflightStep } from './PreflightStep';
import { ListingStep } from './ListingStep';
import { EconomicsStep } from './EconomicsStep';
import { StructureStep } from './StructureStep';
import { AuthenticityStep } from './AuthenticityStep';
import { ReviewStep } from './ReviewStep';
import { RecourseStep } from './RecourseStep';
import { SubmitErrorBanner } from './SubmitErrorBanner';
import { useCreateCoOwnWorkflow } from './useCreateCoOwnWorkflow';

export function CreateCoOwnView() {
  const {
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
  } = useCreateCoOwnWorkflow();

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
        <div
          className="flex flex-col gap-4"
          aria-busy
          aria-label="Loading issue studio"
        >
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
