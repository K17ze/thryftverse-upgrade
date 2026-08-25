import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';
import type { SupportEntryContext } from './contracts.js';

// ── Public types ──

export type RiskTier = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5';

export type Urgency = 'low' | 'normal' | 'high' | 'urgent';

export type IssueType =
  | 'informational'
  | 'order_tracking'
  | 'cancellation'
  | 'return_refund'
  | 'counterfeit_safety'
  | 'payment_payout'
  | 'account_security'
  | 'moderation_appeal'
  | 'auction_coown'
  | 'catalog_import'
  | 'media_job'
  | 'general';

export interface RoutingResult {
  issueType: IssueType;
  riskTier: RiskTier;
  urgency: Urgency;
  requiresHandoff: boolean;
  handoffReason: string | null;
  toolSubset: string[];
  procedureKey: string | null;
}

// ── Tool subsets by risk tier ──

const TOOLS_S0: readonly string[] = ['support.search_knowledge'];

const TOOLS_S1: readonly string[] = [
  'support.search_knowledge',
  'support.get_order_snapshot',
  'support.get_parcel_snapshot',
  'support.get_payout_status',
  'support.get_listing_snapshot',
];

const TOOLS_S2: readonly string[] = [
  ...TOOLS_S1,
  'support.create_case_draft',
  'support.collect_evidence',
];

const TOOLS_S3: readonly string[] = [
  ...TOOLS_S2,
  'support.create_case',
  'support.append_case_message',
  'support.request_human_handoff',
];

const TOOLS_S4_S5: readonly string[] = ['support.request_human_handoff'];

function toolSubsetForTier(tier: RiskTier): string[] {
  switch (tier) {
    case 'S0':
      return [...TOOLS_S0];
    case 'S1':
      return [...TOOLS_S1];
    case 'S2':
      return [...TOOLS_S2];
    case 'S3':
      return [...TOOLS_S3];
    case 'S4':
    case 'S5':
      return [...TOOLS_S4_S5];
  }
}

// ── Mandatory escalation triggers (deterministic, never miss) ──
//
// The keyword/regex matching below is the PRIMARY boundary for mandatory
// escalation. It must never fail to flag a message that matches a
// high-risk trigger. The LLM classification layer is optional refinement
// only — it can lower a false-positive risk tier but can never suppress
// a deterministic trigger match.

interface EscalationTrigger {
  reason: string;
  patterns: readonly RegExp[];
}

