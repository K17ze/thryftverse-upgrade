'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { uploadImageFile } from '@/lib/api/services/uploads';
import { parseApiError } from '@/lib/api/http';
import { useSession } from '@/lib/session/SessionProvider';
import {
  useRespondToVerificationDemand,
  useVerificationDemand,
} from '@/lib/hooks/verification-queries';
import {
  MAX_EVIDENCE_PHOTOS,
  isDemandOverdue,
  type DemandEvidence,
} from '../demandModel';

export function useDemandResponseWorkflow(demandId: number) {
  const router = useRouter();
  const { isGuest } = useSession();
  const toast = useToast();
  const { data: demand, isLoading, isError, refetch } = useVerificationDemand(demandId);
  const respond = useRespondToVerificationDemand();

  const [evidence, setEvidence] = useState<DemandEvidence[]>([]);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isGuest) router.replace('/auth');
  }, [isGuest, router]);

  // Release object-URL previews on unmount.
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const overdue = demand ? isDemandOverdue(demand) : false;
  const canSubmit =
    evidence.length > 0 && evidence.every((e) => !e.uploading) && !respond.isPending;

  const attachFiles = (files: File[]) => {
    const room = MAX_EVIDENCE_PHOTOS - evidence.length;
    if (files.length === 0) return;
    if (room <= 0) {
      toast.show(`Attach up to ${MAX_EVIDENCE_PHOTOS} photos.`, 'info');
      return;
    }
    files.slice(0, room).forEach((file) => {
      const uri = URL.createObjectURL(file);
      objectUrlsRef.current.add(uri);
      const id = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (DATA_MODE !== 'live') {
        setEvidence((prev) => [...prev, { id, uri, uploadedUrl: uri, uploading: false }]);
        return;
      }

      setEvidence((prev) => [...prev, { id, uri, uploadedUrl: null, uploading: true }]);
      uploadImageFile(file, 'evidence')
        .then((media) => {
          setEvidence((prev) =>
            prev.map((e) =>
              e.id === id ? { ...e, uploadedUrl: media.publicUrl, uploading: false } : e,
            ),
          );
        })
        .catch(() => {
          setEvidence((prev) => prev.filter((e) => e.id !== id));
          URL.revokeObjectURL(uri);
          objectUrlsRef.current.delete(uri);
          toast.show('Unable to upload a photo. Try again.', 'error');
        });
    });
  };

  const removeEvidence = (id: string) => {
    setEvidence((prev) => {
      const item = prev.find((e) => e.id === id);
      if (item && item.uri.startsWith('blob:')) {
        URL.revokeObjectURL(item.uri);
        objectUrlsRef.current.delete(item.uri);
      }
      return prev.filter((e) => e.id !== id);
    });
  };

  const submit = () => {
    if (!demand) return;
    if (evidence.length === 0) {
      toast.show('Attach at least one photo as evidence.', 'error');
      return;
    }
    if (!canSubmit) return;
    const primaryUrl = evidence[0].uploadedUrl ?? evidence[0].uri;
    const extraUrls = evidence.slice(1).map((e) => e.uploadedUrl ?? e.uri);
    const trimmed = notes.trim();
    const composed = trimmed
      ? extraUrls.length
        ? `${trimmed}\n\nEvidence photos: ${[primaryUrl, ...extraUrls].join(', ')}`
        : trimmed
      : extraUrls.length
        ? `Evidence photos: ${[primaryUrl, ...extraUrls].join(', ')}`
        : undefined;

    respond.mutate(
      {
        assetId: demand.assetId,
        demandId: demand.id,
        evidenceUrl: primaryUrl,
        evidenceNotes: composed,
      },
      {
        onSuccess: () => {
          toast.show('Evidence submitted. The buyer has been notified.', 'success');
          setSubmitted(true);
          window.scrollTo({ top: 0 });
        },
        onError: (err) => {
          toast.show(parseApiError(err).message, 'error');
        },
      },
    );
  };

  return {
    router,
    isGuest,
    demand,
    isLoading,
    isError,
    refetch,
    respond,
    evidence,
    notes,
    setNotes,
    submitted,
    fileRef,
    overdue,
    canSubmit,
    attachFiles,
    removeEvidence,
    submit,
  };
}
