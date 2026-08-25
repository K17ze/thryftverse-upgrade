// ── Ops Console API Client ──────────────────────────────────────────────
//
// Thin fetch wrapper for /ops/v1/* endpoints. Workforce JWT is stored in
// sessionStorage (short-lived, cleared on tab close). Every request
// includes the Authorization header with the workforce token.

const TOKEN_KEY = 'thryftverse_ops_token';

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit & { token?: string },
): Promise<T> {
  const token = options?.token ?? getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearToken();
    throw new ApiError(401, 'Unauthorized');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (data as { error?: string }).error ?? `HTTP ${response.status}`,
      (data as { details?: unknown }).details,
    );
  }

  return data as T;
}

// ── Types ───────────────────────────────────────────────────────────────

export interface EffectivePermissions {
  ok: boolean;
  principal: {
    id: string;
    displayName: string;
    email: string;
    team: string;
    region: string;
    legalEntity: string;
    authAssuranceLevel: number;
  };
  session: {
    id: string;
    authAssurance: number;
    stepUpAt: string | null;
    stepUpReason: string | null;
    idleExpiresAt: string;
    absoluteExpiresAt: string;
  };
  permissions: string[];
  grants: Array<{
    permission: string;
    scope: Record<string, unknown>;
    expiresAt: string;
  }>;
}

export interface CaseRecord {
  id: string;
  type: string;
  subject: string;
  description: string | null;
  legalEntity: string;
  severity: string;
  consumerHarmScore: number;
  financialValueGbp: number;
  status: string;
  ownerId: string | null;
  team: string | null;
  source: string;
  sourceRef: string | null;
  priority: number;
  slaDeadlineAt: string | null;
  slaPausedAt: string | null;
  slaBreachAt: string | null;
  isVulnerableCustomer: boolean;
  reopenCount: number;
  acknowledgedAt: string | null;
  triagedAt: string | null;
  assignedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommandRecord {
  id: string;
  commandType: string;
  resourceType: string;
  resourceId: string;
  state: string;
  proposerId: string;
  caseId: string | null;
  reasonCode: string;
  riskTier: string;
  amountGbp: number | null;
  currency: string;
  destinationFingerprint: string | null;
  effectPreview: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  sequenceNumber: number;
  occurredAt: string;
  principalType: string;
  principalId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  caseId: string | null;
  commandId: string | null;
  outcome: string;
  unknownOutcome: boolean;
  eventHash: string;
  previousEventHash: string | null;
}

export interface EvidenceItem {
  id: string;
  caseId: string;
  source: string;
  sourceRef: string | null;
  objectType: string;
  objectRef: string;
  objectHash: string | null;
  sensitivity: 'standard' | 'sensitive' | 'restricted';
  isLegalHold: boolean;
  metadata: Record<string, unknown>;
  addedBy: string | null;
  createdAt: string;
}

export interface DecisionRecord {
  id: string;
  caseId: string;
  decisionType: string;
  outcome: string;
  reasonCode: string;
  explanation: string | null;
  policyId: string | null;
  policyVersion: string | null;
  decisionMaker: string;
  isAutomated: boolean;
  createdAt: string;
}

export interface CommunicationRecord {
  id: string;
  caseId: string;
  channel: string;
  direction: string;
  templateId: string | null;
  deliveryStatus: string;
  deliveredAt: string | null;
  sentBy: string | null;
  createdAt: string;
}

export interface AppealRecord {
  id: string;
  decisionId: string;
  appellantId: string;
  grounds: string;
  status: 'submitted' | 'under_review' | 'upheld' | 'overturned' | 'withdrawn';
  outcomeReason: string | null;
  remedy: string | null;
  independentReviewerId: string | null;
  deadline: string;
  createdAt: string;
  decidedAt: string | null;
}

export interface StatementOfReasonsRecord {
  id: string;
  decisionId: string;
  affectedUserId: string;
  decisionVisibility: boolean;
  decisionMandatory: boolean;
  decisionProvision: boolean;
  decisionAccount: boolean;
  territorialScope: string[];
  duration: string;
  facts: string;
  automatedMeans: boolean;
  source: string;
  puid: string;
  dsaCategory: string;
  userNotificationState: string;
  submittedToDsaDb: boolean;
  submittedAt: string | null;
  createdAt: string;
}

export interface PolicyVersionRecord {
  id: string;
  version: string;
  jurisdiction: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  userFacingExplanationTemplate: string;
  createdAt: string;
}

export interface SafetyCaseRecord {
  id: string;
  noticeId: string | null;
  ownerTeam: string | null;
  severity: number;
  involvesMinor: boolean;
  involvesVulnerableUser: boolean;
  viralityScore: number;
  exposureCount: number;
  slaClass: 'standard' | 'priority' | 'emergency';
  slaDeadline: string | null;
  status: 'open' | 'under_review' | 'decision_pending' | 'enforcement_pending' | 'closed' | 'appealed' | 'reopened';
  linkedCaseIds: string[];
  policyVersionId: string | null;
  jurisdiction: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface OfcomRiskAssessmentRecord {
  id: string;
  offenceType: string;
  riskLevel: 'low' | 'medium' | 'high';
  assessmentSummary: string;
  mitigationMeasures: Record<string, unknown>;
  assessedBy: string;
  assessmentDate: string;
  nextReviewDate: string | null;
  createdAt: string;
  assessmentType: 'illegal_content' | 'children';
}

export interface OfcomChildrenRiskFactor {
  factor: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface DsaTransparencyReport {
  period_start: string;
  period_end: string;
  total_cases: number;
  total_decisions: number;
  decisions_by_type: Record<string, number>;
  automation_rate: number;
  average_time_to_decision_hours: number | null;
  appeal_rate: number;
  overturn_rate: number;
  by_content_category: Record<string, number>;
}

// ── API methods ─────────────────────────────────────────────────────────

export const api = {
  getEffectivePermissions: () =>
    apiFetch<EffectivePermissions>('/ops/v1/me/effective-permissions'),

  getWorkQueue: (queueId: string, params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ ok: boolean; cases: CaseRecord[]; total: number }>(
      `/ops/v1/work-queues/${queueId}/cases${query}`,
    );
  },

