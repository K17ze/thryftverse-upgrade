'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { BackBar } from '@/components/profile/BackBar';
import { INPUT_CLASS, SellField } from '@/components/sell/SellField';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useProfileEdit } from '@/lib/store/profileEdit';

/**
 * /profile/edit — the mobile EditProfileScreen's web counterpart. Writes
 * a persisted overlay the session merges onto the fixture user, so the
 * change lands on /profile, the header avatar, and closet surfaces.
 */
export default function EditProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const { user, isGuest } = useSession();
  const hydrated = useHydrated();
  const saveOverlay = useProfileEdit((s) => s.saveOverlay);

  const [form, setForm] = useState({
    username: '',
    avatar: '',
    bio: '',
    location: '',
    website: '',
    pronouns: '',
  });
  const [seeded, setSeeded] = useState(false);
  const [avatarObjectUrl, setAvatarObjectUrl] = useState(false);

  // Seed once from the effective (overlay-merged) user so re-edits show
  // the current truth, not the fixture baseline.
  useEffect(() => {
    if (!hydrated || !user || seeded) return;
    setForm({
      username: user.username ?? '',
      avatar: user.avatar ?? '',
      bio: user.bio ?? '',
      location: user.location ?? '',
      website: user.website ?? '',
      pronouns: user.pronouns ?? '',
    });
    setSeeded(true);
  }, [hydrated, user, seeded]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.show('Pick a JPG, PNG, or WebP image', 'error');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.show('Image must be under 4 MB', 'error');
      return;
    }
    setAvatarObjectUrl(true);
    setForm((f) => ({ ...f, avatar: URL.createObjectURL(file) }));
  };

  const usernameOk = /^[a-z0-9_.]{3,20}$/i.test(form.username.trim());

  const save = () => {
    if (!usernameOk) return;
    saveOverlay({
      username: form.username.trim(),
      // Object URLs don't survive reloads — only persist a real URL.
      avatar: avatarObjectUrl ? undefined : form.avatar || undefined,
      bio: form.bio.trim() || undefined,
      location: form.location.trim() || undefined,
      website: form.website.trim() || undefined,
      pronouns: form.pronouns.trim() || undefined,
    });
    toast.show('Profile updated');
    router.push('/profile');
  };

  if (isGuest) {
    router.replace('/auth');
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <BackBar />
      <div className="px-4 pb-24 pt-4 sm:px-0">
        <h1 className="text-screen-title font-bold text-text-primary">Edit profile</h1>

        {/* Avatar — media-first; a picked file previews instantly */}
        <div className="mt-5 flex items-center gap-4">
          <div className="size-20 overflow-hidden rounded-full border border-border-subtle">
            <AppImage src={form.avatar} alt="Your avatar" className="size-full object-cover" />
          </div>
          <div>
            <label className="inline-flex cursor-pointer items-center text-body font-semibold text-text-primary underline-offset-2 hover:underline">
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onAvatarPick} />
              Change photo
            </label>
            <p className="mt-1 text-meta text-text-muted">JPG, PNG, or WebP · under 4 MB</p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <SellField
            label="Username"
            id="pf-username"
            error={!usernameOk ? '3–20 letters, numbers, dots, underscores' : undefined}
          >
            <input
              id="pf-username"
              className={INPUT_CLASS}
              value={form.username}
              onChange={set('username')}
              autoComplete="username"
            />
          </SellField>
          <SellField label="Location" id="pf-location">
            <input
              id="pf-location"
              className={INPUT_CLASS}
              value={form.location}
              onChange={set('location')}
              placeholder="City, country"
            />
          </SellField>
          <SellField label="Website" id="pf-website">
            <input
              id="pf-website"
              className={INPUT_CLASS}
              value={form.website}
              onChange={set('website')}
              placeholder="https://…"
              inputMode="url"
            />
          </SellField>
          <SellField label="Pronouns" id="pf-pronouns">
            <input
              id="pf-pronouns"
              className={INPUT_CLASS}
              value={form.pronouns}
              onChange={set('pronouns')}
              placeholder="she/her · he/him · they/them"
            />
          </SellField>
          <SellField label="Bio" id="pf-bio" hint={`${form.bio.length}/160`}>
            <textarea
              id="pf-bio"
              className={`${INPUT_CLASS} h-auto resize-none py-2.5`}
              rows={3}
              maxLength={160}
              value={form.bio}
              onChange={set('bio')}
              placeholder="A line about what you buy and sell"
            />
          </SellField>
        </div>

        <p className="mt-5 text-meta text-text-muted">
          Changes save to this device and update your profile everywhere in this build.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" className="flex-1" disabled={!usernameOk} onClick={save}>
            Save
          </Button>
          <Button variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
