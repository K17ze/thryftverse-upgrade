import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { CreatorGlyph, type CreatorGlyphName } from '../creator/controls/CreatorGlyph';

// Mock react-native-svg
vi.mock('react-native-svg', () => {
  const MockSvg = ({ children, ...props }: any) => React.createElement('Svg', props, children);
  const MockPath = (props: any) => React.createElement('Path', props);
  const MockG = ({ children, ...props }: any) => React.createElement('G', props, children);
  const MockCircle = (props: any) => React.createElement('Circle', props);
  const MockRect = (props: any) => React.createElement('Rect', props);
  const MockLine = (props: any) => React.createElement('Line', props);
  const MockDefs = ({ children, ...props }: any) => React.createElement('Defs', props, children);
  const MockClipPath = ({ children, ...props }: any) => React.createElement('ClipPath', props, children);

  return {
    Svg: MockSvg,
    Path: MockPath,
    G: MockG,
    Circle: MockCircle,
    Rect: MockRect,
    Line: MockLine,
    Defs: MockDefs,
    ClipPath: MockClipPath,
    default: MockSvg,
  };
});

describe('Flagship Creator Story Glyphs (Instagram / Snapchat Quality)', () => {
  it('renders TextGlyph ("text") with iconic Aa story typography geometry', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <CreatorGlyph name="text" size={24} color="#FFFFFF" testID="glyph-text" />
      );
    });

    const root = renderer.root;
    const paths = root.findAllByType('Path');
    // Outline Aa has legs, crossbar, stem, and bowl
    expect(paths.length).toBeGreaterThanOrEqual(3);
    const dValues = paths.map((p: any) => p.props.d);
    // Check for capital A coordinates
    expect(dValues.some((d: string) => d.includes('M3.5 19L8.5 5'))).toBe(true);
    // Check for lowercase a stem/bowl
    expect(dValues.some((d: string) => d.includes('M19.5 11v8'))).toBe(true);
  });

  it('renders TextGlyph ("text") in selected filled state with solid Aa paths', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <CreatorGlyph name="text" size={24} color="#2D68FF" selected={true} testID="glyph-text-selected" />
      );
    });

    const root = renderer.root;
    const paths = root.findAllByType('Path');
    expect(paths.length).toBe(2);
    expect(paths[0].props.fill).toBe('currentColor');
    expect(paths[1].props.fill).toBe('currentColor');
  });

  it('renders StickerGlyph ("sticker") with peeled corner and smiley face', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <CreatorGlyph name="sticker" size={24} color="#FFFFFF" testID="glyph-sticker" />
      );
    });

    const root = renderer.root;
    const paths = root.findAllByType('Path');
    const circles = root.findAllByType('Circle');

    // Two eyes for the smiley
    expect(circles.length).toBe(2);
    expect(circles[0].props.cx).toBe('8');
    expect(circles[1].props.cx).toBe('14');

    // Outer peeled sticker border + crease + smile path
    expect(paths.length).toBeGreaterThanOrEqual(2);
    const dValues = paths.map((p: any) => p.props.d);
    expect(dValues.some((d: string) => d.includes('M8 14c1.2 1.8'))).toBe(true);
  });

  it('renders DrawingGlyph ("drawing") with calligraphy marker nib and ink wave', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <CreatorGlyph name="drawing" size={24} color="#FFFFFF" testID="glyph-drawing" />
      );
    });

    const root = renderer.root;
    const paths = root.findAllByType('Path');
    expect(paths.length).toBeGreaterThanOrEqual(3);
    const dValues = paths.map((p: any) => p.props.d);
    // Pen marker body
    expect(dValues.some((d: string) => d.includes('M17.5 3.5l3 3'))).toBe(true);
    // Creative ink wave
    expect(dValues.some((d: string) => d.includes('M3 20.5c3-1.5'))).toBe(true);
  });

  it('renders FilterGlyph ("filter") with Instagram magic sparkles cluster', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <CreatorGlyph name="filter" size={24} color="#FFFFFF" testID="glyph-filter" />
      );
    });

    const root = renderer.root;
    const paths = root.findAllByType('Path');
    // Cluster of 3 four-point stars
    expect(paths.length).toBe(3);
    const dValues = paths.map((p: any) => p.props.d);
    // Dominant sparkle at center
    expect(dValues.some((d: string) => d.includes('M12 2.5c0 3.6'))).toBe(true);
    // Secondary lower-left sparkle
    expect(dValues.some((d: string) => d.includes('M5.5 14c0 2'))).toBe(true);
    // Accent right twinkle
    expect(dValues.some((d: string) => d.includes('M19 15.5'))).toBe(true);
  });

  it('renders ProductTagGlyph ("product-tag") as a luxury boutique fashion hangtag', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <CreatorGlyph name="product-tag" size={24} color="#FFFFFF" testID="glyph-product-tag" />
      );
    });

    const root = renderer.root;
    const paths = root.findAllByType('Path');
    const circles = root.findAllByType('Circle');

    // Eyelet hole punch
    expect(circles.length).toBe(1);
    expect(circles[0].props.cx).toBe('15.5');
    expect(circles[0].props.cy).toBe('8.5');

    // Tag body and cord thread
    expect(paths.length).toBe(2);
    const dValues = paths.map((p: any) => p.props.d);
    expect(dValues.some((d: string) => d.includes('M3.5 12.5L11 5'))).toBe(true);
  });

  it('renders MusicGlyph ("music") as beamed eighth notes with angled noteheads', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <CreatorGlyph name="music" size={24} color="#FFFFFF" testID="glyph-music" />
      );
    });

    const root = renderer.root;
    const paths = root.findAllByType('Path');
    const circles = root.findAllByType('Circle');

    expect(circles.length).toBe(2);
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });

  it('renders all core creative glyphs without throwing', () => {
    const glyphsToTest: CreatorGlyphName[] = [
      'trim',
      'split',
      'crop',
      'rotate',
      'cutout',
      'keyframe',
      'speed-curve',
      'waveform',
      'reverse',
      'freeze-frame',
      'fade-in',
      'fade-out',
      'layers',
      'arrange',
      'bring-forward',
      'bring-back',
      'gradient',
      'eyedropper',
      'opacity',
      'stroke',
      'shadow',
      'text',
      'text-background',
      'caption',
      'align-left',
      'align-center',
      'align-right',
      'bold',
      'italic',
      'underline',
      'safe-zone',
      'product-tag',
      'multi-select',
      'enhance',
      'adjust',
      'filter',
      'drawing',
      'sticker',
      'audio',
      'music',
      'voiceover',
      'undo',
      'redo',
    ];

    glyphsToTest.forEach((name) => {
      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(
          <CreatorGlyph name={name} size={24} color="#FFFFFF" accessibilityLabel={name} />
        );
      });
      expect(renderer.root).toBeDefined();
    });
  });
});
