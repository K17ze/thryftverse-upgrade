import { AppImage } from '@/components/ui/AppImage';

/** Square asset thumbnail — media is the color, hairline edge via appimg. */
export function AssetThumb({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <AppImage
      src={src}
      alt={alt}
      aspectRatio={1}
      sizes="96px"
      className={`rounded-lg ${className}`}
    />
  );
}
