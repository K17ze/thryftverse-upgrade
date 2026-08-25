# ThryftVerse — Disaster Recovery Runbook

**Last updated:** 2026-08-21
**Owner:** SRE / Platform Team
**Review cadence:** Quarterly

---

## Contact List & Escalation

| Role | Primary | Secondary | Contact |
|------|---------|-----------|---------|
| Incident Commander | SRE Lead | Senior SRE | PagerDuty: SRE-PD |
| Database Admin | DBA Lead | Backend Lead | PagerDuty: DBA-PD |
| API Lead | Backend Lead | Senior Backend Eng | Slack: #backend-oncall |
| Frontend Lead | Mobile Lead | Senior Mobile Eng | Slack: #mobile-oncall |
| Security Officer | CISO | Security Lead | PagerDuty: SEC-PD |
| EAS / Expo Admin | Mobile Lead | DevOps Eng | Slack: #devops-oncall |

### Escalation procedure

1. **Detect** — Alert fires (PagerDuty, Sentry, PostHog, Uptime monitor).
2. **Acknowledge** — On-call engineer acknowledges within 5 minutes.
3. **Assess** — Determine severity (P0/P1/P2) and which scenario applies.
4. **Communicate** — Post in `#incident-channel` with severity, impact, and IC.
5. **Execute** — Follow the relevant scenario below.
6. **Resolve** — Confirm recovery, close the incident.
7. **Post-mortem** — Within 48h, write a blameless post-mortem.

---

## Scenario 1: Database Failure (PostgreSQL)

**Detection:**
- API health check returns 503 (`/health` reports DB unreachable).
- Sentry spike in `ECONNREFUSED` or `query timeout` errors.
- PostHog error rate > 5% on DB-dependent endpoints.

**RTO:** 15 minutes
**RPO:** 5 minutes (WAL streaming + 5-min backup interval)

### Response steps

1. **Verify the failure:**
   ```bash
   psql "$DATABASE_URL" -c "SELECT 1;"
   ```
   If connection refused, proceed to failover.

2. **Promote the replica:**
   ```bash
   # On the replica host:
   pg_ctl promote -D /var/lib/postgresql/data
   ```
   Update `DATABASE_URL` to point to the promoted replica.

3. **Restart the API:**
   ```bash
   docker compose --env-file .env.production restart api
   ```

4. **Verify recovery:**
   ```bash
   curl -s https://api.thryftverse.com/health | jq .
   ```

5. **Rebuild replication:** Once the primary is restored, configure it as a
   new replica following the new primary. Re-establish WAL streaming.

6. **Notify:** Post recovery confirmation in `#incident-channel`.

---

## Scenario 2: Redis Failure

**Detection:**
- BullMQ workers report `ECONNREFUSED` to Redis.
- API rate limiting degrades (Redis-backed rate limiter unavailable).
- Session cache misses spike.

**RTO:** 10 minutes
**RPO:** 0 (Redis is a cache; no persistent data loss)

### Response steps

1. **Verify the failure:**
   ```bash
   redis-cli -u "$REDIS_URL" ping
   ```
   If no response, the API automatically falls back to in-memory rate
   limiting (configured in `@fastify/rate-limit` with `redis` optional).

2. **Restart Redis:**
   ```bash
   docker compose --env-file .env.production restart redis
   ```

3. **If Redis cannot restart, deploy a new instance:**
   ```bash
   docker compose --env-file .env.production up -d redis-new
   ```
   Update `REDIS_URL` and restart workers:
   ```bash
   docker compose --env-file .env.production restart api worker
   ```

4. **Verify recovery:**
   ```bash
   redis-cli -u "$REDIS_URL" ping
   curl -s https://api.thryftverse.com/health | jq .
   ```

5. **Rehydrate caches:** BullMQ jobs resume automatically. Rate limit
   counters reset (acceptable — temporary burst possible).

---

## Scenario 3: API Outage

**Detection:**
- Uptime monitor reports API unreachable for > 2 consecutive checks.
- All endpoints return 502/503.
- EAS Observe reports 0% success rate.

**RTO:** 10 minutes
**RPO:** N/A (stateless API)

### Response steps

1. **Check container status:**
   ```bash
   docker compose --env-file .env.production ps api
   docker compose --env-file .env.production logs api --tail 100
   ```

2. **Attempt restart:**
   ```bash
   docker compose --env-file .env.production restart api
   ```

