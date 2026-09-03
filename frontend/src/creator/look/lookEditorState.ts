// ── Look editor state machine ─────────────────────────────────────────
// Replaces 13+ parallel `show*` boolean state variables with a single
// discriminated-union mode. Only one non-idle mode is active at a time,
// eliminating impossible UI combinations and simplifying Back handling.
// `showSafeZone` and `showOverflow` are orthogonal — they can be on in
// any mode.

export type LookEditorMode =
  | { type: 'idle' }
  | { type: 'selectingLayer' }
  | { type: 'editingText'; layerId: string }
  | { type: 'choosingAsset' }
  | { type: 'adjustingMedia' }
  | { type: 'linkingProduct' }
  | { type: 'choosingTemplate' }
  | { type: 'arrangingLayers' }
  | { type: 'background' }
  | { type: 'aiEffects' }
  | { type: 'a11yMove' }
  | { type: 'a11yZOrder' }
  | { type: 'alignPicker' }
  | { type: 'previewing' }
  | { type: 'publishing' }
  | { type: 'settings' }
  | { type: 'help' };

export type LookEditorState = {
  mode: LookEditorMode;
  showSafeZone: boolean;  // orthogonal — can be on in any mode
  showOverflow: boolean;  // orthogonal — the More menu
};

export type LookEditorAction =
  | { type: 'ENTER_IDLE' }
  | { type: 'SELECT_LAYER'; layerId: string | null }
  | { type: 'EDIT_TEXT'; layerId: string }
  | { type: 'CHOOSE_ASSET' }
  | { type: 'ADJUST_MEDIA' }
  | { type: 'LINK_PRODUCT' }
  | { type: 'CHOOSE_TEMPLATE' }
  | { type: 'ARRANGE_LAYERS' }
  | { type: 'SHOW_BACKGROUND' }
  | { type: 'SHOW_AI_EFFECTS' }
  | { type: 'SHOW_A11Y_MOVE' }
  | { type: 'SHOW_A11Y_ZORDER' }
  | { type: 'SHOW_ALIGN_PICKER' }
  | { type: 'SHOW_PREVIEW' }
  | { type: 'SHOW_PUBLISH' }
  | { type: 'SHOW_SETTINGS' }
  | { type: 'SHOW_HELP' }
  | { type: 'TOGGLE_SAFE_ZONE' }
  | { type: 'TOGGLE_OVERFLOW' }
  | { type: 'BACK' };  // dismisses current mode → idle

export const initialLookEditorState: LookEditorState = {
  mode: { type: 'idle' },
  showSafeZone: false,
  showOverflow: false,
};

export function lookEditorReducer(
  state: LookEditorState,
  action: LookEditorAction,
): LookEditorState {
  switch (action.type) {
    case 'ENTER_IDLE':
    case 'BACK':
      return { ...state, mode: { type: 'idle' }, showOverflow: false };

    case 'SELECT_LAYER':
      return {
        ...state,
        mode: action.layerId ? { type: 'selectingLayer' } : { type: 'idle' },
        showOverflow: false,
      };

    case 'EDIT_TEXT':
      return { ...state, mode: { type: 'editingText', layerId: action.layerId }, showOverflow: false };

    case 'CHOOSE_ASSET':
      return { ...state, mode: { type: 'choosingAsset' }, showOverflow: false };

    case 'ADJUST_MEDIA':
      return { ...state, mode: { type: 'adjustingMedia' }, showOverflow: false };

    case 'LINK_PRODUCT':
      return { ...state, mode: { type: 'linkingProduct' }, showOverflow: false };

    case 'CHOOSE_TEMPLATE':
      return { ...state, mode: { type: 'choosingTemplate' }, showOverflow: false };

    case 'ARRANGE_LAYERS':
      return { ...state, mode: { type: 'arrangingLayers' }, showOverflow: false };

    case 'SHOW_BACKGROUND':
      return { ...state, mode: { type: 'background' }, showOverflow: false };

    case 'SHOW_AI_EFFECTS':
      return { ...state, mode: { type: 'aiEffects' }, showOverflow: false };

    case 'SHOW_A11Y_MOVE':
      return { ...state, mode: { type: 'a11yMove' }, showOverflow: false };

    case 'SHOW_A11Y_ZORDER':
      return { ...state, mode: { type: 'a11yZOrder' }, showOverflow: false };

    case 'SHOW_ALIGN_PICKER':
      return { ...state, mode: { type: 'alignPicker' }, showOverflow: false };

    case 'SHOW_PREVIEW':
      return { ...state, mode: { type: 'previewing' }, showOverflow: false };

    case 'SHOW_PUBLISH':
      return { ...state, mode: { type: 'publishing' }, showOverflow: false };

    case 'SHOW_SETTINGS':
      return { ...state, mode: { type: 'settings' }, showOverflow: false };

    case 'SHOW_HELP':
      return { ...state, mode: { type: 'help' }, showOverflow: false };

    case 'TOGGLE_SAFE_ZONE':
      return { ...state, showSafeZone: !state.showSafeZone };

    case 'TOGGLE_OVERFLOW':
      return { ...state, showOverflow: !state.showOverflow };

    default:
      return state;
  }
}
