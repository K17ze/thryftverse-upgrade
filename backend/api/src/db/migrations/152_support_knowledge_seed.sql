-- 151: Seed initial support knowledge articles
--
-- Provides a minimal but real knowledge base for the support assistant.
-- These articles are versioned, published, and searchable via the
-- tsvector GIN index created in migration 150.
--
-- Idempotent: uses ON CONFLICT DO NOTHING for articles and checks
-- for existing versions before inserting.

-- ── Article: Platform charge and buyer protection ──
INSERT INTO support_articles (id, slug, product_area, owner_team, audience, default_locale, state)
VALUES ('art_platform_charge', 'platform-charge-and-buyer-protection', 'buying', 'support', 'public', 'en', 'published')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO support_article_versions (id, article_id, version, title, body_markdown, jurisdiction, effective_from, effective_to, approved_by, approved_at, checksum, created_at)
SELECT 'artv_platform_charge_v1', 'art_platform_charge', 1,
  'Platform charge and buyer protection',
  'ThryftVerse applies a platform charge to each checkout. This funds secure payments, delivery issue handling, and buyer support if an item does not arrive or is significantly misdescribed.

If your item does not arrive or does not match the description, you can file a buyer protection claim within 2 days of delivery. The platform charge covers:
- Secure payment processing
- Delivery issue investigation
- Refund processing for eligible claims
- Seller dispute resolution

To file a claim, go to the order detail page, tap "Buyer Protection", and select "File a claim".',
  NULL, NOW(), NULL, NULL, NOW(),
  encode(sha256('artv_platform_charge_v1'::bytea), 'hex'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM support_article_versions WHERE id = 'artv_platform_charge_v1');

-- ── Article: Withdrawing your balance ──
INSERT INTO support_articles (id, slug, product_area, owner_team, audience, default_locale, state)
VALUES ('art_withdraw_balance', 'withdrawing-your-balance', 'selling', 'support', 'public', 'en', 'published')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO support_article_versions (id, article_id, version, title, body_markdown, jurisdiction, effective_from, effective_to, approved_by, approved_at, checksum, created_at)
SELECT 'artv_withdraw_balance_v1', 'art_withdraw_balance', 1,
  'Withdrawing your balance',
  'To withdraw your seller balance, go to Profile → Balance → Withdraw. You must add a bank account first if you have not already done so.

Withdrawals typically take 1-3 business days to appear in your bank account. The minimum withdrawal amount is £10.

If your withdrawal is delayed beyond 5 business days, please contact support so we can investigate with our payment provider.',
  NULL, NOW(), NULL, NULL, NOW(),
  encode(sha256('artv_withdraw_balance_v1'::bytea), 'hex'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM support_article_versions WHERE id = 'artv_withdraw_balance_v1');

-- ── Article: Fees and pricing ──
INSERT INTO support_articles (id, slug, product_area, owner_team, audience, default_locale, state)
VALUES ('art_fees_and_pricing', 'fees-and-pricing', 'selling', 'support', 'public', 'en', 'published')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO support_article_versions (id, article_id, version, title, body_markdown, jurisdiction, effective_from, effective_to, approved_by, approved_at, checksum, created_at)
SELECT 'artv_fees_v1', 'art_fees_and_pricing', 1,
  'Fees and pricing',
  'ThryftVerse charges a 5% service fee on each sale, plus a fixed transaction fee of £0.70. Buyers also pay a platform charge on top of the item price.

The service fee is deducted from your payout automatically. You do not need to invoice or pay it separately.

For auction listings, the same fee structure applies to the final hammer price.',
  NULL, NOW(), NULL, NULL, NOW(),
  encode(sha256('artv_fees_v1'::bytea), 'hex'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM support_article_versions WHERE id = 'artv_fees_v1');

-- ── Article: Cancellation and returns ──
INSERT INTO support_articles (id, slug, product_area, owner_team, audience, default_locale, state)
VALUES ('art_cancellation_returns', 'cancellation-and-returns', 'buying', 'support', 'public', 'en', 'published')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO support_article_versions (id, article_id, version, title, body_markdown, jurisdiction, effective_from, effective_to, approved_by, approved_at, checksum, created_at)
SELECT 'artv_cancellation_v1', 'art_cancellation_returns', 1,
  'Cancellation and returns',
  'Buyers can request a cancellation within 1 hour of purchase. After that, the order may have been accepted and paid for by the seller.

Returns and issue handling are covered under our platform charge support policy when items do not match the description. To request a return:
1. Go to the order detail page
2. Tap "Support" or "Buyer Protection"
3. Select "Not as described" or "Item arrived damaged"
4. Provide details and evidence photos

You must file a claim within 2 days of delivery.',
  NULL, NOW(), NULL, NULL, NOW(),
  encode(sha256('artv_cancellation_v1'::bytea), 'hex'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM support_article_versions WHERE id = 'artv_cancellation_v1');

