#!/usr/bin/env node
/**
 * Codemod to automatically add accessibilityLabel and accessibilityRole
 * to interactive controls missing them.
 *
 * Properly parses JSX opening tags by tracking brace/string depth to
 * find the real closing '>' of the tag (not '>' inside expressions).
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve, extname, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const EXCLUDE_DIRS = new Set(['__tests__', 'node_modules', '__mocks__', 'theme', 'constants']);

const TAG_NAMES = ['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'Button'];

const HAS_A11Y_LABEL = /accessibilityLabel\s*=/;
const HAS_A11Y_ROLE = /accessibilityRole\s*=/;
const HAS_A11Y_LABELLED_BY = /accessibilityLabelledBy\s*=/;
const HAS_ACCESSIBLE = /accessible\s*=\s*\{?\s*(?:true|false)/;

function walk(dir) {
  const results = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) results.push(...walk(full));
    else if (SCAN_EXTENSIONS.has(extname(full))) results.push(full);
  }
  return results;
}

function relPath(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, '/');
}

/**
 * Find the real closing '>' of a JSX opening tag, starting from the '<TagName'
 * position. Skips over:
 * - String literals ("..." and '...')
 * - Template literals (`...`)
 * - JSX expressions {...}
 * - Arrow functions =>
 * - Comparison operators > inside expressions
 */
function findTagEnd(src, startPos) {
  let i = startPos;
  const len = src.length;

  // Skip the tag name
  while (i < len && /[a-zA-Z0-9_.]/.test(src[i])) i++;

  // Now we're past the tag name, scanning for the closing '>'
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;

  while (i < len) {
    const ch = src[i];
    const next = src[i + 1];

    // Check for self-closing tag />
    if (ch === '/' && next === '>' && braceDepth === 0 && parenDepth === 0) {
      return i + 1; // position of '>'
    }

    // Check for closing > (only when not inside any expression)
    if (ch === '>' && braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
      return i;
    }

    // String literals
    if (ch === '"' || ch === "'") {
      i++;
      while (i < len && src[i] !== ch) {
        if (src[i] === '\\') i++; // skip escaped char
        i++;
      }
      i++;
      continue;
    }

    // Template literals
    if (ch === '`') {
      i++;
      while (i < len && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          // Template expression - track braces
          i += 2;
          let depth = 1;
          while (i < len && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            if (src[i] === '\\') i++;
            i++;
          }
          continue;
        }
        i++;
      }
      i++;
      continue;
    }

    // JSX expression { }
    if (ch === '{') { braceDepth++; i++; continue; }
    if (ch === '}') { braceDepth--; i++; continue; }

    // Parentheses (for arrow functions etc.)
    if (ch === '(') { parenDepth++; i++; continue; }
    if (ch === ')') { parenDepth--; i++; continue; }

    // Brackets
    if (ch === '[') { bracketDepth++; i++; continue; }
    if (ch === ']') { bracketDepth--; i++; continue; }

    // Comments inside expressions {/* ... */}
    if (ch === '/' && next === '*' && braceDepth > 0) {
      i += 2;
      while (i < len && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Line comments inside expressions
    if (ch === '/' && next === '/' && braceDepth > 0) {
      while (i < len && src[i] !== '\n') i++;
      continue;
    }

    i++;
  }

  return -1; // Could not find closing >
}

/**
 * Find all opening tags of interactive components in the source.
 */
function findInteractiveTags(src) {
  const results = [];
  const tagPattern = /<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|Button)\b/g;
  let match;

  while ((match = tagPattern.exec(src)) !== null) {
    const tagStart = match.index;
    const tagName = match[1];
    const tagEnd = findTagEnd(src, tagStart);

    if (tagEnd === -1) continue;

    const openingTag = src.slice(tagStart, tagEnd + 1);
    const isSelfClosing = openingTag.endsWith('/>');

    results.push({
      tagStart,
      tagEnd, // position of the '>' character
      tagName,
      openingTag,
      isSelfClosing,
    });
  }

  return results;
}

function inferRole(tagName, openingTag, childWindow) {
  if (/onPress.*navigation\.(goBack|navigate|push)/.test(openingTag) ||
      /onPress.*router\.(push|back)/.test(openingTag)) {
    return 'link';
  }
  if (/<Image\b/.test(childWindow) && !/<Text\b/.test(childWindow)) {
    return 'image';
  }
  if (/(toggle|switch|enable|disable|setActive|setEnable)/i.test(openingTag)) {
    return 'switch';
  }
  if (/(select|deselect|check|uncheck|isSelected|isChecked|setSelected)/i.test(openingTag)) {
    return 'checkbox';
  }
  return 'button';
}