const ESCALATION_TRIGGERS: readonly EscalationTrigger[] = [
  {
    reason: 'User explicitly requested a human agent.',
    patterns: [
      /\b(?:i\s+want|need|request|ask\s+for|speak\s+to|talk\s+to)\s+(?:a|an)?\s*(?:human|person|real\s+person|agent|support\s+agent|specialist|manager)\b/i,
      /\bhuman\s+(?:agent|support|person)\b/i,
      /\b(?:someone\s+real|real\s+person)\b/i,
      /\btransfer\s+me\s+to\s+(?:a\s+)?human\b/i,
    ],
  },
  {
    reason: 'Legal threat, regulator, law-enforcement or media inquiry.',
    patterns: [
      /\blawyer|attorney|solicitor|legal\s+(?:action|counsel|proceedings|threat)\b/i,
      /\bsue|lawsuit|litigation|small\s+claims\b/i,
      /\bregulator|regulatory|fca|trading\s+standards|citizens\s+advice\b/i,
      /\bpolice|law\s+enforcement|constabulary|crime\s+reference\b/i,
      /\b(?:press|media|journalist|reporter|news)\s+(?:inquiry|enquiry|request|contact)\b/i,
      /\bgdpr\s+(?:complaint|violation|breach)\b/i,
      /\bdata\s+(?:protection\s+)?(?:complaint|breach|violation)\b/i,
    ],
  },
  {
    reason: 'Account compromise or identity/security change.',
    patterns: [
      /\b(?:my\s+)?account\s+(?:is|was|has\s+been)\s+(?:hacked|compromised|breached|taken\s+over|stolen)\b/i,
      /\bsomeone\s+(?:else\s+)?(?:has\s+)?(?:access|logged\s+in|changed)\s+(?:my|the)\s+(?:account|password|email)\b/i,
      /\bunauthori[sz]ed\s+(?:access|login|charge|transaction)\b/i,
      /\bidentity\s+(?:theft|fraud|change)\b/i,
      /\bchange\s+(?:my\s+)?(?:email|password|phone|2fa|two-factor)\b/i,
      /\b(?:reset|recover)\s+(?:my\s+)?(?:password|account)\b/i,
    ],
  },
  {
    reason: 'Self-harm, child safety or credible physical danger.',
    patterns: [
      /\b(?:kill|hurt|end|take)\s+(?:myself|me)\b/i,
      /\bsuicid(?:e|al)\b/i,
      /\bself[-\s]?harm\b/i,
      /\b(?:want\s+to\s+)?die\b/i,
      /\bchild\s+(?:safety|abuse|exploitation|protection)\b/i,
      /\bminor\b/i,
      /\b(?:csam|child\s+sexual\s+abuse)\b/i,
      /\b(?:threat|threatening)\s+(?:to\s+)?(?:kill|harm|hurt|attack)\b/i,
      /\b(?:physical\s+)?danger\b/i,
      /\bstalking|stalker\b/i,
    ],
  },
  {
    reason: 'Payment dispute, chargeback, payout reversal or unknown money outcome.',
    patterns: [
      /\bchargeback\b/i,
      /\bpayment\s+dispute\b/i,
      /\b(?:bank\s+)?dispute\b/i,
      /\bpayout\s+(?:reversal|reversed|cancelled|canceled|failed|missing)\b/i,
      /\b(?:unknown|unauthori[sz]ed)\s+(?:charge|transaction|payment|debit)\b/i,
      /\bmoney\s+(?:missing|lost|stolen|taken)\b/i,
      /\brefund\s+(?:not\s+received|missing|never\s+arrived)\b/i,
      /\bsection\s+75\b/i,
      /\b(?:credit\s+card|debit\s+card)\s+(?:dispute|fraud|chargeback)\b/i,
    ],
  },
  {
    reason: 'Counterfeit or prohibited-item final decision.',
    patterns: [
      /\bcounterfeit|fake|replica|knock[-\s]?off\b/i,
      /\bprohibited\s+item\b/i,
      /\bbanned\s+(?:item|product|listing)\b/i,
      /\b(?:item|listing)\s+(?:is|was|removed|taken\s+down|delisted)\b/i,
      /\bauthenticity\s+(?:check|verification|dispute)\b/i,
    ],
  },
  {
    reason: 'Harassment, abuse or serious trust-and-safety report.',
    patterns: [
      /\bharass(?:ment|ing)\b/i,
      /\babuse|abusive\b/i,
      /\bbullying|bullied\b/i,
      /\bhate\s+(?:speech|crime)\b/i,
      /\bthreat(?:s|ening|ened)?\b/i,
      /\b(?:sexual|racist|homophobic|transphobic|sexist)\s+(?:harassment|abuse|message|comment)\b/i,
      /\bdoxxing|doxing\b/i,
      /\btrust\s+and\s+safety\b/i,
      /\bsafety\s+(?:report|concern|issue)\b/i,
    ],
  },
  {
    reason: 'Moderation appeal.',
    patterns: [
      /\bmoderation\s+(?:appeal|decision|review|action)\b/i,
      /\bappeal\s+(?:a\s+)?(?:moderation|suspension|ban|restriction|listing\s+removal)\b/i,
      /\b(?:suspended|banned|restricted)\s+(?:my\s+)?(?:account|listing)\b/i,
      /\b(?:listing|item)\s+(?:removed|taken\s+down|delisted)\s+(?:unfairly|wrongly|mistakenly)?\b/i,
      /\bdisagree\s+with\s+(?:the\s+)?moderation\b/i,
    ],
  },
  {
    reason: 'Auction or Co-Own rights or settlement dispute.',
    patterns: [
      /\bauction\s+(?:dispute|settlement|rights|unfair|rigged)\b/i,
      /\bco[-\s]?own(?:ership)?\s+(?:dispute|rights|settlement|share|fraction)\b/i,
      /\bsettlement\s+dispute\b/i,
      /\b(?:my\s+)?share(?:s)?\s+(?:of|in)\s+(?:the\s+)?(?:asset|co[-\s]?own)\b/i,
      /\bfractional\s+(?:ownership|share)\s+dispute\b/i,
    ],
  },
];

// ── Issue-type classification (keyword-based) ──

interface IssueTypeRule {
  issueType: IssueType;
  patterns: readonly RegExp[];
}