3. **If restart fails, rollback to the previous image:**
   ```bash
   docker compose --env-file .env.production pull api
   # Rollback to previous tag:
   docker run -d --name api-rollback \
     -p 4000:4000 \
     --env-file .env.production \
     ghcr.io/thryftverse/api:<previous-tag>
   ```

4. **Rollback OTA update (if the outage is client-side):**
   ```bash
   cd frontend
   eas update:republish \
     --update-id <last-known-good-update-id> \
     --channel production \
     --message "rollback: API outage recovery"
   ```

5. **Verify recovery:**
   ```bash
   curl -s https://api.thryftverse.com/health | jq .
   ```

6. **Notify users** if the outage was user-visible (in-app banner via OTA).

---

## Scenario 4: S3 / Media Failure

**Detection:**
- Image upload presign requests fail.
- CDN returns 5xx for media assets.
- Sentry reports `NoSuchBucket` or `AccessDenied` from S3 SDK.

**RTO:** 20 minutes
**RPO:** 0 (S3 provides 11 nines durability)

### Response steps

1. **Verify S3 connectivity:**
   ```bash
   aws s3 ls s3://$S3_BUCKET --endpoint-url "$S3_ENDPOINT"
   ```

2. **If S3 is unavailable, failover to the CDN cache:**
   - The CDN (CloudFront / Bunny CDN) continues serving cached media.
   - Update `S3_CDN_BASE_URL` to point to the backup CDN if the primary
     CDN is also affected.

3. **If the bucket is lost, restore from backup:**
   ```bash
   aws s3 sync s3://thryftverse-media-backup/ s3://thryftverse-media/ \
     --endpoint-url "$S3_ENDPOINT"
   ```

4. **Restart the API** to pick up any credential changes:
   ```bash
   docker compose --env-file .env.production restart api
   ```

5. **Verify media serving:**
   ```bash
   curl -I "$S3_CDN_BASE_URL/test-image.jpg"
   ```

6. **Re-enable uploads** once S3 is healthy.

---

## Scenario 5: Search Failure (Meilisearch)

**Detection:**
- Search endpoints return 500 or empty results.
- Meilisearch health check fails.
- PostHog shows 0% search success rate.

**RTO:** 5 minutes
**RPO:** 1 hour (reindex from PostgreSQL)

### Response steps

1. **Verify Meilisearch:**
   ```bash
   curl -s "$MEILISEARCH_URL/health"
   ```

2. **Fallback to PostgreSQL ILIKE search:**
   The `createSearchAdapter()` factory in `searchAdapter.ts` automatically
   falls back to `InMemorySearchAdapter` when `MEILISEARCH_URL` is unset.
   To force the fallback:
   ```bash
   # Temporarily unset MEILISEARCH_URL and restart
   docker compose --env-file .env.production stop meilisearch
   docker compose --env-file .env.production restart api
   ```

3. **Restart Meilisearch:**
   ```bash
   docker compose --env-file .env.production restart meilisearch
   ```

4. **Reindex from PostgreSQL:**
   ```bash
   cd backend/api
   npm run search:sync
   ```

5. **Verify search:**
   ```bash
   curl -s "https://api.thryftverse.com/search?q=test" | jq .
   ```

6. **Re-enable Meilisearch adapter** by restoring `MEILISEARCH_URL` and
   restarting the API.

---

## Scenario 6: Full Region Failure

**Detection:**
- All services in the primary region are unreachable.
- Uptime monitors report 0% across all endpoints.
- Cloud provider status page confirms regional outage.

**RTO:** 60 minutes
**RPO:** 5 minutes (for DB); 0 (for stateless services)

### Response steps

1. **Declare a P0 incident** and notify the IC.

2. **Activate the DR region:**
   - DNS failover: Update the primary DNS record (api.thryftverse.com)
     to point to the DR region load balancer.
     ```bash
     # Using Cloudflare / Route 53:
     # Update the A record to the DR region IP
     ```
   - CDN failover: Update the CDN origin to the DR region S3 / media
     endpoint.

3. **Promote the DR database replica:**
   ```bash
   # On the DR replica host:
   pg_ctl promote -D /var/lib/postgresql/data
   ```

4. **Start services in the DR region:**
   ```bash
   docker compose --env-file .env.dr up -d --build
   ```

5. **Publish an OTA update** pointing the app to the DR API URL:
   ```bash
   cd frontend
   eas update \
     --channel production \
     --message "DR failover: pointing to backup region" \
     --rollout-percentage 100
   ```

6. **Verify all services** in the DR region:
   ```bash
   curl -s https://api-dr.thryftverse.com/health | jq .
   ```

