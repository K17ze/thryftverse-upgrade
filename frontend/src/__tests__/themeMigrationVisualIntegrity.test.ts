import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../../..');

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(SRC, relativePath), 'utf8');
}

describe('theme migration visual integrity', () => {
  it('documents that migrations must preserve every visual role', () => {
    const design = fs.readFileSync(path.join(ROOT, 'Design.md'), 'utf8');
    expect(design).toContain('Theme migration is a visual-preservation change');
    expect(design).toContain('Never leave text, canvas, input, border, badge');
  });

  it.each<[string, string[], string[]]>([
    ['screens/HomeScreen.tsx', ['backgroundColor:background', 'color:textPrimary', 'borderColor:border'], []],
    // Decomposed screens: the colour roles moved into the owner layer
    // (components/<feature>/*), so aggregate the orchestrator with its
    // extracted components — a moved style must not register as dropped.
    ['screens/InboxScreen.tsx', ['backgroundColor:background', 'color:textPrimary', 'borderColor:border'], ['components/inbox']],
    ['screens/SettingsScreen.tsx', ['color:textPrimary', 'color:success', 'color:textMuted'], ['components/settings']],
    ['screens/EditProfileScreen.tsx', ['backgroundColor:surface', 'color:textPrimary', 'borderColor:border'], []],
    ['screens/ClosetScreen.tsx', ['backgroundColor:background', 'color:textPrimary', 'color:textSecondary'], ['components/closet']],
    ['screens/ItemDetailScreen.tsx', ['backgroundColor:background', 'color:textPrimary', 'borderColor:border'], ['components/itemdetail']],
    ['components/ProductCard.tsx', ['backgroundColor:surfaceAlt', 'color:textPrimary', 'color:textSecondary'], []],
  ])('%s retains explicit flagship colour roles', (relativePath, requiredRoles, ownerDirs) => {
    let source = readSource(relativePath);
    for (const dir of ownerDirs) {
      for (const file of fs.readdirSync(path.join(SRC, dir))) {
        if (file.endsWith('.tsx') || file.endsWith('.ts')) {
          source += readSource(path.join(dir, file));
        }
      }
    }
    for (const role of requiredRoles) {
      const [property, token] = role.split(':');
      expect(source).toMatch(new RegExp(`${property}:\\s*(?:Colors|colors)\\.${token}`));
    }
  });

  it('does not repeat the broken static-style stripping pattern on Home', () => {
    // HomeScreen was decomposed — the brand/surfaceAlt styles moved into
    // the owner layer (components/home/*). Aggregate the orchestrator
    // with its extracted components so a moved style doesn't register
    // as dropped.
    let home = readSource('screens/HomeScreen.tsx');
    for (const file of fs.readdirSync(path.join(SRC, 'components/home'))) {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        home += readSource(path.join('components/home', file));
      }
    }
    expect(home).toMatch(/backgroundColor:\s*(?:Colors|colors)\.surfaceAlt/);
    expect(home).toMatch(/backgroundColor:\s*(?:Colors|colors)\.brand/);
    expect(home).toMatch(/color:\s*(?:Colors|colors)\.textMuted/);
  });
});