const ISSUE_TYPE_RULES: readonly IssueTypeRule[] = [
  {
    issueType: 'counterfeit_safety',
    patterns: [
      /\bcounterfeit|fake|replica|knock[-\s]?off\b/i,
      /\bprohibited\s+item\b/i,
      /\bauthenticity\b/i,
      /\bsafety\s+(?:concern|issue|hazard)\b/i,
      /\brecalled?\s+product\b/i,
    ],
  },
  {
    issueType: 'account_security',
    patterns: [
      /\baccount\s+(?:hacked|compromised|breached|stolen|locked|suspended)\b/i,
      /\bpassword|2fa|two-factor|login\s+issue\b/i,
      /\bidentity\s+(?:theft|verification|change)\b/i,
      /\bunauthori[sz]ed\s+access\b/i,
    ],
  },
  {
    issueType: 'moderation_appeal',
    patterns: [
      /\bmoderation\b/i,
      /\bappeal\b/i,
      /\bsuspend(?:ed|ion)?|ban(?:ned)?\b/i,
      /\blisting\s+(?:removed|taken\s+down|delisted)\b/i,
    ],
  },
  {
    issueType: 'payment_payout',
    patterns: [
      /\bpayout\b/i,
      /\bpayment\b/i,
      /\bchargeback\b/i,
      /\brefund\s+(?:not\s+received|missing)\b/i,
      /\bwithdraw(?:al)?\b/i,
      /\bbank\s+(?:transfer|account|details)\b/i,
    ],
  },
  {
    issueType: 'return_refund',
    patterns: [
      /\breturn\b/i,
      /\brefund\b/i,
      /\bsend\s+(?:it\s+)?back\b/i,
      /\bnot\s+as\s+described\b/i,
      /\bitem\s+(?:damaged|broken|defective|faulty|wrong)\b/i,
    ],
  },
  {
    issueType: 'cancellation',
    patterns: [
      /\bcancel(?:lation|led|ing)?\b/i,
      /\babort\s+(?:order|purchase)\b/i,
    ],
  },
  {
    issueType: 'order_tracking',
    patterns: [
      /\btrack(?:ing)?\b/i,
      /\bparcel\b/i,
      /\bdelivery\b/i,
      /\bwhere\s+is\s+(?:my|the)\s+(?:order|package|parcel)\b/i,
      /\bshipping\b/i,
      /\bestimated\s+delivery\b/i,
    ],
  },
  {
    issueType: 'auction_coown',
    patterns: [
      /\bauction\b/i,
      /\bco[-\s]?own\b/i,
      /\bfractional\s+(?:ownership|share)\b/i,
      /\bsettlement\b/i,
    ],
  },
  {
    issueType: 'catalog_import',
    patterns: [
      /\bcatalog\s+import\b/i,
      /\bimport\s+(?:job|batch|file)\b/i,
      /\bbulk\s+(?:upload|import|listing)\b/i,
    ],
  },
  {
    issueType: 'media_job',
    patterns: [
      /\bmedia\s+job\b/i,
      /\bimage\s+(?:processing|upload|generation)\b/i,
      /\bvideo\s+(?:processing|transcode|upload)\b/i,
      /\bthumbnail\s+generation\b/i,
    ],
  },
  {
    issueType: 'informational',
    patterns: [
      /\bhow\s+do\s+i\b/i,
      /\bwhat\s+is\b/i,
      /\bwhere\s+can\s+i\b/i,
      /\bcan\s+i\b/i,
      /\bpolicy\b/i,
      /\bfee\b/i,
      /\bhelp\b/i,
    ],
  },
];

// ── Urgency signals ──

interface UrgencyRule {
  urgency: Urgency;
  patterns: readonly RegExp[];
}

const URGENCY_RULES: readonly UrgencyRule[] = [
  {
    urgency: 'urgent',
    patterns: [
      /\burgent\b/i,
      /\bemergency\b/i,
      /\bimmediately\b/i,
      /\bright\s+now\b/i,
      /\basap\b/i,
    ],
  },
  {
    urgency: 'high',
    patterns: [
      /\b(?:very\s+)?important\b/i,
      /\bquickly\b/i,
      /\bsoon\b/i,
      /\bdeadline\b/i,
      /\bdeadline\s+today\b/i,
    ],
  },
];

// ── Risk tier derivation ──

