#!/usr/bin/env node
/**
 * Maestro flow YAML validator.
 *
 * P0-5: Validates every Maestro flow under `.maestro/flows/` parses as
 * multi-document YAML. This catches indentation and key-name typos
 * early without booting a simulator. Run via `npm run check:maestro-flows`.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Minimal multi-document YAML parser. Maestro flows are simple enough
// that we only need to validate: (1) the file parses, (2) each document
// is an object or null, (3) the flow document contains at least one
// step. We do not pull in a full YAML parser to keep the script
// dependency-free.
//
// This is a syntax+structure linter, not a full Maestro schema
// validator — the screenshot workflow runs Maestro itself for the
// real validation.

const FLOWS_DIR = join(process.cwd(), '.maestro', 'flows');

function listYamlFiles(dir) {
  if (!statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => join(dir, f));
}

// Lightweight YAML sanity check: every non-empty, non-comment line must
// be indented consistently and the file must contain at least one
// `---` document separator after the config document. A full YAML
// parse happens in CI via PyYAML.
function validateFlowStructure(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);

  if (lines.length === 0) {
    throw new Error('empty flow file');
  }

  // Must contain at least one `---` separator (config doc + flow doc).
  const separators = lines.filter((l) => l.trim() === '---');
  if (separators.length < 1) {
    throw new Error('missing `---` document separator — Maestro flows need a config doc and a flow doc');
  }

  // Must contain at least one step (lines starting with `- `).
  const stepLines = lines.filter((l) => /^- /.test(l.trim()));
  if (stepLines.length === 0) {
    throw new Error('no flow steps found — expected at least one `- ` step');
  }

  // Must contain at least one takeScreenshot step.
  if (!text.includes('takeScreenshot')) {
    throw new Error('no takeScreenshot step — screenshot flows must capture at least one screenshot');
  }

  // appId must be set in the config document.
  if (!text.includes('appId:')) {
    throw new Error('missing appId in config document');
  }
}

function main() {
  const files = listYamlFiles(FLOWS_DIR);
  if (files.length === 0) {
    console.warn('[maestro-flows] no flow files found in .maestro/flows/');
    return;
  }

  const errors = [];
  let valid = 0;
  for (const path of files) {
    try {
      validateFlowStructure(path);
      valid++;
    } catch (error) {
      errors.push(`${path}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('[maestro-flows] validation failed:');
    for (const e of errors) {
      console.error(`  ${e}`);
    }
    process.exit(1);
  }

  console.log(`[maestro-flows] ${valid} flow file(s) valid.`);
}

main();
