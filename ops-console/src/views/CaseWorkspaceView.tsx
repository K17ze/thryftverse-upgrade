import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError, type CaseRecord, type CommandRecord, type AuditEvent, type EvidenceItem, type DecisionRecord, type CommunicationRecord } from '../api.js';

// ── Case Workspace View ─────────────────────────────────────────────────
//
// The operator's primary work surface. Reading order is deliberate:
//   header → evidence → state timeline → audit → communications →
//   linked cases → notes  |  action rail (SLA, decision, transitions).
//
// Evidence is the dominant object — the visual anchor of the workspace.
// Sensitive media is blurred by default; a reasoned reveal is audited.
// Decisions are policy-bound: reason code, policy version, duration,
// territorial scope, automated-means disclosure.
//
// Flat canvas, hairline separators, no card-on-card. One radius grammar
// (6px utility / 10px media). Three type sizes. Status = text + dot.

type ReasonCode = { code: string; userFacingLabel: string; severityClass: number; dsaCategory: string | null; ukPriorityOffence: string | null };

type LoadingState = 'loading' | 'populated' | 'empty' | 'error' | 'denied' | 'offline';

const TERRITORIAL_SCOPES = ['GB', 'EU', 'US', 'AU', 'CA', 'GLOBAL'];

const REVEAL_AUTO_REMASK_MS = 45_000;

