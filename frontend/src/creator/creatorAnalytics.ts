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
  | 'creator_page_add'
  | 'creator_page_remove';

interface CreatorAnalyticsPayload {
  documentType?: 'look' | 'poster';
  layerType?: string;
  pageCount?: number;
  layerCount?: number;
  durationMs?: number;
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

  pageAdd: (documentType: 'look' | 'poster', pageCount: number) =>
    trackCreatorEvent('creator_page_add', { documentType, pageCount }),

  pageRemove: (documentType: 'look' | 'poster', pageCount: number) =>
    trackCreatorEvent('creator_page_remove', { documentType, pageCount }),
};
