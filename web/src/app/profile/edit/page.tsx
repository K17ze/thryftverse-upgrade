'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { BackBar } from '@/components/profile/BackBar';
import { INPUT_CLASS, SellField } from '@/components/sell/SellField';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { saveProfileLive, useProfileEdit } from '@/lib/store/profileEdit';
import { DATA_MODE } from '@/lib/api/client';

/**
 * /profile/edit — the mobile EditProfileScreen's web counterpart. Writes
 * a persisted overlay the session merges onto the fixture user, so the
 * change lands on /profile, the header avatar, and closet surfaces.
 */
/** Downscale a picked file into a JPEG data URL — small enough to persist
 *  in the localStorage overlay and to survive reloads, unlike blob: URLs. */
function fileToDataUrl(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error('image decode failed'));
    };
    img.src = src;
  });
}

export default function EditProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const { user, isGuest, refreshSession } = useSession();
  const hydrated = useHydrated();
  const saveOverlay = useProfileEdit((s) => s.saveOverlay);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    username: '',
    avatar: '',
    coverPhoto: '',
    bio: '',
    location: '',
    website: '',
    pronouns: '',
  });
  const [seeded, setSeeded] = useState(false);

  // Seed once from the effective (overlay-merged) user so re-edits show
  // the current truth, not the fixture baseline.
  useEffect(() => {
    if (!hydrated || !user || seeded) return;
    setForm({
      username: user.username ?? '',
      avatar: user.avatar ?? '',
      coverPhoto: user.coverPhoto ?? '',
      bio: user.bio ?? '',
      location: user.location ?? '',
      website: user.website ?? '',
      pronouns: user.pronouns ?? '',
    });
    setSeeded(true);
  }, [hydrated, user, seeded]);

  // Guest guard — navigation belongs in an effect, never during render.
  useEffect(() => {
    if (isGuest) router.replace('/auth');
  }, [isGuest, router]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickImage =
    (field: 'avatar' | 'coverPhoto', maxDim: number) =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset so re-picking the same file still fires change.
      e.target.value = '';
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        toast.show('Pick a JPG, PNG, or WebP image', 'error');
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        toast.show('Image must be under 4 MB', 'error');
        return;
      }
      try {
        const dataUrl = await fileToDataUrl(file, maxDim);
        setForm((f) => ({ ...f, [field]: dataUrl }));
      } catch {
        toast.show('Could not read that image', 'error');
      }
    };

  const onAvatarPick = pickImage('avatar', 320);
  const onCoverPick = pickImage('coverPhoto', 1280);

  const usernameOk = /^[a-z0-9_.]{3,20}$/i.test(form.username.trim());

  /** Save — live mode PATCHes /users/me (the server is the single source;
   *  the overlay is not merged) and re-pulls the session so every
   *  self-facing surface re-renders from the wire. Fixture mode keeps the
   *  persisted overlay write. A failed save toasts the error — never a
   *  fake success. */
  const save = async () => {
    if (!usernameOk || saving) return;
    setSaving(true);
    try {
      // No-ops in fixture mode; the overlay write below is mode-gated.
      await saveProfileLive({
        username: form.username.trim(),
        bio: form.bio.trim(),
        location: form.location.trim(),
        website: form.website.trim(),
        pronouns: form.pronouns.trim(),
        avatar: form.avatar || null,
        coverPhoto: form.coverPhoto || null,
      });
      if (DATA_MODE === 'live') {
        await refreshSession();
      } else {
        saveOverlay({
          username: form.username.trim(),
          // Picked files arrive as downscaled data URLs — persistable as-is.
          avatar: form.avatar || undefined,
          coverPhoto: form.coverPhoto || undefined,
          bio: form.bio.trim() || undefined,
          location: form.location.trim() || undefined,
          website: form.website.trim() || undefined,
          pronouns: form.pronouns.trim() || undefined,
        });
      }
      toast.show('Profile updated');
      router.push('/profile');
    } catch {
      toast.show("Couldn't save your profile — try again", 'error');
    } finally {
      setSaving(false);
    }
  };

  if (isGuest) return null;

  // The form seeds from the overlay-merged user — before hydration settles
  // the inputs would render empty (and the username error would flash).
  if (!hydrated || !seeded) {
    return (
      <div className="mx-auto w-full max-w-xl lg:max-w-[720px]" aria-busy aria-label="Loading profile editor">
        <BackBar />
        <div className="px-4 pb-24 pt-4 sm:px-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-5 h-28 w-full rounded-xl" />
          <div className="mt-5 flex items-center gap-4">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="mt-6 space-y-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    // One focused editing column — the Vinted/IG settings grammar: the
    // media pickers and fields are the live surface, and /profile is the
    // published truth the header links back to. No mirrored preview.
    <div className="mx-auto w-full max-w-xl lg:max-w-[720px]">
      <BackBar
        actions={
          <Link
            href="/profile"
            className="pressable rounded-md px-2 py-1.5 text-caption font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            View profile
          </Link>
        }
      />
      <div className="px-4 pb-24 pt-4 sm:px-6">
        <h1 className="text-screen-title text-text-primary">Edit profile</h1>

        {/* Cover — the hero's media band. Same pick grammar as avatar. */}
        <div className="mt-5">
          <div className="relative h-28 overflow-hidden rounded-xl bg-surface-alt">
            <AppImage
              src={form.coverPhoto}
              alt="Your cover"
              fill
              sizes="(max-width: 640px) 100vw, 672px"
              className="h-full w-full"
              fallbackIcon="image"
            />
          </div>
          <div className="mt-2">
            <label className="inline-flex cursor-pointer items-center text-body font-semibold text-text-primary underline-offset-2 hover:underline">
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onCoverPick} />
              Change cover
            </label>
            <p className="mt-1 text-meta text-text-muted">JPG, PNG, or WebP · under 4 MB</p>
          </div>
        </div>

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

        {/* Fields — short inputs pair two-up on ≥sm; bio takes the row. */}
        <div className="mt-8 grid gap-5 border-t border-border-subtle pt-6 sm:grid-cols-2">
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
          <SellField label="Pronouns" id="pf-pronouns">
            <input
              id="pf-pronouns"
              className={INPUT_CLASS}
              value={form.pronouns}
              onChange={set('pronouns')}
              placeholder="she/her · he/him · they/them"
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
          <div className="sm:col-span-2">
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
        </div>

        {/* Commit — hairline footer, primary action flush right on ≥sm. */}
        <div className="mt-8 border-t border-border-subtle pt-6">
          <div className="flex gap-2 sm:flex-row-reverse sm:justify-end">
            <Button
              variant="primary"
              className="flex-1 sm:flex-none sm:px-8"
              disabled={!usernameOk || saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
          <p className="mt-3 text-meta text-text-muted sm:text-right">
            {DATA_MODE === 'live'
              ? 'Changes save to your account and update your profile everywhere.'
              : 'Changes save to this device and update your profile everywhere in this build.'}
          </p>
        </div>
      </div>
    </div>
  );
}
