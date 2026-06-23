import {
  manipulateAsync,
  SaveFormat,
  FlipType,
  type Action,
  type ImageResult,
} from 'expo-image-manipulator';

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: SaveFormat;
}

export async function compressImage(
  uri: string,
  opts: CompressOptions = {},
): Promise<ImageResult> {
  const actions: Action[] = [];
  if (opts.maxWidth || opts.maxHeight) {
    actions.push({
      resize: {
        width: opts.maxWidth,
        height: opts.maxHeight,
      },
    });
  }
  return manipulateAsync(uri, actions, {
    compress: opts.quality ?? 0.8,
    format: opts.format ?? SaveFormat.JPEG,
  });
}

export async function resizeImage(
  uri: string,
  width: number,
  height?: number,
): Promise<ImageResult> {
  return manipulateAsync(
    uri,
    [{ resize: { width, height } }],
    { compress: 1, format: SaveFormat.JPEG },
  );
}

export async function cropImage(
  uri: string,
  originX: number,
  originY: number,
  width: number,
  height: number,
): Promise<ImageResult> {
  return manipulateAsync(
    uri,
    [{ crop: { originX, originY, width, height } }],
    { compress: 1, format: SaveFormat.JPEG },
  );
}

export async function rotateImage(
  uri: string,
  degrees: 90 | 180 | 270,
): Promise<ImageResult> {
  return manipulateAsync(
    uri,
    [{ rotate: degrees }],
    { compress: 1, format: SaveFormat.JPEG },
  );
}

export async function flipImage(
  uri: string,
  direction: 'horizontal' | 'vertical',
): Promise<ImageResult> {
  return manipulateAsync(
    uri,
    [{ flip: direction === 'horizontal' ? FlipType.Horizontal : FlipType.Vertical }],
    { compress: 1, format: SaveFormat.JPEG },
  );
}

export const mediaTransforms = {
  compress: compressImage,
  resize: resizeImage,
  crop: cropImage,
  rotate: rotateImage,
  flip: flipImage,
};