-- ── Article: Reporting fake or misleading listings ──
INSERT INTO support_articles (id, slug, product_area, owner_team, audience, default_locale, state)
VALUES ('art_report_listing', 'reporting-fake-or-misleading-listings', 'safety', 'trust_safety', 'public', 'en', 'published')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO support_article_versions (id, article_id, version, title, body_markdown, jurisdiction, effective_from, effective_to, approved_by, approved_at, checksum, created_at)
SELECT 'artv_report_v1', 'art_report_listing', 1,
  'Reporting fake or misleading listings',
  'If you see a listing that appears fake, counterfeit, or misleading, you can report it directly from the listing page:

1. Tap the three-dot menu on the item page
2. Select "Report"
3. Choose the reason (counterfeit, misleading description, prohibited item, etc.)
4. Add any additional details

Our moderation team reviews flagged items as quickly as possible. You will receive a notification when the review is complete.

For counterfeit or safety concerns, do not contact the seller directly. Use the report flow so our trust and safety team can investigate properly.',
  NULL, NOW(), NULL, NULL, NOW(),
  encode(sha256('artv_report_v1'::bytea), 'hex'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM support_article_versions WHERE id = 'artv_report_v1');

-- ── Article: Account security and recovery ──
INSERT INTO support_articles (id, slug, product_area, owner_team, audience, default_locale, state)
VALUES ('art_account_security', 'account-security-and-recovery', 'account', 'support', 'public', 'en', 'published')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO support_article_versions (id, article_id, version, title, body_markdown, jurisdiction, effective_from, effective_to, approved_by, approved_at, checksum, created_at)
SELECT 'artv_account_security_v1', 'art_account_security', 1,
  'Account security and recovery',
  'If you cannot log in, try resetting your password from the login screen. If you still cannot access your account, contact support and we will help you verify your identity.

If you suspect your account has been compromised:
1. Change your password immediately from Settings → Security
2. Enable two-factor authentication if available
3. Contact support so we can review recent activity

Never share your password, verification codes, or full payment details with anyone. ThryftVerse staff will never ask for your full password or complete card number.',
  NULL, NOW(), NULL, NULL, NOW(),
  encode(sha256('artv_account_security_v1'::bytea), 'hex'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM support_article_versions WHERE id = 'artv_account_security_v1');

-- ── Article: DSA — reporting illegal content ──
INSERT INTO support_articles (id, slug, product_area, owner_team, audience, default_locale, state)
VALUES ('art_dsa_report_illegal', 'reporting-illegal-content', 'safety', 'trust_safety', 'public', 'en', 'published')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO support_article_versions (id, article_id, version, title, body_markdown, jurisdiction, effective_from, effective_to, approved_by, approved_at, checksum, created_at)
SELECT 'artv_dsa_illegal_v1', 'art_dsa_report_illegal', 1,
  'Reporting illegal content',
  'Under the Digital Services Act (DSA), you have the right to report illegal content on ThryftVerse. Reports are free of charge and will be reviewed by our trust and safety team.

To report illegal content:
1. Use the "Report" button on the relevant listing, profile, or message
2. Select "Illegal content" as the reason
3. Provide a clear description of why the content is illegal

You will receive a receipt with a tracking reference. Once reviewed, you will receive a reasoned decision. If you disagree with the decision, you can request an internal review and, where applicable, seek out-of-court dispute settlement.',
  'EU', NOW(), NULL, NULL, NOW(),
  encode(sha256('artv_dsa_illegal_v1'::bytea), 'hex'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM support_article_versions WHERE id = 'artv_dsa_illegal_v1');

-- ── Article: DSA — appealing moderation decisions ──
INSERT INTO support_articles (id, slug, product_area, owner_team, audience, default_locale, state)
VALUES ('art_dsa_appeal', 'appealing-moderation-decisions', 'safety', 'trust_safety', 'public', 'en', 'published')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO support_article_versions (id, article_id, version, title, body_markdown, jurisdiction, effective_from, effective_to, approved_by, approved_at, checksum, created_at)
SELECT 'artv_dsa_appeal_v1', 'art_dsa_appeal', 1,
  'Appealing moderation decisions',
  'If ThryftVerse has made a moderation decision that you disagree with (such as removing a listing or suspending your account), you have the right to appeal.

To appeal:
1. Open the support case associated with the decision
2. Tap "Appeal"
3. Provide your reason for appealing

Appeals are reviewed by a different team member than the original decision. You will receive a reasoned outcome. Decisions are not based solely on automated means — a human reviews every appeal.

Where applicable, you may also seek out-of-court dispute settlement through a certified body.',
  'EU', NOW(), NULL, NULL, NOW(),
  encode(sha256('artv_dsa_appeal_v1'::bytea), 'hex'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM support_article_versions WHERE id = 'artv_dsa_appeal_v1');

-- ── Populate article chunks for search ──
-- Each article version gets a single chunk containing the full body.
-- In production, longer articles would be split into multiple chunks.

INSERT INTO support_article_chunks (id, article_version_id, ordinal, text)
SELECT 'chunk_' || v.id || '_0', v.id, 0, v.title || E'\n\n' || v.body_markdown
FROM support_article_versions v
WHERE NOT EXISTS (SELECT 1 FROM support_article_chunks c WHERE c.article_version_id = v.id);

-- ── Comments ──
COMMENT ON TABLE support_articles IS 'Governed knowledge articles with audience, jurisdiction, and version control (seeded in migration 151)';
