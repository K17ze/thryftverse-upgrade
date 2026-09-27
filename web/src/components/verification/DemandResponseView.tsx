'use client';

/**
 * DemandResponseView — /verification/demands/[id]. Port of the mobile
 * VerificationResponseScreen: demand context + guidance, evidence photos
 * (≥1 required, up to 6), optional notes, liability warning, submit →
 * responded. Terminal statuses render their own honest end-states —
 * receipt for responded/compliant, closed copy for failed/expired/withdrawn.
 *
 * Media: live mode uploads each pick through the uploads service
 * (presign → PUT → finalize, purpose 'evidence') exactly like the mobile
 * uploadMedia('evidence') path; fixture mode keeps object-URL previews —
 * session-local evidence, submitted as-is.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { uploadImageFile } from '@/lib/api/services/uploads';
import { parseApiError } from '@/lib/api/http';
import type { SellerVerificationDemand } from '@/lib/contracts/verification';
import { useSession } from '@/lib/session/SessionProvider';
import {
  useRespondToVerificationDemand,
  useVerificationDemand,
} from '@/lib/hooks/verification-queries';
import {
  DEMAND_TYPE_GUIDANCE,
  MAX_EVIDENCE_NOTES,
  MAX_EVIDENCE_PHOTOS,
  demandDaysLeft,
  demandStatusMeta,
  demandTypeIcon,
  demandTypeLabel,
  isDemandOverdue,
  type DemandEvidence,
} from './demandModel';
import { formatDate } from '@/lib/utils/format';

// ── Deadline badge ──────────────────────────────────────────────────────────

function DeadlineBadge({ demand }: { demand: SellerVerificationDemand }) {
  const overdue = isDemandOverdue(demand);
  const days = demandDaysLeft(demand);
  const text = overdue
    ? 'Deadline passed — respond immediately'
    : days <= 0
      ? 'Due today'
      : days === 1
        ? '1 day remaining'
        : `${days} days remaining`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-meta font-medium ${
        overdue ? 'bg-danger-subtle text-danger-text' : 'bg-surface-alt text-text-secondary'
      }`}
    >
      <Icon name={overdue ? 'warning' : 'clock'} size={14} />
      {text}
    </span>
  );
}

// ── Shared chrome for the terminal states ───────────────────────────────────

function DemandShell({
  children,
  backTo,
}: {
  children: React.ReactNode;
  backTo?: string;
}) {
  const router = useRouter();
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-16 sm:px-6">
      <div className="flex items-center pt-2 md:pt-6">
        <IconButton
          name="back"
          aria-label="Back to verification requests"
          onClick={() => router.push(backTo ?? '/verification/demands')}
          className="-ml-2"
        />
        <h1 className="ml-1 text-screen-title font-semibold text-text-primary">
          Respond to verification
        </h1>
      </div>
      {children}
    </div>
  );
}

// ── Evidence photo grid ─────────────────────────────────────────────────────

function EvidenceGrid({
  items,
  onRemove,
}: {
  items: DemandEvidence[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <div key={item.id} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- object-URL previews cannot go through next/image */}
          <img
            src={item.uri}
            alt={`Evidence photo ${i + 1}`}
            className={`h-[88px] w-[88px] rounded-md object-cover ${item.uploading ? 'opacity-60' : ''}`}
          />
          {item.uploading ? (
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-scrim-text-primary border-t-transparent" />
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove evidence photo ${i + 1}`}
            className="pressable absolute -right-1.5 -top-1.5 min-h-11 min-w-11 text-danger-text"
          >
            <Icon name="close" filled size={22} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────

export function DemandResponseView({ demandId }: { demandId: number }) {
  const router = useRouter();
  const { isGuest } = useSession();
  const toast = useToast();
  const { data: demand, isLoading, isError, refetch } = useVerificationDemand(demandId);
  const respond = useRespondToVerificationDemand();

  const [evidence, setEvidence] = useState<DemandEvidence[]>([]);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isGuest) router.replace('/auth');
  }, [isGuest, router]);

  // Release object-URL previews on unmount.
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  if (isGuest) return null;

  if (isLoading) {
    return (
      <DemandShell>
        <div className="mt-4" aria-busy aria-label="Loading verification request">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="mt-6 h-4 w-40" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-[88px] w-[88px] rounded-md" />
            <Skeleton className="h-[88px] w-[88px] rounded-md" />
          </div>
          <Skeleton className="mt-6 h-24 w-full rounded-md" />
          <Skeleton className="mt-6 h-[52px] w-full rounded-md" />
        </div>
      </DemandShell>
    );
  }

  if (isError) {
    return (
      <DemandShell>
        <EmptyState
          icon="alert"
          title="Could not load request"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      </DemandShell>
    );
  }

  if (!demand) {
    return (
      <DemandShell>
        <EmptyState
          icon="help"
          title="Request not found"
          subtitle="This verification request may have been withdrawn."
          actionLabel="Back to requests"
          onAction={() => router.push('/verification/demands')}
        />
      </DemandShell>
    );
  }

  // ── Responded / compliant — the receipt. ──
  if (submitted || demand.status === 'responded' || demand.status === 'compliant') {
    return (
      <DemandShell>
        <div className="flex flex-col items-center py-12 text-center" aria-live="polite">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-subtle">
            <Icon name="check" filled size={30} className="text-success-text" />
          </span>
          <h2 className="mt-5 text-section-title font-semibold text-text-primary">
            Evidence submitted
          </h2>
          <p className="mt-1.5 max-w-sm text-body text-text-secondary">
            The buyer has been notified. You&apos;ll be informed of the platform&apos;s verdict.
          </p>

          {demand.evidenceUrl ? (
            <div className="mt-6 flex w-full max-w-sm items-center gap-3 rounded-lg border border-border-subtle bg-surface p-3 text-left">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixture-mode object URLs cannot go through next/image */}
              <img
                src={demand.evidenceUrl}
                alt="Submitted evidence"
                className="h-14 w-14 rounded-md object-cover"
              />
              <div className="min-w-0">
                <p className="text-label text-text-muted">Evidence submitted</p>
                <p className="mt-0.5 text-caption text-text-secondary">
                  {demand.respondedAt ? formatDate(demand.respondedAt) : ''}
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex w-full max-w-sm flex-col gap-2.5">
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => router.push('/verification/demands')}
            >
              Back to requests
            </Button>
            <Link
              href={`/co-own/${demand.assetId}`}
              className="pressable flex h-11 items-center justify-center rounded-md text-body font-medium text-text-secondary hover:text-text-primary"
            >
              View asset
            </Link>
          </div>
        </div>
      </DemandShell>
    );
  }

  // ── Terminal non-pending states — failed / expired / withdrawn. ──
  if (demand.status !== 'pending') {
    const meta = demandStatusMeta(demand.status);
    const copy =
      demand.status === 'expired'
        ? 'The deadline for this verification request has passed. Recourse may have been triggered.'
        : demand.status === 'failed'
          ? 'This verification was marked as failed. Recourse has been triggered.'
          : 'This verification request is no longer pending.';
    return (
      <DemandShell>
        <div className="flex flex-col items-center py-12 text-center" aria-live="polite">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt">
            <Icon name={meta.icon} size={30} className="text-text-muted" />
          </span>
          <h2 className="mt-5 text-section-title font-semibold text-text-primary">
            {demand.status === 'expired' ? 'Deadline passed' : meta.label}
          </h2>
          <p className="mt-1.5 max-w-sm text-body text-text-secondary">{copy}</p>
          <div className="mt-8 flex w-full max-w-sm flex-col gap-2.5">
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => router.push(`/co-own/${demand.assetId}`)}
            >
              View asset
            </Button>
            <Link
              href="/verification/demands"
              className="pressable flex h-11 items-center justify-center rounded-md text-body font-medium text-text-secondary hover:text-text-primary"
            >
              Back to requests
            </Link>
          </div>
        </div>
      </DemandShell>
    );
  }

  // ── Pending — the response form. ──
  const overdue = isDemandOverdue(demand);
  const canSubmit =
    evidence.length > 0 && evidence.every((e) => !e.uploading) && !respond.isPending;

  const attachFiles = (files: File[]) => {
    const room = MAX_EVIDENCE_PHOTOS - evidence.length;
    if (files.length === 0) return;
    if (room <= 0) {
      toast.show(`Attach up to ${MAX_EVIDENCE_PHOTOS} photos.`, 'info');
      return;
    }
    files.slice(0, room).forEach((file) => {
      const uri = URL.createObjectURL(file);
      objectUrlsRef.current.add(uri);
      const id = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (DATA_MODE !== 'live') {
        // Fixture mode — the preview URI is the submitted evidence.
        setEvidence((prev) => [...prev, { id, uri, uploadedUrl: uri, uploading: false }]);
        return;
      }

      // Live mode — upload at pick time, same as the mobile gallery path.
      setEvidence((prev) => [...prev, { id, uri, uploadedUrl: null, uploading: true }]);
      uploadImageFile(file, 'evidence')
        .then((url) => {
          setEvidence((prev) =>
            prev.map((e) => (e.id === id ? { ...e, uploadedUrl: url, uploading: false } : e)),
          );
        })
        .catch(() => {
          setEvidence((prev) => prev.filter((e) => e.id !== id));
          URL.revokeObjectURL(uri);
          objectUrlsRef.current.delete(uri);
          toast.show('Unable to upload a photo. Try again.', 'error');
        });
    });
  };

  const removeEvidence = (id: string) => {
    setEvidence((prev) => {
      const item = prev.find((e) => e.id === id);
      if (item && item.uri.startsWith('blob:')) {
        URL.revokeObjectURL(item.uri);
        objectUrlsRef.current.delete(item.uri);
      }
      return prev.filter((e) => e.id !== id);
    });
  };

  const submit = () => {
    if (evidence.length === 0) {
      toast.show('Attach at least one photo as evidence.', 'error');
      return;
    }
    if (!canSubmit) return;
    const primaryUrl = evidence[0].uploadedUrl ?? evidence[0].uri;
    const extraUrls = evidence.slice(1).map((e) => e.uploadedUrl ?? e.uri);
    // Mirror the mobile payload: first photo is the primary evidence URL;
    // the rest ride along inside the notes so nothing is dropped.
    const trimmed = notes.trim();
    const composed = trimmed
      ? extraUrls.length
        ? `${trimmed}\n\nEvidence photos: ${[primaryUrl, ...extraUrls].join(', ')}`
        : trimmed
      : extraUrls.length
        ? `Evidence photos: ${[primaryUrl, ...extraUrls].join(', ')}`
        : undefined;

    respond.mutate(
      {
        assetId: demand.assetId,
        demandId: demand.id,
        evidenceUrl: primaryUrl,
        evidenceNotes: composed,
      },
      {
        onSuccess: () => {
          toast.show('Evidence submitted. The buyer has been notified.', 'success');
          setSubmitted(true);
          window.scrollTo({ top: 0 });
        },
        onError: (err) => {
          toast.show(parseApiError(err).message, 'error');
        },
      },
    );
  };

  return (
    <DemandShell>
      {/* Demand context — type, deadline, guidance. */}
      <div className="mt-4 rounded-lg border border-border-subtle bg-surface p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-primary">
            <Icon name={demandTypeIcon(demand.demandType)} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-label text-text-muted">Verification request</p>
            <p className="mt-0.5 text-body-emphasis font-semibold text-text-primary">
              {demandTypeLabel(demand.demandType)}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <DeadlineBadge demand={demand} />
        </div>
        <p className="mt-3 text-body leading-relaxed text-text-secondary">
          {DEMAND_TYPE_GUIDANCE[demand.demandType] ??
            'Provide evidence to verify this asset.'}
        </p>
        <Link
          href={`/co-own/${demand.assetId}`}
          className="pressable mt-3 flex items-center gap-3 border-t border-border-subtle pt-3"
        >
          <AppImage
            src={demand.assetImageUrl}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 overflow-hidden rounded-md"
            fallbackIcon="image"
          />
          <span className="clamp-1 flex-1 text-body text-text-secondary">{demand.assetTitle}</span>
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        </Link>
      </div>

      {/* Evidence photos. */}
      <div className="mt-7">
        <h2 className="text-label text-text-muted">Evidence photos</h2>
        <p className="mt-1.5 text-caption leading-relaxed text-text-secondary">
          Upload photos proving{' '}
          {demand.demandType === 'authenticity'
            ? 'authenticity'
            : demand.demandType === 'possession'
              ? 'possession'
              : "the item's condition"}
          . At least 1 required.
        </p>

        {evidence.length > 0 ? (
          <div className="mt-3">
            <EvidenceGrid items={evidence} onRemove={removeEvidence} />
          </div>
        ) : null}

        {evidence.length < MAX_EVIDENCE_PHOTOS ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                attachFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="pressable mt-3 flex min-h-11 w-full items-center gap-2 rounded-md border border-border px-3 py-2.5 text-left hover:bg-brand-subtle"
            >
              <Icon name="camera" size={18} className="shrink-0 text-text-secondary" />
              <span className="flex-1 text-body text-text-primary">
                {evidence.length > 0 ? 'Add more' : 'Add photos'}
              </span>
              <span className="text-meta text-text-muted">
                {evidence.length}/{MAX_EVIDENCE_PHOTOS}
              </span>
            </button>
          </>
        ) : null}
      </div>

      {/* Notes. */}
      <div className="mt-7">
        <label htmlFor="evidence-notes" className="text-label text-text-muted">
          Notes (optional)
        </label>
        <div className="mt-1.5 rounded-md border border-border-subtle bg-surface p-3">
          <textarea
            id="evidence-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={MAX_EVIDENCE_NOTES}
            rows={4}
            placeholder="Add context about your evidence — serial numbers, certificates, dates, etc."
            className="w-full resize-y bg-transparent text-body text-input-text placeholder:text-text-muted focus:outline-none"
          />
          <p className="text-right text-meta text-text-muted">
            {notes.length}/{MAX_EVIDENCE_NOTES}
          </p>
        </div>
      </div>

      {/* Liability warning — the recourse posture, verbatim mobile copy. */}
      <div className="mt-7 flex items-start gap-3 rounded-lg border border-warning-border bg-warning-subtle px-4 py-3.5">
        <Icon name="lock" size={18} className="mt-0.5 shrink-0 text-warning-text" />
        <p className="text-caption leading-relaxed text-text-secondary">
          Your personal liability guarantee is active. Failure to provide satisfactory
          evidence may trigger recourse proceedings.
        </p>
      </div>

      <div className="mt-6">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canSubmit}
          onClick={submit}
          aria-label="Submit evidence to buyer"
        >
          {respond.isPending ? 'Submitting…' : overdue ? 'Submit evidence now' : 'Submit evidence'}
        </Button>
      </div>
    </DemandShell>
  );
}
