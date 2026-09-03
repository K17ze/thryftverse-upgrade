import React from 'react';

/**
 * Modal sheet ids — mutually exclusive overlays. Only one modal sheet
 * may be visible at a time on the AssetDetail surface. The previous
 * inline implementation used independent booleans, but no code path
 * ever opened two simultaneously; this discriminated union encodes
 * that invariant without changing observable behaviour.
 */
export type AssetDetailSheetId =
  | 'fullscreen'
  | 'guide'
  | 'rights'
  | 'overflow'
  | 'supply'
  | 'riskDisclosure';

/**
 * Inline disclosure expansion ids — independent collapsible sections
 * that may coexist with each other and with an open modal sheet.
 */
export type AssetDetailExpansionId =
  | 'orderBook'
  | 'fundamentals'
  | 'marketSection'
  | 'diligenceSection';

export interface AssetDetailSheetsState {
  // Modal sheets (mutually exclusive)
  fullscreenVisible: boolean;
  guideVisible: boolean;
  rightsSheetVisible: boolean;
  overflowVisible: boolean;
  supplySheetVisible: boolean;
  riskDisclosureVisible: boolean;
  // Inline expansions (independent)
  orderBookExpanded: boolean;
  fundamentalsExpanded: boolean;
  marketSectionExpanded: boolean;
  diligenceSectionExpanded: boolean;
}

export interface UseAssetDetailSheetsResult {
  sheets: AssetDetailSheetsState;
  /** Open a modal sheet, closing any other currently-open modal. */
  open: (id: AssetDetailSheetId) => void;
  /** Close a modal sheet. No-op if a different sheet is active. */
  close: (id: AssetDetailSheetId) => void;
  /** Toggle an inline disclosure expansion. */
  toggle: (id: AssetDetailExpansionId) => void;
  /** Set an inline disclosure expansion to a specific value. */
  setExpansion: (id: AssetDetailExpansionId, value: boolean) => void;
}

/**
 * Owns the sheet/expansion boolean state for the Co-Own asset detail
 * surface. Modal sheets are modelled as a discriminated union so that
 * at most one overlay is visible at a time; inline disclosure expansions
 * remain independent booleans that may coexist.
 */
export function useAssetDetailSheets(): UseAssetDetailSheetsResult {
  const [activeSheet, setActiveSheet] = React.useState<AssetDetailSheetId | null>(null);
  const [orderBookExpanded, setOrderBookExpanded] = React.useState(false);
  const [fundamentalsExpanded, setFundamentalsExpanded] = React.useState(false);
  const [marketSectionExpanded, setMarketSectionExpanded] = React.useState(false);
  const [diligenceSectionExpanded, setDiligenceSectionExpanded] = React.useState(false);

  const open = React.useCallback((id: AssetDetailSheetId) => {
    setActiveSheet(id);
  }, []);

  const close = React.useCallback((id: AssetDetailSheetId) => {
    setActiveSheet((prev) => (prev === id ? null : prev));
  }, []);

  const toggle = React.useCallback((id: AssetDetailExpansionId) => {
    switch (id) {
      case 'orderBook':
        setOrderBookExpanded((prev) => !prev);
        break;
      case 'fundamentals':
        setFundamentalsExpanded((prev) => !prev);
        break;
      case 'marketSection':
        setMarketSectionExpanded((prev) => !prev);
        break;
      case 'diligenceSection':
        setDiligenceSectionExpanded((prev) => !prev);
        break;
    }
  }, []);

  const setExpansion = React.useCallback((id: AssetDetailExpansionId, value: boolean) => {
    switch (id) {
      case 'orderBook':
        setOrderBookExpanded(value);
        break;
      case 'fundamentals':
        setFundamentalsExpanded(value);
        break;
      case 'marketSection':
        setMarketSectionExpanded(value);
        break;
      case 'diligenceSection':
        setDiligenceSectionExpanded(value);
        break;
    }
  }, []);

  const sheets: AssetDetailSheetsState = {
    fullscreenVisible: activeSheet === 'fullscreen',
    guideVisible: activeSheet === 'guide',
    rightsSheetVisible: activeSheet === 'rights',
    overflowVisible: activeSheet === 'overflow',
    supplySheetVisible: activeSheet === 'supply',
    riskDisclosureVisible: activeSheet === 'riskDisclosure',
    orderBookExpanded,
    fundamentalsExpanded,
    marketSectionExpanded,
    diligenceSectionExpanded,
  };

  return { sheets, open, close, toggle, setExpansion };
}