  getCase: (caseId: string) =>
    apiFetch<{ ok: boolean; case: CaseRecord }>(`/ops/v1/cases/${caseId}`),

  createCase: (body: Record<string, unknown>) =>
    apiFetch<{ ok: boolean; case: CaseRecord }>('/ops/v1/cases', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  assignCase: (caseId: string, assigneeId: string, team?: string) =>
    apiFetch<{ ok: boolean; case: CaseRecord }>(`/ops/v1/cases/${caseId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeId, team }),
    }),

  transitionCase: (caseId: string, toStatus: string, reason?: string) =>
    apiFetch<{ ok: boolean; case: CaseRecord }>(`/ops/v1/cases/${caseId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ toStatus, reason }),
    }),

  addNote: (caseId: string, body: string, isInternal = true) =>
    apiFetch<{ ok: boolean }>(`/ops/v1/cases/${caseId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body, isInternal }),
    }),

  linkEntity: (caseId: string, entityType: string, entityId: string) =>
    apiFetch<{ ok: boolean }>(`/ops/v1/cases/${caseId}/entities`, {
      method: 'POST',
      body: JSON.stringify({ entityType, entityId }),
    }),

  proposeCommand: (body: Record<string, unknown>) =>
    apiFetch<{ ok: boolean; command: CommandRecord; created: boolean }>(
      '/ops/v1/commands',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  getCommand: (commandId: string) =>
    apiFetch<{ ok: boolean; command: CommandRecord }>(`/ops/v1/commands/${commandId}`),

  approveCommand: (commandId: string, decision: 'approve' | 'reject', decisionReason?: string) =>
    apiFetch<{ ok: boolean; command: CommandRecord }>(
      `/ops/v1/commands/${commandId}/approve`,
      { method: 'POST', body: JSON.stringify({ decision, decisionReason }) },
    ),

  cancelCommand: (commandId: string, reason: string) =>
    apiFetch<{ ok: boolean; command: CommandRecord }>(
      `/ops/v1/commands/${commandId}/cancel`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),

  listCommands: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ ok: boolean; commands: CommandRecord[]; total: number }>(
      `/ops/v1/commands${query}`,
    );
  },

  revealPii: (type: string, id: string, fieldName: string, purpose: string, caseId?: string) =>
    apiFetch<{ ok: boolean; revealId: string; autoRemaskAt: string }>(
      `/ops/v1/resources/${type}/${id}/reveal`,
      { method: 'POST', body: JSON.stringify({ fieldName, purpose, caseId }) },
    ),

  getAuditEvents: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ ok: boolean; events: AuditEvent[]; total: number }>(
      `/ops/v1/audit-events${query}`,
    );
  },

  verifyAuditChain: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ ok: boolean; verified: boolean; gaps: number[]; hashMismatches: number[]; totalEvents: number; lastSequence: number; lastHash: string }>(
      `/ops/v1/audit-chain/verify${query}`,
    );
  },

  createBreakglass: (reason: string, permissions: string[], durationMinutes: number) =>
    apiFetch<{ ok: boolean; breakglassSession: { id: string; expiresAt: string; reviewRequiredBy: string; permissions: string[] } }>(
      '/ops/v1/breakglass-sessions',
      { method: 'POST', body: JSON.stringify({ reason, permissions, durationMinutes }) },
    ),

  // ── Case evidence, decisions, communications ──────────────────────

  getCaseEvidence: (caseId: string) =>
    apiFetch<{ ok: boolean; evidence: EvidenceItem[] }>(`/ops/v1/cases/${caseId}/evidence`),

  getCaseDecisions: (caseId: string) =>
    apiFetch<{ ok: boolean; decisions: DecisionRecord[] }>(`/ops/v1/cases/${caseId}/decisions`),

  recordDecision: (caseId: string, body: Record<string, unknown>) =>
    apiFetch<{ ok: boolean; decision: DecisionRecord }>(`/ops/v1/cases/${caseId}/decisions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getCaseCommunications: (caseId: string) =>
    apiFetch<{ ok: boolean; communications: CommunicationRecord[] }>(`/ops/v1/cases/${caseId}/communications`),

  getLinkedCases: (caseId: string) =>
    apiFetch<{ ok: boolean; cases: CaseRecord[] }>(`/ops/v1/cases/${caseId}/linked-cases`),

  // ── SLA controls ───────────────────────────────────────────────────

  pauseSla: (caseId: string, reason: string) =>
    apiFetch<{ ok: boolean; case: CaseRecord }>(`/ops/v1/cases/${caseId}/sla/pause`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  resumeSla: (caseId: string) =>
    apiFetch<{ ok: boolean; case: CaseRecord }>(`/ops/v1/cases/${caseId}/sla/resume`, {
      method: 'POST',
    }),

  // ── Safety cases (trust & safety specific) ─────────────────────────

  getSafetyCaseQueue: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ ok: boolean; cases: SafetyCaseRecord[]; total: number }>(
      `/ops/v1/safety/cases${query}`,
    );
  },

