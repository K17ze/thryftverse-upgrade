import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8');
}

describe('VQ-09D: CreateActionSheet route contract', () => {
  const tabNavSrc = readSrc('navigation/TabNavigator.tsx');
  const typesSrc = readSrc('navigation/types.ts');

  const ACTIONS = [
    { key: 'sell', label: 'List an item', route: 'Sell' },
    { key: 'look', label: 'Create a Look', route: 'CreateLook' },
    { key: 'poster', label: 'Create a Poster', route: 'CreatePoster' },
    { key: 'auction', label: 'Create auction', route: 'CreateAuction' },
    { key: 'coown', label: 'Create Co-Own opportunity', route: 'CreateCoOwn' },
  ];

  it.each(ACTIONS)('action "$key" navigates to route "$route" registered in RootStackParamList', ({ route }) => {
    expect(tabNavSrc).toContain(`route: '${route}'`);
    expect(typesSrc).toContain(`${route}:`);
  });

  it('all 5 action routes are present in RootStackParamList', () => {
    const routes = ACTIONS.map((a) => a.route);
    for (const route of routes) {
      expect(typesSrc).toContain(`${route}:`);
    }
  });

  it('no action navigates to a TabParamList destination', () => {
    const tabRoutes = ['Home', 'Explore', 'Create', 'Inbox', 'Profile'];
    const createSection = tabNavSrc.slice(
      tabNavSrc.indexOf('const actions = ['),
      tabNavSrc.indexOf('];', tabNavSrc.indexOf('const actions = ['))
    );
    for (const tab of tabRoutes) {
      if (tab !== 'Create') {
        expect(createSection).not.toContain(`route: '${tab}'`);
      }
    }
  });

  it('each action has a unique key', () => {
    const keys = ACTIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('each action has a unique route', () => {
    const routes = ACTIONS.map((a) => a.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('handlePress calls onNavigate then onClose in sequence', () => {
    const handlePressSection = tabNavSrc.slice(
      tabNavSrc.indexOf('const handlePress'),
      tabNavSrc.indexOf('};', tabNavSrc.indexOf('const handlePress'))
    );
    expect(handlePressSection).toContain('onNavigate');
    expect(handlePressSection).toContain('onClose');
    const navIdx = handlePressSection.indexOf('onNavigate');
    const closeIdx = handlePressSection.indexOf('onClose');
    expect(navIdx).toBeLessThan(closeIdx);
  });

  it('haptic fires on action press', () => {
    const handlePressSection = tabNavSrc.slice(
      tabNavSrc.indexOf('const handlePress'),
      tabNavSrc.indexOf('};', tabNavSrc.indexOf('const handlePress'))
    );
    expect(handlePressSection).toContain('haptic.light()');
  });
});

describe('VQ-09D: CreateActionSheet visual structure', () => {
  const tabNavSrc = readSrc('navigation/TabNavigator.tsx');

  it('sheet title is "Create"', () => {
    expect(tabNavSrc).toContain('Create');
  });

  it('each action has accessibilityRole button and accessibilityLabel', () => {
    const actionsSection = tabNavSrc.slice(
      tabNavSrc.indexOf('actions.map'),
      tabNavSrc.indexOf('</NativeSheet>')
    );
    expect(actionsSection).toContain('accessibilityRole="button"');
    expect(actionsSection).toContain('accessibilityLabel={action.label}');
  });

  it('no "Primary" badge or label remains', () => {
    expect(tabNavSrc).not.toContain('primary: true');
    expect(tabNavSrc).not.toContain('sheetPrimaryBadge');
    expect(tabNavSrc).not.toContain('sheetPrimaryBadgeText');
    expect(tabNavSrc).not.toContain('sheetActionLabelPrimary');
    expect(tabNavSrc).not.toContain('>Primary<');
  });

  it('uses NativeSheet with onDismiss (not Modal with onRequestClose)', () => {
    expect(tabNavSrc).toContain('NativeSheet');
    expect(tabNavSrc).toContain('onDismiss={onClose}');
    expect(tabNavSrc).not.toContain('<Modal');
  });

  it('NativeSheet has testID for E2E identification', () => {
    expect(tabNavSrc).toContain('testID="create-action-sheet"');
  });
});
