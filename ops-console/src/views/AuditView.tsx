import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type AuditEvent } from '../api.js';

// ── Audit View ──────────────────────────────────────────────────────────
//
// Read-only investigation surface. Shows the immutable audit chain with
// sequence numbers, hashes, and chain verification status.
//
// Access to audit is itself audited (logged by the backend).
// PII/secrets are absent from event payloads — only hashes.

type LoadingState = 'loading' | 'populated' | 'empty' | 'error' | 'denied';

export function AuditView() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<LoadingState>('loading');
  const [chainStatus, setChainStatus] = useState<{
    verified: boolean;
    gaps: number[];
    hashMismatches: number[];
    totalEvents: number;
    lastSequence: number;
  } | null>(null);
  const [filter, setFilter] = useState<string>('');

  const loadEvents = useCallback(async () => {
    setState('loading');
    try {
      const params: Record<string, string> = { limit: '100' };
      if (filter) params.action = filter;
      const result = await api.getAuditEvents(params);
      setEvents(result.events);
      setTotal(result.total);
      setState(result.events.length > 0 ? 'populated' : 'empty');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 401) { navigate('/'); return; }
        if (err.statusCode === 403) { setState('denied'); return; }
      }
      setState('error');
    }
  }, [filter, navigate]);

  const verifyChain = useCallback(async () => {
    try {
      const result = await api.verifyAuditChain();
      setChainStatus(result);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadEvents();
    verifyChain();
  }, [loadEvents, verifyChain]);

  return (
    <div className="queue-view">
      <div className="queue-header">
        <span className="queue-header__title">
          Audit Chain
          <span style={{ marginLeft: 'var(--space-2)', color: 'var(--text-tertiary)', fontSize: 'var(--text-metadata)' }}>
            {total} events
          </span>
        </span>
        <div className="queue-header__filters">
          {chainStatus && (
            <span className={`status-badge ${chainStatus.verified ? 'status-badge--success' : 'status-badge--danger'}`}>
              <span className="status-badge__dot" />
              {chainStatus.verified ? 'Chain verified' : 'Chain broken'}
            </span>
          )}
          <input
            className="form-field__input"
            style={{ width: '180px', fontSize: 'var(--text-metadata)' }}
            placeholder="Filter by action…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button className="btn btn--secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={verifyChain}>
            Verify chain
          </button>
        </div>
      </div>

      {chainStatus && !chainStatus.verified && (
        <div className="command-preview" style={{ margin: 'var(--space-3)', borderColor: 'var(--state-danger)' }}>
          <div className="command-preview__label" style={{ color: 'var(--state-danger)' }}>Chain integrity alert</div>
          <div className="command-preview__effect">
            {chainStatus.gaps.length > 0 && `Gaps at sequences: ${chainStatus.gaps.slice(0, 10).join(', ')}${chainStatus.gaps.length > 10 ? '…' : ''}`}
          </div>
          <div className="command-preview__detail">
            {chainStatus.hashMismatches.length > 0 && `Hash mismatches at: ${chainStatus.hashMismatches.slice(0, 10).join(', ')}`}
          </div>
        </div>
      )}

      {state === 'loading' && (
        <StateMessage title="Loading audit events…" description="" />
      )}
      {state === 'empty' && (
        <StateMessage title="No audit events" description="No events match the current filter." />
      )}
      {state === 'error' && (
        <StateMessage title="Failed to load" description="Could not fetch audit events." />
      )}
      {state === 'denied' && (
        <StateMessage title="Permission denied" description="You do not have audit.read permission." />
      )}

      {state === 'populated' && (
        <div>
          <div className="audit-event" style={{ fontWeight: 'var(--weight-medium)', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.04em' }}>
            <span>Sequence</span>
            <span>Principal</span>
            <span>Action</span>
            <span>Outcome</span>
            <span>Hash</span>
          </div>
          {events.map((evt) => (
            <div key={evt.id} className="audit-event">
              <span style={{ color: 'var(--text-tertiary)' }}>#{evt.sequenceNumber}</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {evt.principalType === 'workforce' ? 'WF' : 'SVC'}
                {evt.principalId ? `:${evt.principalId.slice(-8)}` : ''}
              </span>
              <span className="audit-event__action">{evt.action}</span>
              <span>
                <span className={`status-badge ${evt.outcome === 'success' ? 'status-badge--success' : evt.outcome === 'failed' ? 'status-badge--danger' : 'status-badge--unknown'}`}>
                  <span className="status-badge__dot" />
                  {evt.unknownOutcome ? 'unknown' : evt.outcome}
                </span>
              </span>
              <span className="audit-event__hash">{evt.eventHash.slice(0, 12)}…</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StateMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="state-message">
      <div className="state-message__title">{title}</div>
      {description && <div className="state-message__description">{description}</div>}
    </div>
  );
}
