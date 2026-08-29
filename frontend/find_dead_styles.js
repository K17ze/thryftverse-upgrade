#!/usr/bin/env node
/**
 * Scans .tsx files for StyleSheet.create blocks, extracts style keys,
 * then checks if each key is referenced as `styles.KEY` (or via variable
 * alias) in the same file. Reports potentially dead style keys.
 *
 * Limitations: may miss dynamic/concatenated access. Manual review required.
 */
const fs = require('fs');
const path = require('path');

function walkDir(dir, ext, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walkDir(full, ext, files);
    } else if (entry.name.endsWith(ext)) {
      files.push(full);
    }
  }
  return files;
}

const srcDir = path.join(__dirname, 'src');
const files = walkDir(srcDir, '.tsx');

const results = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('StyleSheet.create')) continue;

  // Find all StyleSheet.create({...}) blocks — naive: find "StyleSheet.create(" then match braces
  let idx = 0;
  while (true) {
    const start = content.indexOf('StyleSheet.create(', idx);
    if (start === -1) break;
    // Find the opening {
    let braceStart = content.indexOf('{', start);
    if (braceStart === -1) break;
    // Match braces
    let depth = 0;
    let end = braceStart;
    for (let i = braceStart; i < content.length; i++) {
      const ch = content[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    const block = content.slice(braceStart, end + 1);

    // Extract top-level keys: lines like `  keyName: {` or `  keyName: { ... }`
    // Keys are identifiers followed by `:` at the start of a line (with indentation)
    const keyRegex = /^\s{2,}([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*{/gm;
    let m;
    const keys = [];
    while ((m = keyRegex.exec(block)) !== null) {
      keys.push(m[1]);
    }

    if (keys.length === 0) { idx = end + 1; continue; }

    // Now check which keys are referenced as styles.KEY in the full file content
    // Also check for variable aliases: const s = styles; s.KEY  (rare)
    // We search for `styles.KEY` and `.KEY` after a `styles` reference
    const dead = [];
    for (const key of keys) {
      // Search for styles.key (with word boundary after key)
      const refRegex = new RegExp(`styles\\.${key}\\b`);
      if (!refRegex.test(content)) {
        // Also check for destructured styles: const { key } = styles;
        const destructureRegex = new RegExp(`\\{[^}]*\\b${key}\\b[^}]*\\}\\s*=\\s*styles`);
        if (!destructureRegex.test(content)) {
          dead.push(key);
        }
      }
    }

    if (dead.length > 0) {
      results.push({ file: path.relative(srcDir, file), deadCount: dead.length, totalKeys: keys.length, dead });
    }

    idx = end + 1;
  }
}

// Sort by dead count descending
results.sort((a, b) => b.deadCount - a.deadCount);

for (const r of results) {
  console.log(`\n${r.file} — ${r.deadCount} dead / ${r.totalKeys} total`);
  for (const k of r.dead) {
    console.log(`  - ${k}`);
  }
}
console.log(`\nTotal files with potential dead styles: ${results.length}`);
