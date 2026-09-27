/**
 * beneficiaries — pure field validators for cross-border payout recipients:
 * ISO 13616 IBAN (per-country length + MOD-97), ISO 9362 BIC, Indian IFSC,
 * US ABA routing (3-7-1 checksum), UK sort code, generic account numbers,
 * country→account-type suggestion, and whole-payload validation with the
 * serialisable validationReport.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  BENEFICIARY_ACCOUNT_REQUIREMENTS,
  suggestAccountType,
  validateAbaRouting,
  validateBeneficiaryFields,
  validateBic,
  validateIban,
  validateIfsc,
  validateSortCode,
} from "./beneficiaries.js";

// ── validateIban ─────────────────────────────────────────────────────────────

test("validateIban accepts registry-valid IBANs and reports the country", () => {
  for (const [iban, country] of [
    ["GB29NWBK60161331926819", "GB"],
    ["DE89370400440532013000", "DE"],
    ["FR1420041010050500013M02606", "FR"],
  ] as const) {
    const result = validateIban(iban);
    assert.equal(result.valid, true, iban);
    assert.equal(result.normalized, iban);
    assert.equal(result.countryCode, country);
    assert.deepEqual(result.errors, []);
  }
});

test("validateIban normalises lowercase and spaced input", () => {
  const result = validateIban("gb29 nwbk 6016 1331 9268 19");
  assert.equal(result.valid, true);
  assert.equal(result.normalized, "GB29NWBK60161331926819");
  assert.equal(result.countryCode, "GB");
});

test("validateIban fails a corrupted check digit via MOD-97", () => {
  const result = validateIban("GB33NWBK60161331926819"); // 29 → 33
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("checksum failed")));
});

test("validateIban fails a wrong per-country length", () => {
  const result = validateIban("GB29NWBK601613319268"); // 20 chars, GB requires 22
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("does not match the GB IBAN length")));
});

test("validateIban fails an unknown country prefix", () => {
  const result = validateIban("ZZ2912345678901234567");
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("'ZZ' is not an ISO 13616")));
});

test("validateIban fails empty, non-alphanumeric, and non-numeric check digits", () => {
  assert.equal(validateIban("").valid, false);
  assert.deepEqual(validateIban("").errors, ["IBAN is required"]);

  const dashed = validateIban("GB29-NWBK-6016-1331-9268-19");
  assert.equal(dashed.valid, false);
  assert.ok(dashed.errors.some((e) => e.includes("only letters and digits")));

  const badCheck = validateIban("GBXXNWBK60161331926819");
  assert.equal(badCheck.valid, false);
  assert.ok(badCheck.errors.some((e) => e.includes("check digits")));
});

// ── validateBic ──────────────────────────────────────────────────────────────

test("validateBic accepts 8- and 11-character ISO 9362 codes", () => {
  for (const bic of ["DEUTDEFF", "DEUTDEFF500"]) {
    const result = validateBic(bic);
    assert.equal(result.valid, true, bic);
    assert.equal(result.normalized, bic);
  }
  const lower = validateBic("deut deff");
  assert.equal(lower.valid, true);
  assert.equal(lower.normalized, "DEUTDEFF");
});

test("validateBic rejects malformed codes", () => {
  for (const bad of ["", "DEUTDE", "DEUTDEFF5", "DEUTDEFF5000", "DE1TDEFF"]) {
    assert.equal(validateBic(bad).valid, false, bad);
  }
  assert.deepEqual(validateBic("").errors, ["BIC/SWIFT code is required"]);
});

// ── validateIfsc ─────────────────────────────────────────────────────────────

test("validateIfsc accepts a well-formed IFSC and normalises case", () => {
  const result = validateIfsc("SBIN0005943");
  assert.equal(result.valid, true);
  assert.equal(result.normalized, "SBIN0005943");
  assert.equal(validateIfsc("sbin0005943").valid, true);
});

test("validateIfsc rejects bad length, bad bank prefix, and a non-zero fifth char", () => {
  for (const bad of ["", "SBIN000594", "SBIN00059430", "SBIN1005943", "5BIN0005943"]) {
    assert.equal(validateIfsc(bad).valid, false, bad);
  }
});

// ── validateAbaRouting ───────────────────────────────────────────────────────

test("validateAbaRouting accepts a checksum-valid routing number", () => {
  const result = validateAbaRouting("021000021");
  assert.equal(result.valid, true);
  assert.equal(result.normalized, "021000021");
  // Dashes/spaces are stripped before the checksum.
  assert.equal(validateAbaRouting("021-000-021").normalized, "021000021");
});

test("validateAbaRouting rejects a broken checksum and non-9-digit input", () => {
  const broken = validateAbaRouting("021000022");
  assert.equal(broken.valid, false);
  assert.ok(broken.errors.some((e) => e.includes("checksum failed")));

  for (const bad of ["", "02100002", "0210000210", "abcdefghi"]) {
    assert.equal(validateAbaRouting(bad).valid, false, bad);
  }
});

// ── validateSortCode ─────────────────────────────────────────────────────────

test("validateSortCode accepts dashed input and normalises to six digits", () => {
  const result = validateSortCode("20-00-00");
  assert.equal(result.valid, true);
  assert.equal(result.normalized, "200000");
  assert.equal(validateSortCode("200000").valid, true);
});

test("validateSortCode rejects letters and wrong lengths", () => {
  for (const bad of ["", "20000", "2000000", "20-00-0a"]) {
    assert.equal(validateSortCode(bad).valid, false, bad);
  }
});

// ── suggestAccountType ───────────────────────────────────────────────────────

test("suggestAccountType maps destination countries to their domestic rail", () => {
  assert.equal(suggestAccountType("GB"), "sort_code");
  assert.equal(suggestAccountType("US"), "aba");
  assert.equal(suggestAccountType("IN"), "ifsc");
  assert.equal(suggestAccountType("DE"), "iban");
  assert.equal(suggestAccountType("FR"), "iban");
  assert.equal(suggestAccountType("JP"), "swift_code");
  // Normalisation: lowercase and padded input resolves identically.
  assert.equal(suggestAccountType(" gb "), "sort_code");
});

// ── validateBeneficiaryFields ────────────────────────────────────────────────

test("validateBeneficiaryFields validates and normalises a complete IBAN beneficiary", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const result = validateBeneficiaryFields(
    {
      countryCode: "de",
      currency: "eur",
      accountType: "iban",
      fields: {
        iban: "de89 3704 0044 0532 0130 00",
        bic: "deutdeff",
        accountHolder: "Ada Lovelace",
      },
    },
    { now },
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalizedFields.iban, "DE89370400440532013000");
  assert.equal(result.normalizedFields.bic, "DEUTDEFF");
  assert.equal(result.normalizedFields.accountHolder, "Ada Lovelace");
  assert.equal(result.validationReport.checkedAt, now.toISOString());

  const checks = result.validationReport.checks;
  for (const field of ["countryCode", "currency", "accountType", "iban", "bic"]) {
    const entry = checks.find((c) => c.field === field);
    assert.ok(entry, `expected a check entry for ${field}`);
    assert.equal(entry.result, "pass", field);
  }
  assert.ok(checks.find((c) => c.field === "iban")?.detail.includes("MOD-97"));
});

test("validateBeneficiaryFields reports missing required fields", () => {
  const result = validateBeneficiaryFields({
    countryCode: "GB",
    currency: "GBP",
    accountType: "sort_code",
    fields: { sortCode: "20-00-00" }, // accountNumber missing
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("accountNumber is required"));
  const check = result.validationReport.checks.find((c) => c.field === "accountNumber");
  assert.equal(check?.result, "fail");
  assert.equal(check?.detail, "missing required field");
  // The field that did validate still lands normalised in the report.
  assert.equal(result.normalizedFields.sortCode, "200000");
});

test("validateBeneficiaryFields rejects a malformed optional BIC", () => {
  const result = validateBeneficiaryFields({
    countryCode: "DE",
    currency: "EUR",
    accountType: "iban",
    fields: { iban: "DE89370400440532013000", bic: "BAD" },
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.startsWith("bic:")));
  const check = result.validationReport.checks.find((c) => c.field === "bic");
  assert.equal(check?.result, "fail");
});

test("validateBeneficiaryFields rejects an unsupported account type and bad envelope codes", () => {
  const badType = validateBeneficiaryFields({
    countryCode: "US",
    currency: "USD",
    accountType: "crypto_wallet",
    fields: {},
  });
  assert.equal(badType.valid, false);
  assert.ok(badType.errors.some((e) => e.includes("accountType must be one of")));
  assert.equal(
    badType.validationReport.checks.find((c) => c.field === "accountType")?.result,
    "fail",
  );

  const badEnvelope = validateBeneficiaryFields({
    countryCode: "U",
    currency: "US",
    accountType: "aba",
    fields: { routingNumber: "021000021", accountNumber: "123456789" },
  });
  assert.equal(badEnvelope.valid, false);
  assert.ok(badEnvelope.errors.some((e) => e.includes("countryCode")));
  assert.ok(badEnvelope.errors.some((e) => e.includes("currency")));
});

test("validateBeneficiaryFields validates a US ABA beneficiary end to end", () => {
  const result = validateBeneficiaryFields({
    countryCode: "US",
    currency: "USD",
    accountType: "aba",
    fields: { routingNumber: "021-000-021", accountNumber: "123456789" },
  });
  assert.equal(result.valid, true);
  assert.equal(result.normalizedFields.routingNumber, "021000021");
  assert.equal(result.normalizedFields.accountNumber, "123456789");
});

test("validateBeneficiaryFields retains scalar extras and drops non-scalar values", () => {
  const result = validateBeneficiaryFields({
    countryCode: "DE",
    currency: "EUR",
    accountType: "iban",
    fields: {
      iban: "DE89370400440532013000",
      note: "rent",
      nested: { not: "scalar" },
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.normalizedFields.note, "rent");
  assert.ok(!("nested" in result.normalizedFields));
});

test("BENEFICIARY_ACCOUNT_REQUIREMENTS declares requirements for every account type", () => {
  for (const requirement of Object.values(BENEFICIARY_ACCOUNT_REQUIREMENTS)) {
    assert.ok(requirement.requiredFields.length > 0);
    assert.ok(requirement.description.length > 0);
  }
  assert.deepEqual(BENEFICIARY_ACCOUNT_REQUIREMENTS.iban.requiredFields, ["iban"]);
  assert.deepEqual(BENEFICIARY_ACCOUNT_REQUIREMENTS.sort_code.requiredFields, [
    "sortCode",
    "accountNumber",
  ]);
});