  getSafetyCase: (caseId: string) =>
    apiFetch<{ ok: boolean; case: SafetyCaseRecord; notice: unknown; evidence: EvidenceItem[]; decisions: DecisionRecord[]; appeals: AppealRecord[] }>(
      `/ops/v1/safety/cases/${caseId}`,
    ),

  // ── Appeals ────────────────────────────────────────────────────────

  getAppeals: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ ok: boolean; appeals: AppealRecord[]; total: number }>(
      `/ops/v1/safety/appeals${query}`,
    );
  },

  decideAppeal: (appealId: string, body: Record<string, unknown>) =>
    apiFetch<{ ok: boolean; appeal: AppealRecord }>(`/ops/v1/safety/appeals/${appealId}/decide`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── DSA transparency ───────────────────────────────────────────────

  getStatementsOfReasons: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ ok: boolean; statements: StatementOfReasonsRecord[]; total: number }>(
      `/ops/v1/safety/statements-of-reasons${query}`,
    );
  },

  exportDsaStatements: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ ok: boolean; records: Record<string, unknown>[]; total: number }>(
      `/ops/v1/safety/dsa-export${query}`,
    );
  },

  markDsaSubmitted: (statementIds: string[]) =>
    apiFetch<{ ok: boolean; updated: number }>(`/ops/v1/safety/dsa-export/mark-submitted`, {
      method: 'POST',
      body: JSON.stringify({ statementIds }),
    }),

  getDsaTransparencyReport: (periodStart: string, periodEnd: string) =>
    apiFetch<{ ok: boolean; report: DsaTransparencyReport }>(
      `/ops/v1/safety/dsa-transparency-report?period_start=${periodStart}&period_end=${periodEnd}`,
    ),

  // ── Policy versions ────────────────────────────────────────────────

  getPolicyVersions: () =>
    apiFetch<{ ok: boolean; versions: PolicyVersionRecord[] }>(`/ops/v1/safety/policy-versions`),

  // ── Ofcom risk assessment ──────────────────────────────────────────

  getOfcomRiskAssessments: () =>
    apiFetch<{ ok: boolean; assessments: OfcomRiskAssessmentRecord[]; missing: string[]; overdue: boolean; childrenAssessments: OfcomRiskAssessmentRecord[] }>(
      `/ops/v1/safety/ofcom-risk-assessments`,
    ),

  createOfcomRiskAssessment: (body: Record<string, unknown>) =>
    apiFetch<{ ok: boolean; assessment: OfcomRiskAssessmentRecord }>(`/ops/v1/safety/ofcom-risk-assessments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  createOfcomChildrenRiskAssessment: (body: {
    ageGroups: string[];
    riskFactors: OfcomChildrenRiskFactor[];
    overallSummary: string;
    nextReviewDate?: string;
  }) =>
    apiFetch<{ ok: boolean; assessment: OfcomRiskAssessmentRecord }>(`/ops/v1/safety/ofcom-children-risk-assessments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── Reason codes ───────────────────────────────────────────────────

  getSafetyReasonCodes: () =>
    apiFetch<{ ok: boolean; reasonCodes: Array<{ code: string; userFacingLabel: string; severityClass: number; dsaCategory: string | null; ukPriorityOffence: string | null }> }>(
      `/ops/v1/safety/reason-codes`,
    ),
};
