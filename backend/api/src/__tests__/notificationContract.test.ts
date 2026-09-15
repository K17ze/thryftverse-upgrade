/**
 * Notification pipeline contract test — pins the registry-drift defect class.
 *
 * The audit found emitters producing untyped or unregistered event types:
 * pushes were gated by the wrong preference category ('news' instead of
 * 'messages'/'auctionAlerts'), rows rendered as generic system rows, and
 * deep links were dead. This test makes that drift a compile-time-style
 * failure by source-scanning every queueUserNotification-family call site
 * and asserting, for each emitted event type:
 *
 *   1. The call site carries an explicit `eventType` literal.
 *   2. The type is declared in NOTIFICATION_EVENT_TYPES (index.ts).
 *   3. The type is registered in NOTIFICATION_EVENT_REGISTRY (V2 semantics).
 *   4. The type maps to a push preference category (mapEventToPushCategory).
 *
 * And in the other direction:
 *
 *   5. Every declared event type is registered in the V2 registry.
 *   6. Every registered event type maps to a push category.
 *
 * Because NOTIFICATION_EVENT_TYPES lives inside the Fastify monolith
 * (index.ts has boot side effects), it is extracted by source scan rather
 * than import.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NOTIFICATION_EVENT_REGISTRY } from "../lib/notificationEventRegistry.js";
import { mapEventToPushCategory } from "../lib/workerHelpers.js";

const SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// ── Source scanning ──────────────────────────────────────────────────────────

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      collectSourceFiles(full, out);
    } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

interface EmitSite {
  file: string;
  line: number;
  callee: string;
  eventType: string | null;
}

/**
 * Find every `queueUserNotification({...})` / `queueNotification({...})` /
 * `notify({...})` call whose argument is an object literal, and extract the
 * `eventType` literal from inside that literal (brace-matched).
 */
function collectEmitSites(): EmitSite[] {
  const callPattern =
    /\b(queueUserNotification|queueNotification|notify)\s*\(\s*\{/g;
  const sites: EmitSite[] = [];
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const source = fs.readFileSync(file, "utf8");
    let match: RegExpExecArray | null;
    callPattern.lastIndex = 0;
    while ((match = callPattern.exec(source))) {
      const openBrace = source.indexOf("{", match.index);
      let depth = 0;
      let end = openBrace;
      for (let i = openBrace; i < source.length; i++) {
        const char = source[i];
        if (char === "{") depth++;
        else if (char === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      const block = source.slice(match.index, end + 1);
      const eventTypeMatch = block.match(
        /\beventType\s*:\s*['"]([^'"]+)['"]/,
      );
      sites.push({
        file: path.relative(SRC_ROOT, file).split(path.sep).join("/"),
        line: source.slice(0, match.index).split("\n").length,
        callee: match[1],
        eventType: eventTypeMatch ? eventTypeMatch[1] : null,
      });
    }
  }
  return sites;
}

/** Extract the NOTIFICATION_EVENT_TYPES string tuple from index.ts source. */
function collectDeclaredEventTypes(): Set<string> {
  const indexPath = path.join(SRC_ROOT, "index.ts");
  const source = fs.readFileSync(indexPath, "utf8");
  const arrayMatch = source.match(
    /const NOTIFICATION_EVENT_TYPES = \[([\s\S]*?)\] as const;/,
  );
  assert.ok(
    arrayMatch,
    "NOTIFICATION_EVENT_TYPES declaration not found in index.ts",
  );
  const types = new Set<string>();
  for (const literal of arrayMatch![1].matchAll(/'([^']+)'/g)) {
    types.add(literal[1]);
  }
  return types;
}

// Call sites that intentionally emit an untyped ('generic') notification.
// Each entry must name the file and a substring of the site so a new untyped
// emitter cannot hide behind the allowlist. Currently empty — every emit
// site carries a registered event type, and a new untyped emitter must fail
// this contract rather than silently fall back to 'generic'.
const UNTYPED_ALLOWLIST: { file: string; marker: string }[] = [];

// ── Contract assertions ──────────────────────────────────────────────────────

describe("notification event contract", () => {
  const sites = collectEmitSites();
  const declaredTypes = collectDeclaredEventTypes();
  const registeredTypes = new Set(Object.keys(NOTIFICATION_EVENT_REGISTRY));

  it("finds notification emit sites to audit", () => {
    assert.ok(
      sites.length >= 30,
      `expected at least 30 notification emit sites, found ${sites.length}`,
    );
  });

  it("every emit site carries an explicit eventType literal", () => {
    const untyped = sites.filter((site) => site.eventType === null);
    const unexpected = untyped.filter(
      (site) =>
        !UNTYPED_ALLOWLIST.some(
          (allowed) =>
            site.file === allowed.file &&
            // confirm the allowlisted site still emits the expected payload
            // marker so a different untyped call cannot slip under it
            fs
              .readFileSync(path.join(SRC_ROOT, site.file), "utf8")
              .includes(allowed.marker),
        ),
    );
    assert.deepEqual(
      unexpected.map((s) => `${s.file}:${s.line} (${s.callee})`),
      [],
      "emit sites missing an explicit eventType literal",
    );
  });

  it("every emitted eventType is declared in NOTIFICATION_EVENT_TYPES", () => {
    const undeclared = sites
      .filter((site) => site.eventType !== null)
      .filter((site) => !declaredTypes.has(site.eventType!));
    assert.deepEqual(
      undeclared.map((s) => `${s.file}:${s.line} → ${s.eventType}`),
      [],
      "emitted event types missing from NOTIFICATION_EVENT_TYPES",
    );
  });

  it("every emitted eventType is registered in the V2 registry", () => {
    const unregistered = sites
      .filter((site) => site.eventType !== null)
      .filter((site) => !registeredTypes.has(site.eventType!));
    assert.deepEqual(
      unregistered.map((s) => `${s.file}:${s.line} → ${s.eventType}`),
      [],
      "emitted event types missing from NOTIFICATION_EVENT_REGISTRY",
    );
  });

  it("every emitted eventType maps to a push preference category", () => {
    const unmapped = sites
      .filter((site) => site.eventType !== null)
      .filter((site) => mapEventToPushCategory(site.eventType!) === null);
    assert.deepEqual(
      unmapped.map((s) => `${s.file}:${s.line} → ${s.eventType}`),
      [],
      "emitted event types with no push category (fail closed → in-app only)",
    );
  });

  it("every declared event type is registered in the V2 registry", () => {
    const missing = [...declaredTypes].filter(
      (type) => !registeredTypes.has(type),
    );
    assert.deepEqual(
      missing,
      [],
      "NOTIFICATION_EVENT_TYPES entries missing from NOTIFICATION_EVENT_REGISTRY",
    );
  });

  it("every registered event type maps to a push preference category", () => {
    const unmapped = [...registeredTypes].filter(
      (type) => mapEventToPushCategory(type) === null,
    );
    assert.deepEqual(
      unmapped,
      [],
      "registered event types with no push category",
    );
  });
});