export function CaseWorkspaceView() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [commands, setCommands] = useState<CommandRecord[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [communications, setCommunications] = useState<CommunicationRecord[]>([]);
  const [linkedCases, setLinkedCases] = useState<CaseRecord[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  const [reasonCodes, setReasonCodes] = useState<ReasonCode[]>([]);

  const [state, setState] = useState<LoadingState>('loading');
  const [error, setError] = useState<string | null>(null);

  // Partial-load errors: case loaded but a sub-resource failed.
  const [partialErrors, setPartialErrors] = useState<Record<string, string>>({});

  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const [slaReason, setSlaReason] = useState('');
  const [slaBusy, setSlaBusy] = useState(false);

  const loadCase = useCallback(async () => {
    setState('loading');
    setPartialErrors({});
    try {
      const result = await api.getCase(caseId!);
      setCaseRecord(result.case);
      setState('populated');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 401) { navigate('/'); return; }
        if (err.statusCode === 403) { setState('denied'); return; }
        if (err.statusCode === 404) { setState('empty'); return; }
        if (err.statusCode === 0 || err.statusCode >= 500) { setState('offline'); return; }
      }
      if (err instanceof TypeError) { setState('offline'); return; }
      setState('error');
      setError((err as Error).message);
      return;
    }

    // Sub-resources load independently — a failure here is a partial state,
    // not a full-screen error. The case is still usable.
    const cid = caseId!;
    const attempts: Array<{ key: string; fn: () => Promise<unknown>; setter: (v: unknown) => void }> = [
      {
        key: 'commands',
        fn: () => api.listCommands({ caseId: cid, limit: '20' }),
        setter: (v) => setCommands((v as { commands: CommandRecord[] }).commands),
      },
      {
        key: 'evidence',
        fn: () => api.getCaseEvidence(cid),
        setter: (v) => setEvidence((v as { evidence: EvidenceItem[] }).evidence),
      },
      {
        key: 'decisions',
        fn: () => api.getCaseDecisions(cid),
        setter: (v) => setDecisions((v as { decisions: DecisionRecord[] }).decisions),
      },
      {
        key: 'communications',
        fn: () => api.getCaseCommunications(cid),
        setter: (v) => setCommunications((v as { communications: CommunicationRecord[] }).communications),
      },
      {
        key: 'linked',
        fn: () => api.getLinkedCases(cid),
        setter: (v) => setLinkedCases((v as { cases: CaseRecord[] }).cases),
      },
      {
        key: 'audit',
        fn: () => api.getAuditEvents({ caseId: cid, limit: '50' }),
        setter: (v) => setAuditEvents((v as { events: AuditEvent[] }).events),
      },
    ];

    const errors: Record<string, string> = {};
    await Promise.all(
      attempts.map(async (a) => {
        try {
          const res = await a.fn();
          a.setter(res);
        } catch (err) {
          errors[a.key] = (err as Error).message;
        }
      }),
    );
    if (Object.keys(errors).length > 0) setPartialErrors(errors);
  }, [caseId, navigate]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  useEffect(() => {
    api.getSafetyReasonCodes().then(result => setReasonCodes(result.reasonCodes)).catch(() => {});
  }, []);

  const handleAddNote = async () => {
    if (!noteText.trim() || !caseId) return;
    setNoteSaving(true);
    try {
      await api.addNote(caseId, noteText.trim());
      setNoteText('');
      loadCase();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setNoteSaving(false);
    }
  };

  const handleTransition = async (toStatus: string, reason: string) => {
    if (!caseId) return;
    try {
      const result = await api.transitionCase(caseId, toStatus, reason);
      setCaseRecord(result.case);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSlaPause = async () => {
    if (!caseId || !slaReason.trim()) return;
    setSlaBusy(true);
    try {
      const result = await api.pauseSla(caseId, slaReason.trim());
      setCaseRecord(result.case);
      setSlaReason('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSlaBusy(false);
    }
  };

  const handleSlaResume = async () => {
    if (!caseId) return;
    setSlaBusy(true);
    try {
      const result = await api.resumeSla(caseId);
      setCaseRecord(result.case);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSlaBusy(false);
    }
  };

  // ── State gates ──────────────────────────────────────────────────────

  if (state === 'loading') {
    return <StateMessage title="Loading case…" description="Fetching case details and linked evidence." />;
  }
  if (state === 'empty') {
    return <StateMessage title="Case not found" description="This case may have been deleted or the ID is incorrect." />;
  }
  if (state === 'error') {
    return <StateMessage title="Failed to load case" description={error ?? 'Unexpected error'} />;
  }
  if (state === 'denied') {
    return <StateMessage title="Permission denied" description="You do not have permission to view this case. Request access from your team lead." />;
  }
  if (state === 'offline') {
    return <StateMessage title="You're offline" description="The case could not be loaded. Check your connection and try again." />;
  }
  if (!caseRecord) return null;

  const ageHours = (Date.now() - new Date(caseRecord.createdAt).getTime()) / 3_600_000;

  return (
    <div className="case-workspace">
      {/* ── Case detail ─────────────────────────────────────────────── */}
      <div className="case-detail">
        <div className="case-detail__header">
          <div className="case-detail__subject">{caseRecord.subject}</div>
          <div className="case-detail__meta">
            <span>{caseRecord.id}</span>
            <span>·</span>
            <span>{caseRecord.type}</span>
            <span>·</span>
            <span>{caseRecord.legalEntity}</span>
            <span>·</span>
            <span>Age {ageHours.toFixed(0)}h</span>
            {caseRecord.isVulnerableCustomer && (
              <>
                <span>·</span>
                <span style={{ color: 'var(--state-warning)' }}>Vulnerable customer</span>
              </>
            )}
          </div>
        </div>

        {/* Evidence — the dominant object */}
        <EvidenceSection
          caseId={caseRecord.id}
          evidence={evidence}
          error={partialErrors.evidence}
        />

        {/* State timeline */}
        <div className="case-detail__section">
          <div className="case-detail__section-title">State</div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {['new', 'triaged', 'assigned', 'investigating', 'ready_for_decision', 'resolved', 'closed'].map((s) => {
              const isCurrent = caseRecord.status === s;
              const isPast = getStateOrder(caseRecord.status) > getStateOrder(s);
              return (
                <span
                  key={s}
                  className="status-badge"
                  style={{
                    opacity: isCurrent || isPast ? 1 : 0.3,
                    color: isCurrent ? 'var(--state-info)' : 'var(--text-secondary)',
                  }}
                >
                  <span className="status-badge__dot" style={{ background: isCurrent ? 'var(--state-info)' : 'var(--text-tertiary)' }} />
                  {formatStateLabel(s)}
                </span>
              );
            })}
          </div>
        </div>

        {/* Description */}
        {caseRecord.description && (
          <div className="case-detail__section">
            <div className="case-detail__section-title">Description</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>
              {caseRecord.description}
            </p>
          </div>
        )}

        {/* Financial & harm context */}
        {(caseRecord.financialValueGbp > 0 || caseRecord.consumerHarmScore > 0) && (
          <div className="case-detail__section">
            <div className="case-detail__section-title">Financial &amp; Harm</div>
            <div style={{ display: 'flex', gap: 'var(--space-6)', fontSize: 'var(--text-body)' }}>
              {caseRecord.financialValueGbp > 0 && (
                <div>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-metadata)' }}>Value at stake</span>
                  <div>£{caseRecord.financialValueGbp.toFixed(2)}</div>
                </div>
              )}
              {caseRecord.consumerHarmScore > 0 && (
                <div>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-metadata)' }}>Harm score</span>
                  <div style={{ color: caseRecord.consumerHarmScore >= 5 ? 'var(--state-warning)' : 'var(--text-primary)' }}>
                    {caseRecord.consumerHarmScore}/10
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audit timeline */}
        <AuditSection events={auditEvents} error={partialErrors.audit} />

        {/* Communications */}
        <CommunicationsSection
          communications={communications}
          error={partialErrors.communications}
        />

        {/* Linked cases */}
        <LinkedCasesSection
          cases={linkedCases}
          error={partialErrors.linked}
          onNavigate={(id) => navigate(`/cases/${id}`)}
        />

        {/* Linked commands */}
        {commands.length > 0 && (
          <div className="case-detail__section">
            <div className="case-detail__section-title">Commands</div>
            <table className="data-table">
              <thead className="data-table__head">
                <tr>
                  <th className="data-table__th">Type</th>
                  <th className="data-table__th">State</th>
                  <th className="data-table__th">Risk</th>
                  <th className="data-table__th">Amount</th>
                  <th className="data-table__th">Proposed</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((cmd) => (
                  <tr key={cmd.id} className="data-table__row" onClick={() => navigate('/commands')}>
                    <td className="data-table__td">{cmd.commandType}</td>
                    <td className="data-table__td">
                      <CommandStateBadge state={cmd.state} />
                    </td>
                    <td className="data-table__td data-table__td--metadata">{cmd.riskTier}</td>
                    <td className="data-table__td data-table__td--metadata">
                      {cmd.amountGbp ? `£${cmd.amountGbp.toFixed(2)}` : '—'}
                    </td>
                    <td className="data-table__td data-table__td--metadata">
                      {new Date(cmd.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Prior decisions */}
        {decisions.length > 0 && (
          <div className="case-detail__section">
            <div className="case-detail__section-title">Decisions</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-metadata)' }}>
              {decisions.map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '150px 120px 1fr 100px',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-2) var(--space-1)',
                    borderBottom: '1px solid var(--border-hairline)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>{new Date(d.createdAt).toLocaleString()}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{d.decisionType.replace(/_/g, ' ')}</span>
                  <span>{d.reasonCode}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{d.policyVersion ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add note */}
        <div className="case-detail__section">
          <div className="case-detail__section-title">Note</div>
          <textarea
            style={{
              width: '100%',
              minHeight: '80px',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--text-body)',
              color: 'var(--text-primary)',
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-standard)',
              borderRadius: 'var(--radius-sm)',
              resize: 'vertical',
              outline: 'none',
            }}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Internal note (append-only, corrections link never overwrite)…"
            disabled={noteSaving}
          />
          <button
            className="btn btn--secondary"
            style={{ marginTop: 'var(--space-2)' }}
            onClick={handleAddNote}
            disabled={noteSaving || !noteText.trim()}
          >
            {noteSaving ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </div>

      {/* ── Action rail ─────────────────────────────────────────────── */}
      <div className="action-rail">
        <div className="action-rail__section">
          <div className="action-rail__title">Current State</div>
          <CaseStatusBadge status={caseRecord.status} />
        </div>

        {/* SLA controls */}
        <SlaSection
          caseRecord={caseRecord}
          slaReason={slaReason}
          setSlaReason={setSlaReason}
          onPause={handleSlaPause}
          onResume={handleSlaResume}
          busy={slaBusy}
        />

        {/* Decision composer trigger */}
        <div className="action-rail__section">
          <div className="action-rail__title">Decision</div>
          <button
            className="btn btn--secondary"
            style={{ width: '100%' }}
            onClick={() => setDecisionOpen(true)}
          >
            Record decision
          </button>
        </div>

        {/* State transitions */}
        <div className="action-rail__section">
          <div className="action-rail__title">Actions</div>

          {canTransition(caseRecord.status, 'triaged') && (
            <ActionButton
              label="Triage"
              policy="cases.decide"
              onClick={() => handleTransition('triaged', 'Triaged by operator')}
            />
          )}

          {canTransition(caseRecord.status, 'investigating') && (
            <ActionButton
              label="Start investigating"
              policy="cases.decide"
              onClick={() => handleTransition('investigating', 'Investigation started')}
            />
          )}

          {canTransition(caseRecord.status, 'ready_for_decision') && (
            <ActionButton
              label="Mark ready for decision"
              policy="cases.decide"
              onClick={() => handleTransition('ready_for_decision', 'Ready for decision')}
            />
          )}

          {canTransition(caseRecord.status, 'resolved') && (
            <ActionButton
              label="Resolve"
              policy="cases.decide"
              onClick={() => handleTransition('resolved', 'Resolved by operator')}
            />
          )}

          {canTransition(caseRecord.status, 'closed') && (
            <ActionButton
              label="Close case"
              policy="cases.decide"
              onClick={() => handleTransition('closed', 'Closed by operator')}
            />
          )}

          {canTransition(caseRecord.status, 'escalated') && (
            <ActionButton
              label="Escalate"
              policy="cases.decide"
              isDanger
              onClick={() => handleTransition('escalated', 'Escalated by operator')}
            />
          )}

          {!canAnyTransition(caseRecord.status) && (
            <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', padding: 'var(--space-2) 0' }}>
              No actions available in current state.
            </div>
          )}
        </div>

        {/* Case details */}
        <div className="action-rail__section">
          <div className="action-rail__title">Details</div>
          <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', lineHeight: '1.8' }}>
            <div>Created {new Date(caseRecord.createdAt).toLocaleString()}</div>
            <div>Updated {new Date(caseRecord.updatedAt).toLocaleString()}</div>
            <div>Source {caseRecord.source}</div>
            <div>Priority P{caseRecord.priority}</div>
            {caseRecord.ownerId && <div>Owner {caseRecord.ownerId}</div>}
            {caseRecord.team && <div>Team {caseRecord.team}</div>}
          </div>
        </div>
      </div>

      {/* Decision composer modal */}
      {decisionOpen && (
        <DecisionComposer
          caseId={caseRecord.id}
          legalEntity={caseRecord.legalEntity}
          reasonCodes={reasonCodes}
          saving={decisionSaving}
          error={decisionError}
          onClose={() => { setDecisionOpen(false); setDecisionError(null); }}
          onSubmit={async (body) => {
            setDecisionSaving(true);
            setDecisionError(null);
            try {
              await api.recordDecision(caseRecord.id, body);
              setDecisionOpen(false);
              loadCase();
            } catch (err) {
              setDecisionError((err as Error).message);
            } finally {
              setDecisionSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}

// ── Evidence section (dominant object) ──────────────────────────────────

function EvidenceSection({
  caseId,
  evidence,
  error,
}: {
  caseId: string;
  evidence: EvidenceItem[];
  error?: string;
}) {
  if (error && evidence.length === 0) {
    return (
      <div className="case-detail__section">
        <div className="case-detail__section-title">Evidence</div>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--state-danger)' }}>
          Failed to load evidence: {error}
        </div>
      </div>
    );
  }

  if (evidence.length === 0) {
    return (
      <div className="case-detail__section">
        <div className="case-detail__section-title">Evidence</div>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)' }}>
          No evidence attached.
        </div>
      </div>
    );
  }

  return (
    <div className="case-detail__section">
      <div className="case-detail__section-title">Evidence</div>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          overflowX: 'auto',
          paddingBottom: 'var(--space-2)',
        }}
      >
        {evidence.map((item) => (
          <EvidenceCard key={item.id} caseId={caseId} item={item} />
        ))}
      </div>
    </div>
  );
}

function EvidenceCard({ caseId, item }: { caseId: string; item: EvidenceItem }) {
  const isSensitive = item.sensitivity === 'restricted' || item.sensitivity === 'sensitive';
  const isMedia = item.objectType === 'image' || item.objectType === 'video' || item.objectType === 'screenshot';
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const remaskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doReveal = async () => {
    setConfirming(false);
    setRevealError(null);
    try {
      await api.revealPii('evidence', item.id, 'media', 'case_review', caseId);
      setRevealed(true);
      if (remaskTimer.current) clearTimeout(remaskTimer.current);
      remaskTimer.current = setTimeout(() => setRevealed(false), REVEAL_AUTO_REMASK_MS);
    } catch (err) {
      setRevealError((err as Error).message);
    }
  };

  useEffect(() => {
    return () => { if (remaskTimer.current) clearTimeout(remaskTimer.current); };
  }, []);

  const sensitivityColour: Record<EvidenceItem['sensitivity'], string> = {
    standard: 'var(--text-tertiary)',
    sensitive: 'var(--state-warning)',
    restricted: 'var(--state-danger)',
  };

  return (
    <div
      style={{
        flex: '0 0 auto',
        width: isMedia ? '260px' : '420px',
        maxWidth: '420px',
        border: '1px solid var(--border-hairline)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: 'var(--bg-surface)',
      }}
    >
      {/* Media or text body */}
      {isMedia ? (
        <div style={{ position: 'relative', height: '180px', background: 'var(--bg-canvas)' }}>
          {item.objectRef ? (
            <img
              src={item.objectRef}
              alt={item.objectType}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: isSensitive && !revealed ? 'blur(8px)' : 'none',
                transition: 'filter 120ms ease',
              }}
            />
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--text-metadata)',
                filter: isSensitive && !revealed ? 'blur(8px)' : 'none',
              }}
            >
              {item.objectType} placeholder
            </div>
          )}
          {isSensitive && !revealed && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <button
                className="btn btn--secondary"
                style={{ fontSize: 'var(--text-metadata)', padding: 'var(--space-1) var(--space-3)' }}
                onClick={() => setConfirming(true)}
              >
                Reveal
              </button>
            </div>
          )}
          {revealed && (
            <div
              style={{
                position: 'absolute',
                top: 'var(--space-1)',
                right: 'var(--space-1)',
                fontSize: 'var(--text-metadata)',
                color: 'var(--state-warning)',
                background: 'var(--bg-surface)',
                padding: '2px var(--space-2)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-hairline)',
              }}
            >
              Unmasked
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            padding: 'var(--space-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-metadata)',
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            maxHeight: '180px',
            overflowY: 'auto',
            background: 'var(--bg-canvas)',
          }}
        >
          {item.objectRef ?? '(empty)'}
        </div>
      )}

      {/* Metadata strip */}
      <div
        style={{
          padding: 'var(--space-2) var(--space-3)',
          borderTop: '1px solid var(--border-hairline)',
          fontSize: 'var(--text-metadata)',
          color: 'var(--text-tertiary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{item.objectType}</span>
          <span>·</span>
          <span style={{ textTransform: 'capitalize' }}>{item.source.replace(/_/g, ' ')}</span>
          <span>·</span>
          <span style={{ color: sensitivityColour[item.sensitivity] }}>
            <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: sensitivityColour[item.sensitivity], marginRight: '4px', verticalAlign: 'middle' }} />
            {item.sensitivity}
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
          {(item.objectHash ?? '').slice(0, 12)} · {new Date(item.createdAt).toLocaleDateString()}
        </div>
        {revealError && (
          <div style={{ color: 'var(--state-danger)' }}>Reveal failed: {revealError}</div>
        )}
      </div>

      {/* Reveal confirmation dialog */}
      {confirming && (
        <ModalOverlay onClose={() => setConfirming(false)}>
          <div style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-semibold)', marginBottom: 'var(--space-2)' }}>
            Reveal sensitive media
          </div>
          <p style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
            Revealing sensitive media is audited. Your name, timestamp, and reason will be recorded. The media auto-re-masks after {Math.round(REVEAL_AUTO_REMASK_MS / 1000)}s. Continue?
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            <button className="btn btn--secondary" onClick={() => setConfirming(false)}>Cancel</button>
            <button className="btn btn--primary" onClick={doReveal}>Reveal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ── Audit timeline ──────────────────────────────────────────────────────

function AuditSection({ events, error }: { events: AuditEvent[]; error?: string }) {
  if (error && events.length === 0) {
    return (
      <div className="case-detail__section">
        <div className="case-detail__section-title">Audit</div>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--state-danger)' }}>
          Failed to load audit trail: {error}
        </div>
      </div>
    );
  }
  if (events.length === 0) return null;

  const sorted = [...events].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return (
    <div className="case-detail__section">
      <div className="case-detail__section-title">Audit</div>
      <div style={{ borderTop: '1px solid var(--border-hairline)' }}>
        {sorted.map((ev) => (
          <div key={ev.id} className="audit-event">
            <span>{new Date(ev.occurredAt).toLocaleString()}</span>
            <span style={{ color: 'var(--text-tertiary)' }}>{ev.principalType}</span>
            <span className="audit-event__action">{ev.action}</span>
            <span style={{ color: ev.outcome === 'success' ? 'var(--state-success)' : ev.outcome === 'failure' ? 'var(--state-danger)' : 'var(--text-tertiary)' }}>
              {ev.outcome}
            </span>
            <span className="audit-event__hash">{ev.eventHash.slice(0, 8)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Communications ──────────────────────────────────────────────────────

function CommunicationsSection({
  communications,
  error,
}: {
  communications: CommunicationRecord[];
  error?: string;
}) {
  if (error && communications.length === 0) {
    return (
      <div className="case-detail__section">
        <div className="case-detail__section-title">Communications</div>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--state-danger)' }}>
          Failed to load communications: {error}
        </div>
      </div>
    );
  }
  if (communications.length === 0) return null;

  const statusColour: Record<string, string> = {
    pending: 'var(--text-tertiary)',
    sent: 'var(--state-info)',
    delivered: 'var(--state-success)',
    failed: 'var(--state-danger)',
    read: 'var(--state-success)',
  };

  return (
    <div className="case-detail__section">
      <div className="case-detail__section-title">Communications</div>
      <div style={{ borderTop: '1px solid var(--border-hairline)' }}>
        {communications.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 80px 1fr 100px 140px',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              borderBottom: '1px solid var(--border-hairline)',
              fontSize: 'var(--text-metadata)',
              color: 'var(--text-secondary)',
            }}
          >
            <span>{new Date(c.createdAt).toLocaleString()}</span>
            <span style={{ textTransform: 'capitalize' }}>{c.channel}</span>
            <span style={{ color: 'var(--text-primary)' }}>{c.templateId ?? c.direction}</span>
            <span style={{ textTransform: 'capitalize' }}>{c.direction}</span>
            <span style={{ color: statusColour[c.deliveryStatus] ?? 'var(--text-tertiary)' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: statusColour[c.deliveryStatus] ?? 'var(--text-tertiary)', marginRight: '4px', verticalAlign: 'middle' }} />
              {c.deliveryStatus}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Linked cases ────────────────────────────────────────────────────────

function LinkedCasesSection({
  cases,
  error,
  onNavigate,
}: {
  cases: CaseRecord[];
  error?: string;
  onNavigate: (id: string) => void;
}) {
  if (error && cases.length === 0) {
    return (
      <div className="case-detail__section">
        <div className="case-detail__section-title">Linked cases</div>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--state-danger)' }}>
          Failed to load linked cases: {error}
        </div>
      </div>
    );
  }
  if (cases.length === 0) return null;

  return (
    <div className="case-detail__section">
      <div className="case-detail__section-title">Linked cases</div>
      <div style={{ borderTop: '1px solid var(--border-hairline)' }}>
        {cases.map((c) => (
          <div
            key={c.id}
            onClick={() => onNavigate(c.id)}
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 120px',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              borderBottom: '1px solid var(--border-hairline)',
              fontSize: 'var(--text-metadata)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontFamily: 'var(--font-mono)' }}>{c.id}</span>
            <span style={{ color: 'var(--text-primary)' }}>{c.subject}</span>
            <span><CaseStatusBadge status={c.status} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SLA controls ────────────────────────────────────────────────────────

function SlaSection({
  caseRecord,
  slaReason,
  setSlaReason,
  onPause,
  onResume,
  busy,
}: {
  caseRecord: CaseRecord;
  slaReason: string;
  setSlaReason: (v: string) => void;
  onPause: () => void;
  onResume: () => void;
  busy: boolean;
}) {
  if (!caseRecord.slaDeadlineAt && !caseRecord.slaPausedAt) return null;

  const deadline = caseRecord.slaDeadlineAt ? new Date(caseRecord.slaDeadlineAt).getTime() : 0;
  const now = Date.now();
  const remainingMs = deadline - now;
  const breached = caseRecord.slaBreachAt !== null;
  const paused = caseRecord.slaPausedAt !== null;

  const remainingColour = breached
    ? 'var(--state-danger)'
    : remainingMs < 0
      ? 'var(--state-danger)'
      : remainingMs < 86_400_000
        ? 'var(--state-warning)'
        : 'var(--text-primary)';

  const formatRemaining = (ms: number) => {
    const abs = Math.abs(ms);
    const h = Math.floor(abs / 3_600_000);
    const m = Math.floor((abs % 3_600_000) / 60_000);
    return `${ms < 0 ? '-' : ''}${h}h ${m}m`;
  };

  return (
    <div className="action-rail__section">
      <div className="action-rail__title">SLA</div>
      <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', lineHeight: '1.8', marginBottom: 'var(--space-2)' }}>
        {caseRecord.slaDeadlineAt && (
          <div>Deadline {new Date(caseRecord.slaDeadlineAt).toLocaleString()}</div>
        )}
        {!paused && caseRecord.slaDeadlineAt && (
          <div style={{ color: remainingColour }}>
            {breached ? 'Breached' : 'Remaining'} {formatRemaining(remainingMs)}
          </div>
        )}
        {paused && (
          <div style={{ color: 'var(--state-warning)' }}>
            Paused since {new Date(caseRecord.slaPausedAt!).toLocaleString()}
          </div>
        )}
        {caseRecord.slaBreachAt && (
          <div style={{ color: 'var(--state-danger)' }}>
            Breached {new Date(caseRecord.slaBreachAt).toLocaleString()}
          </div>
        )}
      </div>

      {paused ? (
        <button
          className="btn btn--secondary"
          style={{ width: '100%' }}
          onClick={onResume}
          disabled={busy}
        >
          {busy ? '…' : 'Resume SLA'}
        </button>
      ) : (
        <>
          <input
            type="text"
            placeholder="Pause reason (customer/provider response)…"
            value={slaReason}
            onChange={(e) => setSlaReason(e.target.value)}
            style={{
              width: '100%',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--text-metadata)',
              color: 'var(--text-primary)',
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-standard)',
              borderRadius: 'var(--radius-sm)',
              outline: 'none',
              marginBottom: 'var(--space-2)',
            }}
          />
          <button
            className="btn btn--secondary"
            style={{ width: '100%' }}
            onClick={onPause}
            disabled={busy || !slaReason.trim()}
          >
            {busy ? '…' : 'Pause SLA'}
          </button>
        </>
      )}
    </div>
  );
}

// ── Decision composer ───────────────────────────────────────────────────

function DecisionComposer({
  caseId,
  legalEntity,
  reasonCodes,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  caseId: string;
  legalEntity: string;
  reasonCodes: ReasonCode[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [decisionType, setDecisionType] = useState<'no_violation' | 'restrict' | 'escalate' | 'emergency_hold'>('restrict');
  const [reasonCode, setReasonCode] = useState(reasonCodes[0]?.code ?? '');
  const [duration, setDuration] = useState<'permanent' | 'temporary'>('temporary');
  const [durationUntil, setDurationUntil] = useState('');
  const [scope, setScope] = useState<string[]>(['GB']);
  const [automatedMeans, setAutomatedMeans] = useState(false);
  const [internalReason, setInternalReason] = useState('');

  // Policy version is derived from legal entity + current safety policy.
  // In production this comes from the policy service; we display a stable
  // version string so the operator knows which rules applied.
  const policyVersion = `safety-policy/${legalEntity.toLowerCase()}/2024-09`;

  const toggleScope = (code: string) => {
    setScope((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  };

  const effectPreview: Record<'no_violation' | 'restrict' | 'escalate' | 'emergency_hold', string> = {
    no_violation: 'No action taken. Case closed with no restriction. The affected user is notified of the outcome.',
    restrict: 'Restricts the listing, notifies the seller, and starts a 7-day appeal window.',
    escalate: 'Escalates to the senior review queue. No restriction applied until senior review completes.',
    emergency_hold: 'Places an immediate emergency hold. Senior reviewer must confirm within 24h or the hold lapses.',
  };

  const canSubmit = reasonCode && scope.length > 0 && internalReason.trim().length > 0 &&
    (duration === 'permanent' || durationUntil);

  const handleSubmit = () => {
    onSubmit({
      decisionType,
      reasonCode,
      policyVersion,
      duration,
      durationUntil: duration === 'temporary' ? durationUntil : null,
      territorialScope: scope,
      automatedMeans,
      internalReason: internalReason.trim(),
    });
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-body)',
    color: 'var(--text-primary)',
    background: 'var(--bg-canvas)',
    border: '1px solid var(--border-standard)',
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--text-metadata)',
    fontWeight: 'var(--weight-medium)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-1)',
    display: 'block',
  };

  return (
    <ModalOverlay onClose={onClose} width={520}>
      <div style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--weight-semibold)', marginBottom: 'var(--space-1)' }}>
        Record decision
      </div>
      <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-4)' }}>
        Case {caseId} · Policy {policyVersion}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* Decision type */}
        <div>
          <label style={labelStyle}>Decision</label>
          <select
            style={fieldStyle}
            value={decisionType}
            onChange={(e) => setDecisionType(e.target.value as 'no_violation' | 'restrict' | 'escalate' | 'emergency_hold')}
          >
            <option value="no_violation">No violation</option>
            <option value="restrict">Restrict</option>
            <option value="escalate">Escalate</option>
            <option value="emergency_hold">Emergency hold</option>
          </select>
        </div>

        {/* Reason code */}
        <div>
          <label style={labelStyle}>Reason code</label>
          <select style={fieldStyle} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {reasonCodes.map((r) => (
              <option key={r.code} value={r.code}>{r.userFacingLabel}</option>
            ))}
          </select>
        </div>

        {/* Duration */}
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Duration</label>
            <select
              style={fieldStyle}
              value={duration}
              onChange={(e) => setDuration(e.target.value as 'permanent' | 'temporary')}
            >
              <option value="permanent">Permanent</option>
              <option value="temporary">Temporary</option>
            </select>
          </div>
          {duration === 'temporary' && (
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Until</label>
              <input
                type="datetime-local"
                style={fieldStyle}
                value={durationUntil}
                onChange={(e) => setDurationUntil(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Territorial scope */}
        <div>
          <label style={labelStyle}>Territorial scope</label>
          <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
            {TERRITORIAL_SCOPES.map((code) => (
              <button
                key={code}
                onClick={() => toggleScope(code)}
                style={{
                  padding: 'var(--space-1) var(--space-3)',
                  fontSize: 'var(--text-metadata)',
                  color: scope.includes(code) ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: scope.includes(code) ? 'var(--bg-active)' : 'transparent',
                  border: `1px solid ${scope.includes(code) ? 'var(--border-focus)' : 'var(--border-hairline)'}`,
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                {code}
              </button>
            ))}
          </div>
        </div>

        {/* Automated means */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--text-body)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={automatedMeans}
            onChange={(e) => setAutomatedMeans(e.target.checked)}
          />
          Decision informed by automated moderation
        </label>

        {/* Internal reason */}
        <div>
          <label style={labelStyle}>Internal reason (not shown to affected user)</label>
          <textarea
            style={{ ...fieldStyle, minHeight: '64px', resize: 'vertical' }}
            value={internalReason}
            onChange={(e) => setInternalReason(e.target.value)}
            placeholder="Record the reasoning behind this decision…"
          />
        </div>

        {/* Effect preview */}
        <div
          style={{
            padding: 'var(--space-3)',
            background: 'var(--bg-surface-raised)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>
            Effect
          </div>
          <div style={{ fontSize: 'var(--text-body)', color: 'var(--text-primary)' }}>
            {effectPreview[decisionType]}
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--state-danger)' }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button className="btn btn--secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn--primary" onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving ? 'Recording…' : 'Record decision'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ── Modal overlay ───────────────────────────────────────────────────────

function ModalOverlay({
  children,
  onClose,
  width = 440,
}: {
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '15vh var(--space-4) var(--space-4)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: `${width}px`,
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'var(--bg-surface-raised)',
          border: '1px solid var(--border-standard)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Action button (with policy explanation) ─────────────────────────────

function ActionButton({
  label,
  policy,
  isDanger,
  onClick,
}: {
  label: string;
  policy: string;
  isDanger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`action-button${isDanger ? ' action-button--danger' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="action-button__policy">{policy}</span>
    </button>
  );
}

// ── Command state badge ─────────────────────────────────────────────────

function CommandStateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: '' },
    proposed: { label: 'Proposed', cls: 'status-badge--info' },
    awaiting_approval: { label: 'Awaiting approval', cls: 'status-badge--warning' },
    approved: { label: 'Approved', cls: 'status-badge--info' },
    queued: { label: 'Queued', cls: '' },
    executing: { label: 'Executing', cls: 'status-badge--info' },
    succeeded: { label: 'Succeeded', cls: 'status-badge--success' },
    failed: { label: 'Failed', cls: 'status-badge--danger' },
    unknown_outcome: { label: 'Unknown outcome', cls: 'status-badge--unknown' },
    investigating: { label: 'Investigating', cls: 'status-badge--warning' },
    compensated: { label: 'Compensated', cls: 'status-badge--info' },
    cancelled: { label: 'Cancelled', cls: '' },
    rejected: { label: 'Rejected', cls: 'status-badge--danger' },
    expired: { label: 'Expired', cls: '' },
    superseded: { label: 'Superseded', cls: '' },
  };
  const s = map[state] ?? { label: state, cls: '' };
  return (
    <span className={`status-badge ${s.cls}`}>
      <span className="status-badge__dot" />
      {s.label}
    </span>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function StateMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="state-message">
      <div className="state-message__title">{title}</div>
      <div className="state-message__description">{description}</div>
    </div>
  );
}

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

function getStateOrder(status: string): number {
  const order: Record<string, number> = {
    new: 0, triaged: 1, assigned: 2, investigating: 3,
    awaiting_customer: 3, awaiting_provider: 3, awaiting_internal: 3,
    ready_for_decision: 4, resolved: 5, closed: 6,
  };
  return order[status] ?? 0;
}

function formatStateLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const TRANSITIONS: Record<string, string[]> = {
  new: ['triaged', 'escalated', 'closed'],
  triaged: ['assigned', 'escalated', 'closed'],
  assigned: ['investigating', 'escalated', 'awaiting_internal', 'closed'],
  investigating: ['awaiting_customer', 'awaiting_provider', 'awaiting_internal', 'ready_for_decision', 'escalated', 'closed'],
  awaiting_customer: ['investigating', 'ready_for_decision', 'escalated', 'closed'],
  awaiting_provider: ['investigating', 'ready_for_decision', 'escalated', 'closed'],
  awaiting_internal: ['investigating', 'ready_for_decision', 'escalated', 'closed'],
  ready_for_decision: ['resolved', 'escalated', 'closed'],
  resolved: ['closed', 'escalated'],
  closed: [],
  escalated: ['triaged', 'assigned', 'investigating', 'ready_for_decision', 'resolved', 'closed'],
};

function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

function canAnyTransition(from: string): boolean {
  return (TRANSITIONS[from] ?? []).length > 0;
}
