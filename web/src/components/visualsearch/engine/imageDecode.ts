// ── Image decode ─────────────────────────────────────────────────────────

export interface DecodedImage {
  /** Canvas-drawable source for feature extraction. */
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Release decoded resources (ImageBitmap.close). */
  dispose: () => void;
}

/** Decode a File into a drawable source. Prefers createImageBitmap; falls
 *  back to an HTMLImageElement over a blob URL for older engines. Throws on
 *  undecodable input — the caller maps that to the 'decode' error state. */
export async function decodeImage(file: File, blobUrl: string): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return {
        source: bmp,
        width: bmp.width,
        height: bmp.height,
        dispose: () => bmp.close(),
      };
    } catch {
      // Fall through to the HTMLImageElement path — some engines reject
      // formats via createImageBitmap that <img> still renders.
    }
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('decode failed'));
    el.src = blobUrl;
  });
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('decode failed');
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    dispose: () => undefined,
  };
}
