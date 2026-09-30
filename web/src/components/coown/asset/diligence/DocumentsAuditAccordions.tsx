'use client';

import { Icon } from '@/components/ui/Icon';
import type { DiligenceDocument } from '@/lib/contracts/coown';
import { formatDate } from '@/lib/utils/format';
import {
  DOC_KIND,
  humaniseEventType,
  RuleHead,
  type RuleKey,
} from './diligenceTypes';

interface AuditEventItem {
  eventType: string;
  createdAt: string;
  changedByLabel: string | null;
}

interface DocumentsAuditAccordionsProps {
  docs: DiligenceDocument[];
  docLinks: { href: string; label: string }[];
  auditEvents: AuditEventItem[];
  open: RuleKey | null;
  onToggle: (key: RuleKey) => void;
}

export function DocumentsAuditAccordions({
  docs,
  docLinks,
  auditEvents,
  open,
  onToggle,
}: DocumentsAuditAccordionsProps) {
  const docCount = docs.length + docLinks.length;

  return (
    <>
      {/* Documents */}
      <div>
        <RuleHead
          label="Documents"
          meta={docCount > 0 ? `${docCount} on file` : 'None filed yet'}
          open={open === 'documents'}
          onToggle={() => onToggle('documents')}
        />
        {open === 'documents' ? (
          docCount > 0 ? (
            <ul className="divide-y divide-border-subtle pb-4">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                  <Icon name="document" size={17} className="shrink-0 text-text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="clamp-1 text-body text-text-primary">{doc.title}</p>
                    <p className="mt-0.5 text-meta text-text-muted">
                      {DOC_KIND[doc.kind]} · {doc.issuer} · {formatDate(doc.issuedAt)}
                    </p>
                  </div>
                  {doc.verified ? (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 text-meta font-semibold text-commerce-trust"
                      title="Record verified"
                    >
                      <Icon name="verified" filled size={14} />
                      Verified
                    </span>
                  ) : (
                    <span className="shrink-0 text-meta text-text-muted">On file</span>
                  )}
                </li>
              ))}
              {docLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pressable flex items-center gap-3 py-2.5 first:pt-0"
                  >
                    <Icon name="document" size={17} className="shrink-0 text-text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="clamp-1 text-body text-text-primary">{link.label}</p>
                      <p className="mt-0.5 text-meta text-text-muted">
                        Filed terms — opens externally
                      </p>
                    </div>
                    <Icon name="forward" size={15} className="shrink-0 text-text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pb-4 text-body text-text-secondary">
              No documents filed yet — the diligence file publishes before allocation.
            </p>
          )
        ) : null}
      </div>

      {/* Audit trail */}
      {auditEvents.length > 0 ? (
        <div>
          <RuleHead
            label="Audit trail"
            meta={`${auditEvents.length} ${auditEvents.length === 1 ? 'event' : 'events'}`}
            open={open === 'audit'}
            onToggle={() => onToggle('audit')}
          />
          {open === 'audit' ? (
            <ul className="divide-y divide-border-subtle pb-4">
              {auditEvents.map((e, i) => (
                <li
                  key={`${e.eventType}-${e.createdAt}-${i}`}
                  className="flex items-baseline justify-between gap-6 py-2"
                >
                  <span className="text-body text-text-primary">
                    {humaniseEventType(e.eventType)}
                    {e.changedByLabel ? (
                      <span className="text-text-secondary"> · {e.changedByLabel}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-meta text-text-muted">
                    {formatDate(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
