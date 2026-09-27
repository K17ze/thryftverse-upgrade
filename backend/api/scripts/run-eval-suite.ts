/**
 * Support-agent eval suite runner (audit R112).
 *
 * Runs SEED_EVAL_CASES from src/support/evalSuite.ts through the real
 * routing service and reports pass/fail per case plus hard launch-gate
 * violations (prompt injection, cross-user isolation, mandatory handoff).
 *
 * Infra requirements: NONE today. routeMessage() is a deterministic
 * keyword/regex classifier — it accepts a pg Pool for future
 * context-aware routing but never issues a query, and no LLM/provider
 * calls are made. If DATABASE_URL is set it is used to construct the
 * pool; otherwise a lazy default pool is created that never connects.
 * If a future router version queries the db or calls a provider, set
 * DATABASE_URL (and provider env) and run this against staging — do not
 * add it to CI until the suite is green.
 *
 * Usage:
 *   npm run eval:suite
 *   tsx scripts/run-eval-suite.ts
 *
 * Exit codes:
 *   0 = every case passed and no hard launch-gate violations
 *   1 = one or more case failures or hard-gate violations
 */
import { Pool } from 'pg';
import {
  runEvalSuite,
  SEED_EVAL_CASES,
  type EvalRunnerDeps,
} from '../src/support/evalSuite.js';
import { routeMessage } from '../src/support/routingService.js';
import type { SupportEntryContext } from '../src/support/contracts.js';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://thryftverse:thryftverse@localhost:5432/thryftverse',
  max: 1,
});

const deps: EvalRunnerDeps = {
  db: pool,
  routeMessage: (db, conversationId, messageBody, contextKind) =>
    routeMessage(db, conversationId, messageBody, contextKind as SupportEntryContext['kind']),
};

async function main(): Promise<number> {
  console.log(`[eval:suite] running ${SEED_EVAL_CASES.length} seed eval cases\n`);

  const { results, summary } = await runEvalSuite(deps);

  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${result.testCaseId}`);
    for (const failure of result.failures) {
      console.log(`       - ${failure}`);
    }
  }

  console.log('\n[eval:suite] summary');
  console.log(`  total: ${summary.totalCases} | passed: ${summary.passed} | failed: ${summary.failed}`);
  console.log(`  pass rate: ${(summary.passRate * 100).toFixed(1)}%`);
  console.log('  category breakdown:');
  for (const [category, breakdown] of Object.entries(summary.categoryBreakdown)) {
    if (breakdown.total === 0) continue;
    console.log(`    ${category}: ${breakdown.passed}/${breakdown.total}`);
  }

  if (summary.hardGateViolations.length > 0) {
    console.error('\n[eval:suite] HARD LAUNCH-GATE VIOLATIONS:');
    for (const violation of summary.hardGateViolations) {
      console.error(`  - ${violation}`);
    }
  }

  return summary.failed > 0 || summary.hardGateViolations.length > 0 ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (err) {
  console.error(`[eval:suite] runner error: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
