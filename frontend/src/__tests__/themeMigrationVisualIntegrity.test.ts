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

  it.each([
    ['screens/HomeScreen.tsx', ['backgroundColor:background', 'color:textPrimary', 'borderColor:border']],
    ['screens/InboxScreen.tsx', ['backgroundColor:background', 'color:textPrimary', 'borderColor:border']],
    ['screens/SettingsScreen.tsx', ['color:textPrimary', 'color:success', 'color:textMuted']],
    ['screens/EditProfileScreen.tsx', ['backgroundColor:surface', 'color:textPrimary', 'borderColor:border']],
    ['screens/ClosetScreen.tsx', ['backgroundColor:background', 'color:textPrimary', 'backgroundColor:surface']],
    ['screens/ItemDetailScreen.tsx', ['backgroundColor:background', 'color:textPrimary', 'borderColor:border']],
    ['components/ProductCardV2.tsx', ['backgroundColor:surfaceAlt', 'color:textPrimary', 'color:textSecondary']],
  ])('%s retains explicit flagship colour roles', (relativePath, requiredRoles) => {
    const source = readSource(relativePath);
    for (const role of requiredRoles) {
      const [property, token] = role.split(':');
      expect(source).toMatch(new RegExp(`${property}:\\s*(?:Colors|colors)\\.${token}`));
    }
  });

  it('does not repeat the broken static-style stripping pattern on Home', () => {
    const home = readSource('screens/HomeScreen.tsx');
    expect(home).toMatch(/backgroundColor:\s*(?:Colors|colors)\.surfaceAlt/);
    expect(home).toMatch(/backgroundColor:\s*(?:Colors|colors)\.brand/);
    expect(home).toMatch(/color:\s*(?:Colors|colors)\.textMuted/);
  });
});