7. **Once the primary region recovers**, re-establish replication from
   the DR primary back to the primary region, then fail back.

---

## Scenario 7: Data Corruption

**Detection:**
- Application errors on specific records (malformed JSON, missing fields).
- Audit logs show unexpected data modifications.
- Sentry reports schema validation errors (Zod parse failures).

**RTO:** 30 minutes
**RPO:** 5 minutes (point-in-time recovery via WAL)

### Response steps

1. **Identify the scope of corruption:**
   ```bash
   # Query the affected tables for anomalies
   psql "$DATABASE_URL" -c "SELECT id, created_at FROM listings WHERE title IS NULL;"
   ```

2. **Determine the corruption timestamp** from audit logs or Sentry events.

3. **Perform point-in-time recovery:**
   ```bash
   # Stop the API to prevent further writes
   docker compose --env-file .env.production stop api

   # Restore from the most recent base backup + WAL up to the
   # corruption timestamp
   pg_basebackup -D /var/lib/postgresql/restore -X stream -c fast
   # Apply WAL up to the target recovery point:
   # Set recovery_target_time in postgresql.conf to the timestamp
   # just before corruption occurred
   pg_ctl start -D /var/lib/postgresql/restore
   ```

4. **Verify the restored data:**
   ```bash
   psql "$DATABASE_URL" -c "SELECT count(*) FROM listings;"
   ```

5. **Restart the API:**
   ```bash
   docker compose --env-file .env.production start api
   ```

6. **Notify users** if any user-generated content was lost (offer
   re-upload assistance).

---

## Scenario 8: Security Incident

**Detection:**
- Sentry reports unusual authentication patterns.
- PostHog shows traffic from unexpected IP ranges.
- Alerting webhook receives security scanner alerts.
- Suspicious API key usage detected.

**RTO:** 15 minutes (containment); 2 hours (full recovery)
**RPO:** N/A

### Response steps

1. **Declare a security incident** and notify the Security Officer (CISO).

2. **Rotate all exposed secrets immediately:**
   ```bash
   # Run the secrets rotation script to identify all secrets:
   bash backend/scripts/secrets-rotation.sh

   # Rotate the compromised secret(s) following the documented procedure
   # for each one.
   ```

3. **Invalidate all active tokens:**
   ```bash
   # Invalidate all JWTs by rotating JWT_SECRET:
   # 1. Generate a new secret:
   openssl rand -base64 64
   # 2. Update JWT_SECRET in the environment
   # 3. Restart the API — all existing tokens become invalid
   docker compose --env-file .env.production restart api
   ```

4. **Revoke EAS tokens and OTA signing keys:**
   ```bash
   # Revoke the compromised EXPO_TOKEN:
   # Go to expo.dev → Settings → Access Tokens → Revoke

   # Rotate OTA code signing key:
   eas update:configure-code-signing --key-output-directory ../keys
   eas secret:create --scope project \
     --name EXPO_PUBLIC_OTA_CODE_SIGNING_KEY --value <new-key>
   # Build a new binary with the new public key
   ```

5. **Audit access logs:**
   ```bash
   # Review API access logs for the incident window
   docker compose --env-file .env.production logs api --since 24h | \
     grep -E "(POST|PUT|DELETE)" > /tmp/security-audit.log
   ```

6. **Block compromised IP ranges** at the CDN / WAF level.

7. **Notify affected users** if PII was exposed (GDPR Article 34
   notification within 72 hours).

8. **Document the incident** in the security incident log and conduct a
   full post-mortem within 48 hours.

---

## Backup Verification

| Backup | Frequency | Location | Retention | Verification |
|--------|-----------|----------|-----------|-------------|
| PostgreSQL | Daily + WAL streaming | S3 (encrypted) | 30 days | Weekly restore test |
| Redis | N/A (cache only) | — | — | — |
| S3 Media | Cross-region replication | S3 backup bucket | 90 days | Monthly integrity check |
| EAS Updates | EAS-hosted | Expo cloud | Indefinite | `eas update:list` |

### Weekly backup restore test

```bash
# Restore the latest DB backup to a test instance and verify:
BACKUP_FILE=$(aws s3 ls s3://thryftverse-db-backups/ | sort | tail -1 | awk '{print $4}')
aws s3 cp "s3://thryftverse-db-backups/$BACKUP_FILE" /tmp/test-restore.dump
pg_restore -d postgresql://test:test@localhost:5432/thryftverse_test -c /tmp/test-restore.dump
psql postgresql://test:test@localhost:5432/thryftverse_test -c "SELECT count(*) FROM users;"
```
