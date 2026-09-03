type CreatorAnalyticsEvent =
  | 'creator_session_start'
  | 'creator_layer_add'
  | 'creator_layer_remove'
  | 'creator_layer_duplicate'
  | 'creator_layer_reorder'
  | 'creator_layer_transform'
  | 'creator_undo'
  | 'creator_redo'
  | 'creator_draft_save'
  | 'creator_draft_load'
  | 'creator_publish_start'
  | 'creator_publish_success'
  | 'creator_publish_error'
  | 'creator_publish_unknown'
  | 'creator_schedule_unknown'
  | 'creator_page_add'
  | 'creator_page_remove'
  | 'creator_capture_photo'
  | 'creator_capture_video'
  | 'creator_capture_boomerang'
  | 'creator_visual_search'
  | 'creator_mode_switch'
  | 'creator_camera_flip'
  | 'creator_camera_effect';

interface CreatorAnalyticsPayload {
  documentType?: 'look' | 'poster';
  layerType?: string;
  pageCount?: number;
  layerCount?: number;
  durationMs?: number;
  captureLatencyMs?: number;
  errorMessage?: string;
  publishedId?: string;
}

let handler: ((event: CreatorAnalyticsEvent, payload: CreatorAnalyticsPayload) => void) | null = null;

export function setCreatorAnalyticsHandler(
  h: ((event: CreatorAnalyticsEvent, payload: CreatorAnalyticsPayload) => void) | null,
) {
  handler = h;
}

export function trackCreatorEvent(event: CreatorAnalyticsEvent, payload: CreatorAnalyticsPayload = {}) {
  if (handler) {
    try {
      handler(event, payload);
    } catch {
      // silently fail — analytics must not crash the editor
    }
  }
  // NOTE: Publish events are no longer forwarded to the analytics event
  // endpoint from the client. The previous implementation sent camelCase
  // fields to a snake_case endpoint and misclassified the event as
  // `profile_visit`, polluting that metric. Content publication is now
  // recorded server-side through the domain outbox in the publish route,
  // which is the canonical source of truth for content lifecycle events.
}

export const CreatorAnalytics = {
  sessionStart: (documentType: 'look' | 'poster') =>
    trackCreatorEvent('creator_session_start', { documentType }),

  layerAdd: (documentType: 'look' | 'poster', layerType: string) =>
    trackCreatorEvent('creator_layer_add', { documentType, layerType }),

  layerRemove: (documentType: 'look' | 'poster', layerType: string) =>
    trackCreatorEvent('creator_layer_remove', { documentType, layerType }),

  layerDuplicate: (documentType: 'look' | 'poster', layerType: string) =>
    trackCreatorEvent('creator_layer_duplicate', { documentType, layerType }),

  layerReorder: (documentType: 'look' | 'poster', direction: string) =>
    trackCreatorEvent('creator_layer_reorder', { documentType, layerType: direction }),

  layerTransform: (documentType: 'look' | 'poster', layerType: string) =>
    trackCreatorEvent('creator_layer_transform', { documentType, layerType }),

  undo: (documentType: 'look' | 'poster') =>
    trackCreatorEvent('creator_undo', { documentType }),

  redo: (documentType: 'look' | 'poster') =>
    trackCreatorEvent('creator_redo', { documentType }),

  draftSave: (documentType: 'look' | 'poster') =>
    trackCreatorEvent('creator_draft_save', { documentType }),

  draftLoad: (documentType: 'look' | 'poster') =>
    trackCreatorEvent('creator_draft_load', { documentType }),

  publishStart: (documentType: 'look' | 'poster') =>
    trackCreatorEvent('creator_publish_start', { documentType }),

  publishSuccess: (documentType: 'look' | 'poster', publishedId: string) =>
    trackCreatorEvent('creator_publish_success', { documentType, publishedId }),

  publishError: (documentType: 'look' | 'poster', errorMessage: string) =>
    trackCreatorEvent('creator_publish_error', { documentType, errorMessage }),

  scheduleUnknown: (documentType: 'look' | 'poster') =>
    trackCreatorEvent('creator_schedule_unknown', { documentType }),

  publishUnknown: (documentType: 'look' | 'poster') =>
    trackCreatorEvent('creator_publish_unknown', { documentType }),

  pageAdd: (documentType: 'look' | 'poster', pageCount: number) =>
    trackCreatorEvent('creator_page_add', { documentType, pageCount }),

  pageRemove: (documentType: 'look' | 'poster', pageCount: number) =>
    trackCreatorEvent('creator_page_remove', { documentType, pageCount }),

  capturePhoto: (documentType: 'look' | 'poster', captureLatencyMs: number) =>
    trackCreatorEvent('creator_capture_photo', { documentType, captureLatencyMs }),

  captureVideo: (documentType: 'look' | 'poster', durationMs: number) =>
    trackCreatorEvent('creator_capture_video', { documentType, durationMs }),

  captureBoomerang: (documentType: 'look' | 'poster', captureLatencyMs: number) =>
    trackCreatorEvent('creator_capture_boomerang', { documentType, captureLatencyMs }),

  visualSearch: (captureLatencyMs: number) =>
    trackCreatorEvent('creator_visual_search', { captureLatencyMs }),

  modeSwitch: (documentType: 'look' | 'poster', mode: string) =>
    trackCreatorEvent('creator_mode_switch', { documentType, layerType: mode }),

  cameraFlip: (documentType: 'look' | 'poster') =>
    trackCreatorEvent('creator_camera_flip', { documentType }),

  cameraEffectSelected: (effectId: string) =>
    trackCreatorEvent('creator_camera_effect', { layerType: effectId }),
};
