'use client';

/**
 * CreateStreamFlow — compose a show: cover pick (a listing cover or an
 * upload), title, ordered pins over your active listings (max 6), and a
 * start time (now or a scheduled slot). Fixture mode: nothing is broadcast
 * — the show is simulated locally and dissolves on reload, and the page
 * says so next to the action that creates it.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { HostGate } from './HostGate';
import { useCreateStreamWorkflow } from './create/useCreateStreamWorkflow';
import { CreateStreamSkeleton, FIELD_LABEL, INPUT } from './create/CreateStreamPrimitives';
import { CreateStreamCoverPicker } from './create/CreateStreamCoverPicker';
import { CreateStreamPinsPicker } from './create/CreateStreamPinsPicker';
import { CreateStreamSchedulePicker } from './create/CreateStreamSchedulePicker';
import { CreateStreamConfirmedView } from './create/CreateStreamConfirmedView';

export function CreateStreamFlow() {
  const w = useCreateStreamWorkflow();

  if (w.isGuest) return <HostGate />;
  if (!w.hydrated || w.isLoading) return <CreateStreamSkeleton />;

  if (w.available.length === 0) {
    return (
      <EmptyState
        icon="inventory"
        title="Nothing to sell live"
        subtitle="List an item first — live shows are built from your active listings."
        actionLabel="List an item"
        onAction={() => w.router.push('/sell')}
      />
    );
  }

  if (w.confirmed) {
    return (
      <CreateStreamConfirmedView
        confirmed={w.confirmed}
        isLive={w.isLive}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-6 sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-screen-title text-text-primary">Go live</h1>
          <p className="mt-1 text-body text-text-secondary">
            Pick a cover, pin what you&apos;re selling, choose when.
          </p>
        </div>
        <Link
          href="/live"
          className="pressable mt-1.5 shrink-0 rounded-md px-2 py-1.5 text-caption font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          Cancel
        </Link>
      </header>

      {/* Single-column composer — one reading column, hairline-separated
          sections, commit pinned as the last block. No restated summary:
          the fields are the truth. */}
      <form onSubmit={w.submit} className="mt-6 flex flex-col gap-7" noValidate>
        {/* Cover — the object buyers see on the live hub. Fixture only:
            the session API has no cover field, so in live mode the show
            card renders from the pinned lots instead. */}
        {!w.isLive ? (
          <CreateStreamCoverPicker
            cover={w.cover}
            coverOptions={w.coverOptions}
            onSelectCoverKey={w.setCoverKey}
            fileRef={w.fileRef}
            onUpload={w.onUpload}
            error={w.errors.cover}
          />
        ) : null}

        {/* Title */}
        <div className="flex flex-col gap-2">
          <label htmlFor="live-title" className={FIELD_LABEL}>
            Stream title
          </label>
          <input
            id="live-title"
            value={w.title}
            onChange={(e) => {
              w.setTitle(e.target.value);
              w.setErrors((er) => (er.title ? { ...er, title: undefined } : er));
            }}
            maxLength={60}
            placeholder="e.g. Weekend closet clear-out"
            className={INPUT}
          />
          {w.errors.title ? (
            <p role="alert" className="text-caption text-danger-text">{w.errors.title}</p>
          ) : null}
        </div>

        {/* Pinned products — ordered, max MAX_PINS */}
        <CreateStreamPinsPicker
          available={w.available}
          pinIds={w.pinIds}
          onTogglePin={w.togglePin}
          error={w.errors.pins}
        />

        {/* Start time */}
        <CreateStreamSchedulePicker
          isLive={w.isLive}
          schedule={w.schedule}
          onScheduleChange={w.setSchedule}
          startAt={w.startAt}
          onStartAtChange={(val) => {
            w.setStartAt(val);
            w.setErrors((er) => (er.schedule ? { ...er, schedule: undefined } : er));
          }}
          minStart={w.minStart}
          scheduling={w.scheduling}
          error={w.errors.schedule}
        />

        {/* Commit — the action and the honesty note, same hairline
            section grammar as the fieldsets above. */}
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-6">
          <Button
            type="submit"
            size="lg"
            fullWidth
            variant={w.scheduling ? 'primary' : 'danger'}
            disabled={w.pending}
          >
            {w.pending ? (w.scheduling ? 'Scheduling…' : 'Going live…') : w.scheduling ? 'Schedule show' : 'Go live'}
          </Button>
          {w.submitError ? (
            <p role="alert" className="text-caption text-danger-text">{w.submitError}</p>
          ) : null}
          <p className="text-meta text-text-muted">
            {w.isLive
              ? 'Creates a real scheduled show — it appears under Coming up for your followers on web and mobile.'
              : 'Demo mode — this stream is simulated: viewers, chat and orders are generated locally, no video is broadcast, and the show clears on reload.'}
          </p>
        </div>
      </form>
    </div>
  );
}