function inferLabel(openingTag, childWindow) {
  const testIDMatch = openingTag.match(/testID\s*=\s*["'`{]([^"'`}]+)/);
  if (testIDMatch) {
    const id = testIDMatch[1].replace(/[-_]/g, ' ').trim();
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  const iconMatch = childWindow.match(/name\s*=\s*["']([a-z-]+)["']/i);
  if (iconMatch) {
    return iconToLabel(iconMatch[1]);
  }

  const onPressMatch = openingTag.match(/onPress\s*=\s*\{?(\w+)/);
  if (onPressMatch) {
    return handlerToLabel(onPressMatch[1]);
  }

  const hintMatch = openingTag.match(/accessibilityHint\s*=\s*["']([^"']+)["']/);
  if (hintMatch) {
    return hintMatch[1];
  }

  return null;
}

function iconToLabel(iconName) {
  const map = {
    'close': 'Close', 'x-mark': 'Close', 'x': 'Close',
    'chevron-back': 'Back', 'chevron-left': 'Back', 'arrow-left': 'Back',
    'chevron-forward': 'Next', 'chevron-right': 'Next', 'arrow-right': 'Next',
    'chevron-up': 'Up', 'chevron-down': 'Down',
    'share': 'Share', 'share-outline': 'Share',
    'heart': 'Like', 'heart-outline': 'Like', 'heart-dislike': 'Unlike',
    'bookmark': 'Save', 'bookmark-outline': 'Save',
    'trash': 'Delete', 'trash-outline': 'Delete',
    'create': 'Edit', 'create-outline': 'Edit', 'pencil': 'Edit', 'pencil-outline': 'Edit',
    'ellipsis-horizontal': 'More options', 'ellipsis-vertical': 'More options',
    'ellipsis-horizontal-circle': 'More options',
    'funnel': 'Filter', 'funnel-outline': 'Filter', 'filter': 'Filter',
    'search': 'Search', 'search-outline': 'Search',
    'settings': 'Settings', 'settings-outline': 'Settings',
    'camera': 'Camera', 'camera-outline': 'Camera',
    'image': 'Photo', 'image-outline': 'Photos', 'images': 'Photos', 'images-outline': 'Photos',
    'plus': 'Add', 'plus-circle': 'Add', 'add': 'Add', 'add-outline': 'Add',
    'minus': 'Remove', 'minus-circle': 'Remove',
    'checkmark': 'Confirm', 'checkmark-circle': 'Confirm', 'check': 'Confirm',
    'send': 'Send', 'send-outline': 'Send',
    'refresh': 'Refresh', 'refresh-outline': 'Refresh', 'reload': 'Refresh',
    'download': 'Download', 'download-outline': 'Download',
    'upload': 'Upload', 'upload-outline': 'Upload',
    'eye': 'View', 'eye-outline': 'View',
    'eye-off': 'Hide', 'eye-off-outline': 'Hide',
    'copy': 'Copy', 'copy-outline': 'Copy',
    'link': 'Link', 'link-outline': 'Link',
    'information': 'Info', 'information-circle': 'Info', 'info': 'Info',
    'help': 'Help', 'help-circle': 'Help', 'help-outline': 'Help',
    'star': 'Rate', 'star-outline': 'Rate',
    'volume-high': 'Mute', 'volume-mute': 'Unmute', 'volume-off': 'Unmute',
    'play': 'Play', 'play-circle': 'Play', 'pause': 'Pause', 'pause-circle': 'Pause',
    'stop': 'Stop',
    'arrow-up': 'Up', 'arrow-down': 'Down',
    'arrow-undo': 'Undo', 'arrow-redo': 'Redo',
    'documents': 'Drafts', 'documents-outline': 'Drafts',
    'folder': 'Folder', 'folder-outline': 'Folder',
    'person': 'Profile', 'person-outline': 'Profile',
    'people': 'People', 'people-outline': 'People',
    'cart': 'Cart', 'cart-outline': 'Cart',
    'pricetag': 'Price', 'pricetag-outline': 'Price',
    'notifications': 'Notifications', 'notifications-outline': 'Notifications',
    'mail': 'Message', 'mail-outline': 'Message',
    'chatbubble': 'Message', 'chatbubble-outline': 'Message',
    'location': 'Location', 'location-outline': 'Location',
    'time': 'Time', 'time-outline': 'Time',
    'calendar': 'Calendar', 'calendar-outline': 'Calendar',
    'camera-reverse': 'Flip camera',
    'flash': 'Flash', 'flash-off': 'Flash off',
    'mic': 'Microphone', 'mic-outline': 'Microphone',
    'phone': 'Call', 'phone-outline': 'Call',
    'videocam': 'Video call',
    'attach': 'Attach', 'attach-outline': 'Attach',
    'color-palette': 'Color picker',
    'color-filter': 'Color filter',
    'color-fill': 'Fill color',
  };
  if (map[iconName]) return map[iconName];
  const base = iconName.replace(/-outline$/, '');
  if (map[base]) return map[base];
  if (map[base + '-outline']) return map[base + '-outline'];
  return iconName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function handlerToLabel(handler) {
  let name = handler
    .replace(/^handle/, '')
    .replace(/^on/, '')
    .replace(/^toggle/, 'Toggle')
    .replace(/^open/, 'Open')
    .replace(/^close/, 'Close')
    .replace(/^show/, 'Show')
    .replace(/^hide/, 'Hide')
    .replace(/^navigate/, 'Go to')
    .replace(/^goBack/, 'Go back');
  if (name !== handler) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  return name;
}

function fixFile(filePath) {
  const src = readFileSync(filePath, 'utf-8');
  const tags = findInteractiveTags(src);

  const edits = [];

  for (const tag of tags) {
    if (tag.isSelfClosing) continue;

    const { openingTag, tagEnd } = tag;

    const hasLabel =
      HAS_A11Y_LABEL.test(openingTag) ||
      HAS_A11Y_LABELLED_BY.test(openingTag);
    const hasRole = HAS_A11Y_ROLE.test(openingTag);
    const hasAccessible = HAS_ACCESSIBLE.test(openingTag);

    // Get child window for text child detection and icon inference
    const childStart = tagEnd + 1;
    const childWindow = src.slice(childStart, Math.min(src.length, childStart + 200));
    const hasTextChild = />[^<{]{2,}</.test(childWindow);

    const needsLabel = !hasLabel && !hasTextChild && !hasAccessible;
    const needsRole = !hasRole && !hasAccessible;

    if (!needsLabel && !needsRole) continue;

    // Build props string
    let newProps = '';
    if (needsRole) {
      const role = inferRole(tag.tagName, openingTag, childWindow);
      newProps += `accessibilityRole="${role}"`;
    }
    if (needsLabel) {
      const label = inferLabel(openingTag, childWindow);
      if (label) {
        const escaped = label.replace(/"/g, '\\"');
        if (newProps) newProps += ' ';
        newProps += `accessibilityLabel="${escaped}"`;
      }
    }

    if (!newProps) continue;

    // Determine insertion point and format
    // tagEnd is the position of '>'
    const charBefore = src[tagEnd - 1];

    // Check if '>' is on its own line (multi-line tag)
    const beforeTag = src.slice(0, tagEnd);
    const lastNewline = beforeTag.lastIndexOf('\n');
    const lineContent = lastNewline >= 0 ? src.slice(lastNewline + 1, tagEnd) : '';

    if (lineContent.trim() === '') {
      // '>' is on its own line - insert props with proper indentation
      // Find the indentation of the opening tag
      const tagLineStart = src.lastIndexOf('\n', tag.tagStart) + 1;
      const tagIndent = src.slice(tagLineStart, tag.tagStart).match(/^\s*/)[0];
      // Insert: props + newline + same indentation as the '>' line
      edits.push({
        pos: tagEnd,
        text: newProps + '\n' + lineContent,
      });
    } else if (charBefore === ' ' || charBefore === '\t') {
      // There's whitespace before '>', insert after it
      edits.push({
        pos: tagEnd,
        text: newProps + ' ',
      });
    } else {
      // Insert with a space before
      edits.push({
        pos: tagEnd,
        text: ' ' + newProps,
      });
    }
  }

  if (edits.length === 0) return 0;

  // Apply edits in reverse order to maintain positions
  edits.sort((a, b) => b.pos - a.pos);
  let modified = src;
  for (const edit of edits) {
    modified = modified.slice(0, edit.pos) + edit.text + modified.slice(edit.pos);
  }

  writeFileSync(filePath, modified, 'utf-8');
  return edits.length;
}

const files = walk(SRC);
let totalChanges = 0;
let filesChanged = 0;

for (const file of files) {
  const changes = fixFile(file);
  if (changes > 0) {
    totalChanges += changes;
    filesChanged++;
    console.log(`  ${relPath(file)}: +${changes} props`);
  }
}

console.log(`\nTotal: ${totalChanges} accessibility props added across ${filesChanged} files`);
