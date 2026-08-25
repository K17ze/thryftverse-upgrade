-- Migration 146: Importer assisted extraction results table
--
-- ML-assisted structured extraction from catalogue photos (ML flagship report
-- §6.5, §9.5). When a seller imports items from an external source (eBay,
-- CSV, photos), the system can extract structured fields (brand, category,
-- condition, size, estimated price range) from the item's photos and
-- pre-populate the listing draft.
--
-- CRITICAL DESIGN PRINCIPLE — human confirmation gate:
-- Every extracted field is advisory only. No field enters the listing draft
-- without explicit seller confirmation. The ML never auto-publishes. This
-- table tracks, per extraction run, which fields the seller has confirmed,
-- rejected, or edited, so the publication gate can prove that every material
-- field was seller-approved.
--
-- Schema:
--   * extracted_fields       — JSONB of {field_name: value} from the model
--   * confidence_scores      — JSONB of {field_name: 0.0-1.0} per-field
--   * field_revisions        — JSONB array of seller edit history
--   * seller_confirmed_fields — JSONB array of field names the seller approved
--   * seller_rejected_fields  — JSONB array of field names the seller rejected
--   * seller_edited_fields    — JSONB array of field names the seller edited
--
-- A new extraction run produces a new row (the previous row is superseded),
-- preserving lineage. The extraction_status column tracks the async job
-- lifecycle: pending -> completed | failed | superseded.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS catalog_import_extractions (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  item_id TEXT NOT NULL REFERENCES catalog_import_items(id) ON DELETE CASCADE,
  -- The media asset whose image was analysed. Nullable because an extraction
  -- may be re-run after the asset is deleted; the row is preserved for audit.
  media_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  -- Model lineage: which model and version produced this extraction.
  extraction_model_id TEXT NOT NULL,
  extraction_model_version TEXT NOT NULL,
  -- The extracted fields, e.g.
  --   {"brand": "Nike", "category": "footwear", "condition": "good",
  --    "size": "UK 9", "estimated_price_range": {"min": 20, "max": 35}}
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Per-field confidence in [0.0, 1.0], e.g.
  --   {"brand": 0.92, "category": 0.71, "condition": 0.45}
  confidence_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Append-only history of seller edits: {field, oldValue, newValue, editedAt}
  field_revisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Fields the seller explicitly confirmed as correct.
  seller_confirmed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Fields the seller explicitly rejected (will not enter the listing draft).
  seller_rejected_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Fields the seller edited (the edited value lives in extracted_fields;
  -- the original model value is preserved in field_revisions).
  seller_edited_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'completed', 'failed', 'superseded')),
  error_message TEXT,
  extracted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Lookup by item (the primary access path: "show me the extraction for this item").
CREATE INDEX IF NOT EXISTS catalog_import_extractions_item_idx
  ON catalog_import_extractions (item_id, created_at DESC);

-- Lookup by model (dashboard / "how many extractions did model X produce").
CREATE INDEX IF NOT EXISTS catalog_import_extractions_model_idx
  ON catalog_import_extractions (extraction_model_id, extraction_model_version);

-- Worker sweep: find pending extractions that need processing.
CREATE INDEX IF NOT EXISTS catalog_import_extractions_status_idx
  ON catalog_import_extractions (extraction_status, created_at)
  WHERE extraction_status = 'pending';

COMMENT ON TABLE catalog_import_extractions IS
  'ML-assisted structured extraction results from catalogue photos. Every extracted field is advisory — no field enters a listing draft without explicit seller confirmation. Tracks per-field confidence, seller confirmations, rejections, and edit history.';
COMMENT ON COLUMN catalog_import_extractions.extracted_fields IS
  'JSONB of {field_name: value} extracted by the model (brand, category, condition, size, estimated_price_range, etc.). Seller edits update this column; the original model value is preserved in field_revisions.';
COMMENT ON COLUMN catalog_import_extractions.confidence_scores IS
  'Per-field confidence in [0.0, 1.0]. Low-confidence fields are surfaced to the seller for review but never block publication on their own — the human confirmation gate is the only publication guard.';
COMMENT ON COLUMN catalog_import_extractions.field_revisions IS
  'Append-only array of seller edits: {field, oldValue, newValue, editedAt, sellerUserId}. Preserves the full edit history so an auditor can trace every change from model output to final confirmed value.';
COMMENT ON COLUMN catalog_import_extractions.seller_confirmed_fields IS
  'Array of field names the seller explicitly confirmed as correct. Only confirmed or edited fields may enter the listing draft.';
COMMENT ON COLUMN catalog_import_extractions.seller_rejected_fields IS
  'Array of field names the seller explicitly rejected. Rejected fields do not enter the listing draft.';
COMMENT ON COLUMN catalog_import_extractions.seller_edited_fields IS
  'Array of field names the seller edited. The edited value lives in extracted_fields; the original model value is in field_revisions. An edited field is treated as confirmed for publication purposes.';
COMMENT ON COLUMN catalog_import_extractions.extraction_status IS
  'pending = job queued, completed = model returned (possibly empty), failed = model error, superseded = a newer extraction run replaced this one.';
