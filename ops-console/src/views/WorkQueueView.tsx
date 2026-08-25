import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError, type CaseRecord } from '../api.js';

// ── Work Queue View ─────────────────────────────────────────────────────
//
// Operator triage table. The queue is the dominant object; header, metrics
// and search are utility, not decoration. Priority is rendered as a tuple of
// components — emergency, minor, harm, virality, severity, trusted, repeat —
// so an operator can triage at a glance instead of decoding one opaque score.
//
// Keyboard: j/k move selection, Enter opens, / focuses search, Esc clears.

type LoadingState = 'loading' | 'populated' | 'empty' | 'error' | 'offline';

type SortKey = 'priority' | 'severity' | 'sla' | 'value' | 'age';
type SortDir = 'asc' | 'desc';

// Per-column default direction. "desc" = most of that thing first; for SLA
// "asc" = soonest deadline first (most urgent).
const SORT_DEFAULTS: Record<SortKey, SortDir> = {
  priority: 'desc',
  severity: 'desc',
  sla: 'asc',
  value: 'desc',
  age: 'desc',
};

const SEVERITY_RANK: Record<string, number> = {
  normal: 1,
  elevated: 2,
  high: 3,
  critical: 4,
  emergency: 4,
};

const SEVERITY_LABEL: Record<string, string> = {
  normal: 'Normal',
  elevated: 'Elevated',
  high: 'High',
  critical: 'Critical',
  emergency: 'Emergency',
};

type DotState = 'danger' | 'warning' | 'info' | 'none';

function dotColor(s: DotState): string {
  switch (s) {
    case 'danger': return 'var(--state-danger)';
    case 'warning': return 'var(--state-warning)';
    case 'info': return 'var(--state-info)';
    default: return 'var(--text-disabled)';
  }
}

// ── Priority tuple ──────────────────────────────────────────────────────

interface PriorityTuple {
  emg: boolean;       // emergency / legal deadline
  min: boolean;       // involves a minor / vulnerable customer
  harm: number;       // credible imminent harm, 0-3
  virality: number | null;   // exposure score 0-100, null = unknown
  severity: number;   // severity class 1-4
  trusted: boolean | null;   // trusted notifier, null = unknown
  repeat: number;     // reopens / linked cases
}

function computeTuple(c: CaseRecord): PriorityTuple {
  const harm = Math.min(3, Math.round((c.consumerHarmScore / 10) * 3));
  return {
    emg: c.slaBreachAt !== null || c.severity === 'emergency',
    min: c.isVulnerableCustomer,
    harm: Number.isFinite(harm) ? harm : 0,
    virality: null,
    severity: SEVERITY_RANK[c.severity] ?? 1,
    trusted: null,
    repeat: c.reopenCount,
  };
}

// ── Component ───────────────────────────────────────────────────────────

