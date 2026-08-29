/**
 * TypographyV2 Migration Codemod
 *
 * Migrates Type.XXX.size/lineHeight/letterSpacing/fontWeight -> TypographyV2.YYY.size/lineHeight/letterSpacing/fontWeight
 * Also migrates Typography.family.X -> TypographyV2.YYY.fontFamily (where context allows)
 * Updates imports: adds TypographyV2 import, removes Type from designTokens import
 */

const fs = require('fs');
const path = require('path');

const MAP = {
  display: 'display',
  hero: 'display',
  title: 'screenTitle',
  screenTitle: 'screenTitle',
  heading: 'sectionTitle',
  subtitle: 'sectionTitle',
  sectionTitle: 'sectionTitle',
  itemTitle: 'itemTitle',
  body: 'body',
  bodyEmphasis: 'bodyStrong',
  bodyStrong: 'bodyStrong',
  bodyLarge: 'priceList',
  price: 'priceList',
  priceList: 'priceList',
  priceLarge: 'priceHero',
  priceHero: 'priceHero',
  caption: 'meta',
  captionElevated: 'meta',
  meta: 'meta',
  metaElevated: 'label',
  label: 'label',
  numericMeta: 'numericMeta',
};

function walk(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Step 1: Replace Type.XXX. with TypographyV2.YYY.
  for (const [oldKey, v2Role] of Object.entries(MAP)) {
    const pattern = new RegExp(`\\bType\\.${oldKey}\\.`, 'g');
    if (pattern.test(content)) {
      content = content.replace(pattern, `TypographyV2.${v2Role}.`);
      changed = true;
    }
  }

  if (!changed) return false;

  // Step 2: Replace Typography.family.X with TypographyV2.ZZZ.fontFamily
  // Process line by line, tracking the current role from fontSize lines
  const lines = content.split(/\r?\n/);
  let currentRole = null;
  for (let i = 0; i < lines.length; i++) {
    // Track current role from fontSize: TypographyV2.ZZZ.size lines
    const fontSizeMatch = lines[i].match(/fontSize:\s*TypographyV2\.(\w+)\.size/);
    if (fontSizeMatch) {
      currentRole = fontSizeMatch[1];
    }
    // Replace fontFamily: Typography.family.X (but NOT ternary expressions with ?)
    if (lines[i].match(/fontFamily:\s*Typography\.family\.\w+/) && !lines[i].includes('?')) {
      if (currentRole) {
        lines[i] = lines[i].replace(/Typography\.family\.\w+/, `TypographyV2.${currentRole}.fontFamily`);
      }
    }
    // Reset currentRole at the end of a style block (closing brace)
    if (lines[i].match(/^\s*\},?\s*$/) || lines[i].match(/^\s*\},?\s*\/\//)) {
      currentRole = null;
    }
  }
  content = lines.join('\r\n');

  // Step 3: Add TypographyV2 import if not present
  if (!content.match(/import.*TypographyV2.*from/)) {
    // Determine relative path depth
    const relativePath = filePath.replace(/.*[\\/]src[\\/]/, '');
    const depth = relativePath.split(/[\\/]/).length - 1;
    const importPath = '../'.repeat(depth) + 'theme/typography.v2';
    const v2Import = `import { TypographyV2 } from '${importPath}';`;

    // Add after the designTokens import line
    const designTokensImport = content.match(/(import \{[^}]*\} from '[^']*designTokens';)/);
    if (designTokensImport) {
      content = content.replace(designTokensImport[1], designTokensImport[1] + '\r\n' + v2Import);
    } else {
      // Add after first import
      const firstImport = content.match(/^(import .+;\s*)/m);
      if (firstImport) {
        content = content.replace(firstImport[1], firstImport[1] + '\r\n' + v2Import);
      }
    }
  }

  // Step 4: Remove Type from designTokens import
  // Handle: Type, / Type } / , Type / Type at start
  content = content.replace(/(import \{[^}]*?)\s*,\s*Type\s*,/g, '$1,');
  content = content.replace(/(import \{[^}]*?)\s*,\s*Type\s*\}/g, '$1 }');
  content = content.replace(/(import \{[^}]*?)\bType\s*,\s*/g, '$1');
  content = content.replace(/(import \{[^}]*?)\bType\b(\s*\})/g, '$1$2');

  // Step 5: Check if Typography.family is still used
  if (!content.match(/Typography\.family\./)) {
    // Remove Typography from designTokens import
    content = content.replace(/(import \{[^}]*?)\s*,\s*Typography\s*,/g, '$1,');
    content = content.replace(/(import \{[^}]*?)\s*,\s*Typography\s*\}/g, '$1 }');
    content = content.replace(/(import \{[^}]*?)\bTypography\s*,\s*/g, '$1');
    content = content.replace(/(import \{[^}]*?)\bTypography\b(\s*\})/g, '$1$2');
  }

  // Clean up any double spaces or trailing commas left in imports
  content = content.replace(/import \{\s+,/g, 'import {');
  content = content.replace(/,\s+,/g, ',');
  content = content.replace(/\{\s+\}/g, '{}');
  content = content.replace(/,\s*\}/g, ' }');

  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

// Find all .tsx/.ts files in src that use Type. tokens
const srcDir = path.join(__dirname, 'frontend', 'src');
const allFiles = walk(srcDir);
const filesToMigrate = allFiles.filter(f => {
  const content = fs.readFileSync(f, 'utf8');
  return /\bType\.\w+\./.test(content);
});

console.log(`Found ${filesToMigrate.length} files to migrate`);

let migrated = 0;
let failed = 0;
for (const file of filesToMigrate) {
  try {
    if (migrateFile(file)) {
      migrated++;
    }
  } catch (e) {
    console.error(`  ERROR: ${file}: ${e.message}`);
    failed++;
  }
}

console.log(`Migrated: ${migrated}`);
console.log(`Failed: ${failed}`);
