import { useEffect, useRef } from 'react';
import { useStore, type User } from '../../store/useStore';
import { useProfileMediaUpload } from '../useProfileMediaUpload';
import { useToast } from '../../context/ToastContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';

/**
 * Profile-media lifecycle for the owner profile: avatar/cover picker upload
 * wiring, the confirmed-remote vs pending-local display priority chain, and
 * upload-status toasts. Extracted from MyProfileScreen — the upload state
 * machine itself lives in useProfileMediaUpload and is untouched.
 */
export function useMyProfileMedia(user: User | null) {
  const { show } = useToast();
  const { t: tt } = useAppTranslation('myProfile');

  const userAvatar = useStore((state) => state.userAvatar);
  const userCover = useStore((state) => state.userCover);
  const updateUserAvatar = useStore((state) => state.updateUserAvatar);
  const updateUserCover = useStore((state) => state.updateUserCover);
  const updateUserProfile = useStore((state) => state.updateUserProfile);
  const fetchMyProfile = useStore((state) => state.fetchMyProfile);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);

  const confirmedAvatarRemote = user?.avatar ?? userAvatar ?? null;
  const confirmedCoverRemote = user?.coverPhoto ?? userCover ?? null;

  const {
    avatar: avatarState,
    cover: coverState,
    pickAvatar,
    pickCover,
    retryCover,
    revertCover } = useProfileMediaUpload(
    user?.id,
    confirmedAvatarRemote,
    confirmedCoverRemote,
    (url) => {
      updateUserAvatar(url);
      updateUserProfile({ avatar: url });
    },
    (url) => {
      updateUserCover(url);
      updateUserProfile({ coverPhoto: url, coverVideo: null });
      fetchMyProfile().catch(() => {});
    }
  );

  // Show toast on cover upload status changes
  const prevCoverStatus = useRef(coverState.status);
  useEffect(() => {
    if (coverState.status === 'confirmed' && prevCoverStatus.current !== 'confirmed') {
      show(tt('toast.coverUpdated'), 'success');
    } else if (coverState.status === 'failed' && prevCoverStatus.current !== 'failed') {
      show(tt('toast.coverUploadFailed'), 'error');
    }
    prevCoverStatus.current = coverState.status;
  }, [coverState.status, show, tt]);

  // Show toast on avatar upload status changes
  const prevAvatarStatus = useRef(avatarState.status);
  useEffect(() => {
    if (avatarState.status === 'confirmed' && prevAvatarStatus.current !== 'confirmed') {
      show(tt('toast.avatarUpdated'), 'success');
    } else if (avatarState.status === 'failed' && prevAvatarStatus.current !== 'failed') {
      show(tt('toast.avatarUploadFailed'), 'error');
    }
    prevAvatarStatus.current = avatarState.status;
  }, [avatarState.status, show, tt]);

  const profileUserId = user?.id ?? null;
  const profileMediaOverride = profileUserId ? (profileMediaOverrides[profileUserId] ?? null) : null;

  // Display priority: pending local > confirmed remote > store > override
  const displayCover = coverState.pendingLocal
    || coverState.confirmedRemote
    || user?.coverPhoto
    || userCover
    || profileMediaOverride?.cover
    || '';
  const displayAvatar = avatarState.pendingLocal
    || avatarState.confirmedRemote
    || user?.avatar
    || userAvatar
    || profileMediaOverride?.avatar
    || null;

  return {
    avatarState,
    coverState,
    pickAvatar,
    pickCover,
    retryCover,
    revertCover,
    displayAvatar,
    displayCover,
  };
}
