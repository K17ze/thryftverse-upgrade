CREATE TABLE IF NOT EXISTS ncmec_reports (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  ncmec_report_id TEXT,
  submitted_by TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'acknowledged', 'failed', 'retracted')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ncmec_reports_case ON ncmec_reports(case_id);
CREATE INDEX IF NOT EXISTS idx_ncmec_reports_ncmec_id ON ncmec_reports(ncmec_report_id);
