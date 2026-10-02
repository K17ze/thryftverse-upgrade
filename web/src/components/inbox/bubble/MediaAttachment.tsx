'use client';

import type { Message } from '@/lib/contracts/domain';
import { isLocalMediaUri } from '@/lib/utils/media';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';

interface MediaAttachmentProps {
  message: Message;
  mediaOnly: boolean;
  onMediaPress?: (message: Message) => void;
}

export function MediaAttachment({
  message: m,
  mediaOnly,
  onMediaPress,
}: MediaAttachmentProps) {
  if (!m.mediaUri) return null;
  const isVideo = m.mediaType === 'video';

  if (onMediaPress) {
    // Tap → fullscreen lightbox (mobile ChatMediaPreviewScreen).
    // The video renders inert inside the press target — playback
    // lives in the lightbox's real controls player.
    return (
      <button
        type="button"
        onClick={() => onMediaPress(m)}
        aria-label={isVideo ? 'Play video' : 'View photo'}
        className="pressable relative -mx-1 -mb-0.5 block"
      >
        {isVideo ? (
          <span className="relative block">
            <video
              src={m.mediaUri}
              poster={m.posterUri}
              preload="metadata"
              className="pointer-events-none mb-1 max-h-72 w-full max-w-[320px] rounded-xl bg-black"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 mb-1 flex items-center justify-center rounded-xl"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-media-overlay-scrim text-scrim-text-primary">
                <Icon name="play" size={18} filled />
              </span>
            </span>
          </span>
        ) : isLocalMediaUri(m.mediaUri) ? (
          // eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable
          <img
            src={m.mediaUri}
            alt="Shared media"
            className="mb-1 max-h-72 w-full max-w-[320px] rounded-xl object-cover"
          />
        ) : (
          <AppImage
            src={m.mediaUri}
            alt="Shared media"
            aspectRatio={4 / 3}
            sizes="320px"
            className={`${mediaOnly ? '' : 'mb-1'} rounded-xl`}
          />
        )}
      </button>
    );
  }

  if (isVideo) {
    return (
      <video
        src={m.mediaUri}
        poster={m.posterUri}
        controls
        preload="metadata"
        className="mb-1 max-h-72 w-full max-w-[320px] rounded-xl bg-black"
      />
    );
  }

  if (isLocalMediaUri(m.mediaUri)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable
      <img
        src={m.mediaUri}
        alt="Shared media"
        className="mb-1 max-h-72 w-full max-w-[320px] rounded-xl object-cover"
      />
    );
  }

  return (
    <AppImage
      src={m.mediaUri}
      alt="Shared media"
      aspectRatio={4 / 3}
      sizes="320px"
      className={`${mediaOnly ? '' : 'mb-1'} rounded-xl`}
    />
  );
}
