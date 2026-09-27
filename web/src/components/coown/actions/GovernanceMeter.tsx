'use client';

/**
 * GovernanceMeter — the shared ballot tally grammar used by the
 * corporate-action record and the vote screen. Units of voting power per
 * side, the quorum meter, and the pass-threshold line. Every figure is a
 * real contract/endpoint value — quorum and threshold render only when
 * the resolution actually carries them.
 */

export function GovernanceMeter({
  votesFor,
  votesAgainst,
  votesAbstain,
  quorumUnits,
  passThresholdPct,
}: {
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorumUnits: number | null;
  passThresholdPct: number | null;
}) {
  const cast = votesFor + votesAgainst + votesAbstain;
  const share = (n: number) => (cast > 0 ? Math.round((n / cast) * 100) : null);
  const quorumPct =
    quorumUnits != null && quorumUnits > 0
      ? Math.min(100, Math.round((cast / quorumUnits) * 100))
      : null;

  const row = (label: string, units: number, tone?: 'up' | 'down') => (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-body text-text-secondary">{label}</span>
      <span className={`tnum text-body ${tone === 'up' ? 'text-coown-up' : tone === 'down' ? 'text-coown-down' : 'text-text-secondary'}`}>
        {units.toLocaleString()} {units === 1 ? 'unit' : 'units'}
        {share(units) != null ? (
          <span className="text-text-muted"> · {share(units)}%</span>
        ) : null}
      </span>
    </div>
  );

  return (
    <div>
      {quorumUnits != null && quorumUnits > 0 ? (
        <div className="mb-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-meta text-text-secondary">Quorum</span>
            <span className="tnum text-meta text-text-secondary">
              {cast.toLocaleString()} of {quorumUnits.toLocaleString()} units voted
              {quorumPct != null ? ` (${quorumPct}%)` : ''}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
            role="progressbar"
            aria-label="Quorum progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={quorumPct ?? 0}
          >
            <div
              className={`h-full rounded-full ${quorumPct === 100 ? 'bg-coown-up' : 'bg-brand'}`}
              style={{ width: `${quorumPct ?? 0}%` }}
            />
          </div>
          {quorumPct === 100 ? (
            <p className="mt-1.5 text-meta text-coown-up">Quorum reached</p>
          ) : null}
        </div>
      ) : null}

      <div className="divide-y divide-border-subtle border-y border-border-subtle">
        {row('For', votesFor, 'up')}
        {row('Against', votesAgainst, 'down')}
        {row('Abstain', votesAbstain)}
      </div>

      {passThresholdPct != null ? (
        <p className="mt-2 text-meta text-text-muted tnum">
          Passes at {passThresholdPct}% for, once quorum is met.
        </p>
      ) : null}
    </div>
  );
}
