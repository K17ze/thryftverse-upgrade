# Research ledger — post-audit closure campaign — 2026-09-21

| Claim supported | Source | Class | Accessed |
|---|---|---|---|
| Mollie payment webhook delivers only `id`; status MUST be fetched via API; fake calls must never process orders | docs.mollie.com/reference/webhooks | PRIMARY DOC | 2026-09-21 |
| Mollie new-webhook system: X-Mollie-Signature HMAC + Webhook Events API payload verification; secret rotation supported | docs.mollie.com/reference/webhooks-best-practices | PRIMARY DOC | 2026-09-21 |
| Rekognition DetectModerationLabels Image accepts ONLY Bytes (≤5MB) or S3Object{Bucket,Name,Version} — no Url field | AWS API Reference + Boto3 docs | PRIMARY DOC | 2026-09-21 |
| RN `adjustable` role requires accessibilityActions increment/decrement + onAccessibilityAction (VoiceOver swipe / TalkBack volume keys) | reactnative.dev/docs/accessibility | PRIMARY DOC | 2026-09-21 |
| Idempotency: INSERT ON CONFLICT claim BEFORE mutation inside transaction; store request fingerprint; replay stored response; concurrent duplicate → 409/wait | distributedrequest.com + industry pattern refs | SECONDARY/PRIMARY pattern | 2026-09-21 |
| pgvector: HNSW default, vector_cosine_ops for normalized embeddings, halfvec optional; 0.8.x current | pgxn.org/dist/vector + postgres.ai | PRIMARY DOC | 2026-09-21 |
| Depop launched "Outfits" shoppable moodboard/collage tool (scissor icon, bg removal, all items shoppable, share static image) — direct moodboard competitor | news.depop.com + TechCrunch | PRIMARY + SECONDARY | 2026-09-21 |
| Vinted Oct-2026 terms: Buyer Protection fee rename, counterfeit verification, Vinted Pay migration — trust transparency pressure | valueaddedresource.net | SECONDARY | 2026-09-21 |
| Expo SDK 54 = RN 0.81, New Arch default; SDK 55 = RN 0.83 New-Arch-only; repo is already on Expo ~57 / RN 0.86 / React 19.2 | expo.dev/changelog/sdk-54 + frontend/package.json | PRIMARY DOC + DIRECT OBSERVATION | 2026-09-21 |
| Baymard 2026: 70.19% cart abandonment; linear checkout, no new fees at review, one prominent primary action | baymard.com | SECONDARY (benchmark) | 2026-09-21 |