function deriveRiskTier(
  issueType: IssueType,
  requiresHandoff: boolean,
): RiskTier {
  // Mandatory handoff issues are at least S4 — the model must not act,
  // only hand off.
  if (requiresHandoff) {
    return 'S4';
  }

  switch (issueType) {
    case 'informational':
      return 'S0';
    case 'order_tracking':
      return 'S1';
    case 'cancellation':
      return 'S2';
    case 'return_refund':
      return 'S2';
    case 'payment_payout':
      return 'S3';
    case 'account_security':
      return 'S4';
    case 'counterfeit_safety':
      return 'S4';
    case 'moderation_appeal':
      return 'S4';
    case 'auction_coown':
      return 'S4';
    case 'catalog_import':
      return 'S1';
    case 'media_job':
      return 'S1';
    case 'general':
    default:
      return 'S0';
  }
}

// ── Procedure key derivation ──

function deriveProcedureKey(
  issueType: IssueType,
  contextKind: SupportEntryContext['kind'],
): string | null {
  // Map issue type + context to a deterministic procedure key. Procedures
  // are versioned in support_procedures; the key is used to look up the
  // currently-effective published version.
  switch (issueType) {
    case 'order_tracking':
      return 'order_tracking';
    case 'cancellation':
      return 'order_cancellation';
    case 'return_refund':
      return contextKind === 'order' ? 'order_return_refund' : 'return_refund';
    case 'payment_payout':
      return contextKind === 'payout' ? 'payout_inquiry' : 'payment_inquiry';
    case 'counterfeit_safety':
      return 'counterfeit_report';
    case 'account_security':
      return 'account_security';
    case 'moderation_appeal':
      return 'moderation_appeal';
    case 'auction_coown':
      return contextKind === 'auction' ? 'auction_dispute' : 'coown_dispute';
    case 'catalog_import':
      return 'catalog_import';
    case 'media_job':
      return 'media_job';
    case 'informational':
    case 'general':
    default:
      return null;
  }
}

// ── Classification helpers ──

function classifyIssueType(messageBody: string): IssueType {
  for (const rule of ISSUE_TYPE_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(messageBody)) {
        return rule.issueType;
      }
    }
  }
  return 'general';
}

function classifyUrgency(messageBody: string): Urgency {
  for (const rule of URGENCY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(messageBody)) {
        return rule.urgency;
      }
    }
  }
  return 'normal';
}

function detectEscalation(
  messageBody: string,
): { requiresHandoff: boolean; handoffReason: string | null } {
  for (const trigger of ESCALATION_TRIGGERS) {
    for (const pattern of trigger.patterns) {
      if (pattern.test(messageBody)) {
        return { requiresHandoff: true, handoffReason: trigger.reason };
      }
    }
  }
  return { requiresHandoff: false, handoffReason: null };
}

// ── Public API ──

/**
 * Classifies a customer message into an issue type, risk tier, urgency
 * level, and handoff decision. Uses deterministic keyword/regex matching
 * as the primary boundary for mandatory escalation — it never fails to
 * flag a high-risk trigger. The LLM is optional refinement only and is
 * not invoked here; callers may post-process the result if they wish.
 *
 * The `db` and `conversationId` parameters are accepted for future
 * context-aware routing (e.g. reading prior routing decisions or case
 * state) but are not required for the current deterministic classifier.
 */
export async function routeMessage(
  db: Pool,
  conversationId: string,
  messageBody: string,
  contextKind: SupportEntryContext['kind'],
): Promise<RoutingResult> {
  // Deterministic escalation check — this is the primary boundary and
  // must never miss a mandatory trigger.
  const { requiresHandoff, handoffReason } = detectEscalation(messageBody);

  // Issue-type and urgency classification.
  const issueType = classifyIssueType(messageBody);
  const urgency = classifyUrgency(messageBody);

  // Risk tier derivation.
  const riskTier = deriveRiskTier(issueType, requiresHandoff);

  // Tool subset scoped by risk tier.
  const toolSubset = toolSubsetForTier(riskTier);

  // Procedure key for deterministic procedure lookup.
  const procedureKey = deriveProcedureKey(issueType, contextKind);

  const result: RoutingResult = {
    issueType,
    riskTier,
    urgency,
    requiresHandoff,
    handoffReason,
    toolSubset,
    procedureKey,
  };

  logger.debug(
    { conversationId, issueType, riskTier, urgency, requiresHandoff, procedureKey },
    '[routingService] message routed',
  );

  return result;
}

export { logger };