export function WorkQueueView() {
  const { queueId } = useParams<{ queueId: string }>();
  const navigate = useNavigate();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<LoadingState>('loading');
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [selectedIdx, setSelectedIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  // ── Fetch ────────────────────────────────────────────────────────────
  const loadQueue = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const params: Record<string, string> = { limit: '100' };
      if (filter !== 'all') params.status = filter;
      const result = await api.getWorkQueue(queueId ?? 'my', params);
      setCases(result.cases);
      setTotal(result.total);
      setState(result.cases.length > 0 ? 'populated' : 'empty');
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        navigate('/');
        return;
      }
      if (navigator.onLine === false) {
        setState('offline');
      } else {
        setState('error');
        setError((err as Error).message);
      }
    }
  }, [queueId, filter, navigate]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // ── Debounced search (300ms) ─────────────────────────────────────────
  useEffect(() => {
    if (searchInput === search) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      setSearch(searchInput);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  // ── Filter change resets search + selection ──────────────────────────
  const onFilterChange = (key: string) => {
    setFilter(key);
    setSearchInput('');
    setSearch('');
    setSelectedIdx(0);
  };

  // ── Client-side filter + sort ────────────────────────────────────────
  const visibleCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = cases;
    if (q) {
      list = cases.filter(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          c.subject.toLowerCase().includes(q) ||
          c.type.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      let av: number;
      let bv: number;
      switch (sortKey) {
        case 'priority':
          av = 4 - a.priority;
          bv = 4 - b.priority;
          break;
        case 'severity':
          av = SEVERITY_RANK[a.severity] ?? 1;
          bv = SEVERITY_RANK[b.severity] ?? 1;
          break;
        case 'sla':
          av = a.slaDeadlineAt ? new Date(a.slaDeadlineAt).getTime() : Infinity;
          bv = b.slaDeadlineAt ? new Date(b.slaDeadlineAt).getTime() : Infinity;
          break;
        case 'value':
          av = a.financialValueGbp;
          bv = b.financialValueGbp;
          break;
        case 'age':
          av = new Date(a.createdAt).getTime();
          bv = new Date(b.createdAt).getTime();
          break;
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [cases, search, sortKey, sortDir]);

  // Keep selection in range when the list shrinks.
  useEffect(() => {
    if (selectedIdx > 0 && selectedIdx >= visibleCases.length) {
      setSelectedIdx(Math.max(0, visibleCases.length - 1));
    }
  }, [visibleCases.length, selectedIdx]);

  // Scroll the selected row into view during keyboard navigation.
  useEffect(() => {
    rowRefs.current[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  // ── Queue metrics (computed on the fetched set, not the search subset) ──
  const metrics = useMemo(() => {
    let breached = 0;
    let emergency = 0;
    let minor = 0;
    for (const c of cases) {
      if (c.slaBreachAt !== null) breached++;
      if (c.slaBreachAt !== null || c.severity === 'emergency' || (SEVERITY_RANK[c.severity] ?? 0) >= 4) emergency++;
      if (c.isVulnerableCustomer) minor++;
    }
    return { total: cases.length, breached, emergency, minor };
  }, [cases]);

  const showMetrics =
    state === 'populated' && (metrics.breached > 0 || metrics.emergency > 0 || metrics.minor > 0);

  // ── Sort handler ─────────────────────────────────────────────────────
  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(SORT_DEFAULTS[key]);
    }
    setSelectedIdx(0);
  };

  // ── Keyboard navigation ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const inSearch = el === searchRef.current;

      if (e.key === '/' && !inSearch) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        if (inSearch) {
          setSearchInput('');
          setSearch('');
          searchRef.current?.blur();
        } else {
          setSelectedIdx(0);
        }
        return;
      }
      if (inSearch) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, visibleCases.length - 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        const c = visibleCases[selectedIdx];
        if (c) navigate(`/cases/${c.id}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visibleCases, selectedIdx, navigate]);

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'new,triaged', label: 'New' },
    { key: 'assigned,investigating', label: 'Active' },
    { key: 'awaiting_customer,awaiting_provider,awaiting_internal', label: 'Waiting' },
    { key: 'ready_for_decision', label: 'Decision' },
    { key: 'escalated', label: 'Escalated' },
  ];

  const title = queueId === 'my' ? 'My Queue' : queueId === 'team' ? 'Team Queue' : 'All Cases';

  // Search produced no matches (distinct from an empty queue).
  const searchEmpty = state === 'populated' && search.trim() !== '' && visibleCases.length === 0;

  return (
    <div className="queue-view">
      <div className="queue-header">
        <span className="queue-header__title">
          {title}
          <span style={{ marginLeft: 'var(--space-2)', color: 'var(--text-tertiary)', fontSize: 'var(--text-metadata)' }}>
            {total} {total === 1 ? 'case' : 'cases'}
          </span>
        </span>
        <div className="queue-header__filters">
          <input
            ref={searchRef}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search case, subject, type…"
            aria-label="Search queue"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              padding: searchFocused
                ? 'calc(var(--space-1) - 1px) calc(var(--space-3) - 1px)'
                : 'var(--space-1) var(--space-3)',
              fontSize: 'var(--text-metadata)',
              color: 'var(--text-primary)',
              background: 'var(--bg-canvas)',
              border: searchFocused
                ? '2px solid var(--border-focus)'
                : '1px solid var(--border-standard)',
              borderRadius: 'var(--radius-sm)',
              outline: 'none',
              width: '220px',
              transition: 'border-color 80ms ease',
            }}
          />
          {searching && (
            <span style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)' }}>
              Searching…
            </span>
          )}
          {filters.map((f) => (
            <button
              key={f.key}
              className={`filter-chip${filter === f.key ? ' filter-chip--active' : ''}`}
              onClick={() => onFilterChange(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {showMetrics && <MetricsBar metrics={metrics} />}

      {state === 'loading' && (
        <StateMessage title="Loading queue…" description="Fetching cases from the operations API." />
      )}

      {state === 'empty' && (
        <StateMessage
          title="No cases in this view"
          description="Cases matching the current filter will appear here. Try changing the filter above."
        />
      )}

      {state === 'error' && (
        <StateMessage
          title="Failed to load queue"
          description={error ?? 'An unexpected error occurred. Retry or contact system operations.'}
        />
      )}

      {state === 'offline' && (
        <StateMessage
          title="Offline"
          description="The operations console cannot reach the API. Check your network connection."
        />
      )}

      {searchEmpty && (
        <StateMessage
          title={`No matches for “${search.trim()}”`}
          description="No cases in this queue match the search. Clear the search to see all cases."
        />
      )}

      {state === 'populated' && !searchEmpty && (
        <table className="data-table">
          <thead className="data-table__head">
            <tr>
              <SortTh label="Pri" keyName="priority" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="data-table__th">Type</th>
              <th className="data-table__th">Subject</th>
              <th className="data-table__th">State</th>
              <SortTh label="Sev" keyName="severity" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh label="SLA" keyName="sla" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh label="Value" keyName="value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh label="Age" keyName="age" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="data-table__th">Team</th>
            </tr>
          </thead>
          <tbody>
            {visibleCases.map((c, idx) => (
              <tr
                key={c.id}
                ref={(el) => {
                  rowRefs.current[idx] = el;
                }}
                className={`data-table__row${idx === selectedIdx ? ' data-table__row--selected' : ''}`}
                onClick={() => {
                  setSelectedIdx(idx);
                  navigate(`/cases/${c.id}`);
                }}
              >
                <td className="data-table__td">
                  <PriorityTuple c={c} />
                </td>
                <td className="data-table__td data-table__td--secondary">{c.type}</td>
                <td className="data-table__td">{c.subject}</td>
                <td className="data-table__td">
                  <CaseStatusBadge status={c.status} />
                </td>
                <td className="data-table__td">
                  <SeverityBadge severity={c.severity} />
                </td>
                <td className="data-table__td data-table__td--metadata">
                  <SlaIndicator deadline={c.slaDeadlineAt} breached={c.slaBreachAt !== null} />
                </td>
                <td className="data-table__td data-table__td--metadata">
                  {c.financialValueGbp > 0 ? `£${c.financialValueGbp.toFixed(2)}` : '—'}
                </td>
                <td className="data-table__td data-table__td--metadata">{ageLabel(c.createdAt)}</td>
                <td className="data-table__td data-table__td--secondary">{c.team ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div
        style={{
          marginTop: 'auto',
          padding: 'var(--space-2) var(--space-4)',
          borderTop: '1px solid var(--border-hairline)',
          fontSize: 'var(--text-metadata)',
          color: 'var(--text-tertiary)',
        }}
      >
        j/k navigate · Enter open · / search
      </div>
    </div>
  );
}

// ── Sortable table header ───────────────────────────────────────────────

function SortTh({
  label,
  keyName,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  keyName: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === keyName;
  return (
    <th
      className="data-table__th"
      onClick={() => onSort(keyName)}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      {label}
      {active && (
        <span style={{ marginLeft: '4px' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
      )}
    </th>
  );
}

// ── Metrics bar (flat row of text + dots, not cards) ────────────────────

function MetricsBar({ metrics }: { metrics: { total: number; breached: number; emergency: number; minor: number } }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-4)',
        alignItems: 'center',
        padding: 'var(--space-2) var(--space-4)',
        borderBottom: '1px solid var(--border-hairline)',
        fontSize: 'var(--text-metadata)',
        color: 'var(--text-tertiary)',
      }}
    >
      <MetricItem label={`${metrics.total} ${metrics.total === 1 ? 'case' : 'cases'}`} dot="none" />
      {metrics.breached > 0 && <MetricItem label={`${metrics.breached} breached`} dot="danger" />}
      {metrics.emergency > 0 && <MetricItem label={`${metrics.emergency} emergency`} dot="danger" />}
      {metrics.minor > 0 && <MetricItem label={`${metrics.minor} minor-safety`} dot="danger" />}
    </div>
  );
}

function MetricItem({ label, dot }: { label: string; dot: DotState }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
      <span
        style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor(dot), flexShrink: 0 }}
      />
      {label}
    </span>
  );
}

// ── Priority tuple (replaces the opaque P1/P2/P3 score) ─────────────────

function PriorityTuple({ c }: { c: CaseRecord }) {
  const t = computeTuple(c);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        color: 'var(--text-tertiary)',
        whiteSpace: 'nowrap',
      }}
    >
      <TupleToken label="EMG" dot={t.emg ? 'danger' : 'none'} />
      <TupleToken label="MIN" dot={t.min ? 'danger' : 'none'} />
      <TupleToken
        label={`H${t.harm}`}
        dot={t.harm === 3 ? 'danger' : t.harm === 2 ? 'warning' : 'none'}
      />
      <TupleToken
        label={t.virality === null ? 'V—' : `V${t.virality}`}
        dot={
          t.virality === null
            ? 'none'
            : t.virality >= 70
              ? 'danger'
              : t.virality >= 40
                ? 'warning'
                : 'none'
        }
      />
      <TupleToken
        label={`S${t.severity}`}
        dot={t.severity === 4 ? 'danger' : t.severity === 3 ? 'warning' : 'none'}
      />
      <TupleToken label="TR" dot={t.trusted ? 'info' : 'none'} />
      <TupleToken
        label={`R${t.repeat}`}
        dot={t.repeat >= 3 ? 'danger' : t.repeat >= 1 ? 'warning' : 'none'}
      />
    </span>
  );
}

function TupleToken({ label, dot }: { label: string; dot: DotState }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
      <span
        style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor(dot), flexShrink: 0 }}
      />
      {label}
    </span>
  );
}

// ── Severity badge (readable label + dot, sortable column) ──────────────

function SeverityBadge({ severity }: { severity: string }) {
  const rank = SEVERITY_RANK[severity] ?? 1;
  const color =
    rank >= 4 ? 'var(--state-danger)' : rank === 3 ? 'var(--state-warning)' : 'var(--text-disabled)';
  const label = SEVERITY_LABEL[severity] ?? severity;
  return (
    <span
      className="status-badge"
      style={{ color: rank >= 3 ? color : 'var(--text-secondary)' }}
    >
      <span className="status-badge__dot" style={{ background: color }} />
      {label}
    </span>
  );
}

// ── Case status badge (text + icon) ─────────────────────────────────────

function CaseStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    new: { label: 'New', cls: 'status-badge--info' },
    triaged: { label: 'Triaged', cls: 'status-badge--info' },
    assigned: { label: 'Assigned', cls: '' },
    investigating: { label: 'Investigating', cls: '' },
    awaiting_customer: { label: 'Awaiting customer', cls: 'status-badge--warning' },
    awaiting_provider: { label: 'Awaiting provider', cls: 'status-badge--warning' },
    awaiting_internal: { label: 'Awaiting internal', cls: 'status-badge--warning' },
    ready_for_decision: { label: 'Ready for decision', cls: 'status-badge--warning' },
    resolved: { label: 'Resolved', cls: 'status-badge--success' },
    closed: { label: 'Closed', cls: '' },
    escalated: { label: 'Escalated', cls: 'status-badge--danger' },
  };
  const s = map[status] ?? { label: status, cls: '' };
  return (
    <span className={`status-badge ${s.cls}`}>
      <span className="status-badge__dot" />
      {s.label}
    </span>
  );
}

// ── SLA indicator ───────────────────────────────────────────────────────

function SlaIndicator({ deadline, breached }: { deadline: string | null; breached: boolean }) {
  if (!deadline) return <span>—</span>;
  const dl = new Date(deadline);
  const now = new Date();
  const hoursLeft = (dl.getTime() - now.getTime()) / 3_600_000;

  if (breached) {
    return (
      <span className="status-badge status-badge--danger">
        <span className="status-badge__dot" />
        Breached
      </span>
    );
  }

  if (hoursLeft < 4) {
    return (
      <span className="status-badge status-badge--warning">
        <span className="status-badge__dot" />
        {hoursLeft < 1 ? `${Math.round(hoursLeft * 60)}m` : `${hoursLeft.toFixed(1)}h`}
      </span>
    );
  }

  return <span>{hoursLeft.toFixed(0)}h</span>;
}

// ── State message (loading, empty, error, offline) ──────────────────────

function StateMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="state-message">
      <div className="state-message__title">{title}</div>
      <div className="state-message__description">{description}</div>
    </div>
  );
}

// ── Age label (compact: 12m / 5h / 3d) ──────────────────────────────────

function ageLabel(created: string): string {
  const ms = Date.now() - new Date(created).getTime();
  if (ms < 0) return '0m';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
