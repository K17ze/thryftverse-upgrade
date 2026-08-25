import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius } from '../../theme/designTokens';

export interface DecodedThumbHash {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/**
 * Decodes a base64-encoded ThumbHash into a low-resolution RGBA image.
 *
 * Implements the ThumbHash decoder reference algorithm (evanw/thumbhash).
 * The hash is decoded into a ~32px image using a discrete cosine transform,
 * then returned as raw RGBA bytes suitable for rendering with Skia.
 *
 * @param hash Base64-encoded ThumbHash string.
 * @returns The decoded width, height, and RGBA pixel buffer.
 */
export function decodeThumbHash(hash: string): DecodedThumbHash {
  const bytes = base64ToBytes(hash);
  return thumbHashToRGBA(bytes);
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const binary = atobPolyfill(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function atobPolyfill(input: string): string {
  if (typeof atob === 'function') return atob(input);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let str = input.replace(/=+$/, '');
  let output = '';
  for (let bc = 0, bs = 0, buffer = 0, i = 0; i < str.length; i++) {
    const idx = chars.indexOf(str.charAt(i));
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bs += 6;
    if (bs >= 8) {
      output += String.fromCharCode((buffer >> (bs - 8)) & 0xff);
      bs -= 8;
    }
  }
  return output;
}

function thumbHashToRGBA(hash: Uint8Array): DecodedThumbHash {
  const { PI, min, max, cos, round } = Math;

  const header24 = hash[0] | (hash[1] << 8) | (hash[2] << 16);
  const header16 = hash[3] | (hash[4] << 8);
  const l_dc = (header24 & 63) / 63;
  const p_dc = ((header24 >> 6) & 63) / 31.5 - 1;
  const q_dc = ((header24 >> 12) & 63) / 31.5 - 1;
  const l_scale = ((header24 >> 18) & 31) / 31;
  const hasAlpha = header24 >> 23;
  const p_scale = ((header16 >> 3) & 63) / 63;
  const q_scale = ((header16 >> 9) & 63) / 63;
  const isLandscape = header16 >> 15;
  const lx = max(3, isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7);
  const ly = max(3, isLandscape ? header16 & 7 : (hasAlpha ? 5 : 7));
  const a_dc = hasAlpha ? (hash[5] & 15) / 15 : 1;
  const a_scale = (hash[5] >> 4) / 15;

  const ac_start = hasAlpha ? 6 : 5;
  let ac_index = 0;

  const decodeChannel = (nx: number, ny: number, scale: number): number[] => {
    const ac: number[] = [];
    for (let cy = 0; cy < ny; cy++) {
      for (let cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx++) {
        ac.push(
          (((hash[ac_start + (ac_index >> 1)] >> ((ac_index++ & 1) << 2)) & 15) / 7.5 - 1) * scale,
        );
      }
    }
    return ac;
  };

  const l_ac = decodeChannel(lx, ly, l_scale);
  const p_ac = decodeChannel(3, 3, p_scale * 1.25);
  const q_ac = decodeChannel(3, 3, q_scale * 1.25);
  const a_ac = hasAlpha ? decodeChannel(5, 5, a_scale) : null;

  const ratio = thumbHashToApproximateAspectRatio(hash);
  const w = round(ratio > 1 ? 32 : 32 * ratio);
  const h = round(ratio > 1 ? 32 / ratio : 32);
  const rgba = new Uint8Array(w * h * 4);
  const fx: number[] = [];
  const fy: number[] = [];

  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      let l = l_dc, p = p_dc, q = q_dc, a = a_dc;

      for (let cx = 0, n = max(lx, hasAlpha ? 5 : 3); cx < n; cx++) {
        fx[cx] = cos((PI / w) * (x + 0.5) * cx);
      }
      for (let cy = 0, n = max(ly, hasAlpha ? 5 : 3); cy < n; cy++) {
        fy[cy] = cos((PI / h) * (y + 0.5) * cy);
      }

      for (let cy = 0, j = 0; cy < ly; cy++) {
        for (let cx = cy ? 0 : 1, fy2 = fy[cy] * 2; cx * ly < lx * (ly - cy); cx++, j++) {
          l += l_ac[j] * fx[cx] * fy2;
        }
      }

      for (let cy = 0, j = 0; cy < 3; cy++) {
        for (let cx = cy ? 0 : 1, fy2 = fy[cy] * 2; cx < 3 - cy; cx++, j++) {
          const f = fx[cx] * fy2;
          p += p_ac[j] * f;
          q += q_ac[j] * f;
        }
      }

      if (hasAlpha && a_ac) {
        for (let cy = 0, j = 0; cy < 5; cy++) {
          for (let cx = cy ? 0 : 1, fy2 = fy[cy] * 2; cx < 5 - cy; cx++, j++) {
            a += a_ac[j] * fx[cx] * fy2;
          }
        }
      }

      const b = l - (2 / 3) * p;
      const r = (3 * l - b + q) / 2;
      const g = r - q;
      rgba[i] = max(0, 255 * min(1, r));
      rgba[i + 1] = max(0, 255 * min(1, g));
      rgba[i + 2] = max(0, 255 * min(1, b));
      rgba[i + 3] = max(0, 255 * min(1, a));
    }
  }

  return { width: w, height: h, rgba };
}

function thumbHashToApproximateAspectRatio(hash: Uint8Array): number {
  const header = hash[3];
  const hasAlpha = hash[2] & 0x80;
  const isLandscape = hash[4] & 0x80;
  const lx = isLandscape ? (hasAlpha ? 5 : 7) : header & 7;
  const ly = isLandscape ? header & 7 : (hasAlpha ? 5 : 7);
  return lx / ly;
}

function thumbHashToAverageColor(hash: Uint8Array): { r: number; g: number; b: number; a: number } {
  const { min, max } = Math;
  const header = hash[0] | (hash[1] << 8) | (hash[2] << 16);
  const l = (header & 63) / 63;
  const p = ((header >> 6) & 63) / 31.5 - 1;
  const q = ((header >> 12) & 63) / 31.5 - 1;
  const hasAlpha = header >> 23;
  const a = hasAlpha ? (hash[5] & 15) / 15 : 1;
  const b = l - (2 / 3) * p;
  const r = (3 * l - b + q) / 2;
  const g = r - q;
  return {
    r: max(0, min(1, r)),
    g: max(0, min(1, g)),
    b: max(0, min(1, b)),
    a,
  };
}

type SkiaModule = typeof import('@shopify/react-native-skia');
type SkiaImage = import('@shopify/react-native-skia').SkImage;

let cachedSkia: SkiaModule | null | undefined;

/**
 * Lazily loads `@shopify/react-native-skia` and caches the module. Returns
 * `null` if Skia is unavailable so the caller can fall back to a solid color.
 */
function loadSkia(): SkiaModule | null {
  if (cachedSkia !== undefined) return cachedSkia;
  try {
    cachedSkia = require('@shopify/react-native-skia') as SkiaModule;
  } catch {
    cachedSkia = null;
  }
  return cachedSkia;
}

export interface ThumbHashProps {
  /** Base64-encoded ThumbHash string. */
  hash: string;
  /** Render width in px. */
  width: number;
  /** Render height in px. */
  height: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * ThumbHash — decodes and renders a ThumbHash placeholder image.
 *
 * The hash is decoded to a low-resolution RGBA buffer (via `decodeThumbHash`)
 * and rendered with Skia. If Skia is unavailable the component falls back to
 * a solid color derived from the hash's average color so the placeholder
 * still occupies the correct space with a representative tint.
 */
export function ThumbHash({ hash, width, height, style }: ThumbHashProps) {
  const { colors } = useAppTheme();
  const skia = loadSkia();
  const [skImage, setSkImage] = React.useState<SkiaImage | null>(null);
  const [skiaError, setSkiaError] = React.useState(false);

  const fallbackColor = React.useMemo(() => {
    try {
      const bytes = base64ToBytes(hash);
      const avg = thumbHashToAverageColor(bytes);
      return `rgba(${Math.round(avg.r * 255)},${Math.round(avg.g * 255)},${Math.round(avg.b * 255)},${avg.a})`;
    } catch {
      return colors.surfaceAlt;
    }
  }, [hash, colors.surfaceAlt]);

  React.useEffect(() => {
    if (!skia) return;
    let cancelled = false;
    try {
      const decoded = decodeThumbHash(hash);
      const { Skia, AlphaType, ColorType } = skia;
      const info = {
        width: decoded.width,
        height: decoded.height,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Premul,
      };
      const data = Skia.Data.fromBytes(decoded.rgba);
      const image = Skia.Image.MakeImage(info, data, decoded.width * 4);
      if (!cancelled) setSkImage(image);
    } catch {
      if (!cancelled) setSkiaError(true);
    }
    return () => {
      cancelled = true;
    };
  }, [hash, skia]);

  const fallback = (
    <View
      style={[
        { width, height, backgroundColor: fallbackColor, borderRadius: Radius.sm },
        style,
      ]}
    />
  );

  if (!skia || skiaError || !skImage) {
    return fallback;
  }

  const { Canvas, Image } = skia;

  return (
    <View style={[{ width, height }, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Image
          image={skImage}
          x={0}
          y={0}
          width={width}
          height={height}
          fit="fill"
        />
      </Canvas>
    </View>
  );
}
