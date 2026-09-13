import type {
  ConnectedProvider,
  DiscoveredModel,
  TestResult } from '../../services/aiProviderApi';

export type ConnectionStatus = 'connected' | 'not_connected' | 'invalid';

export interface ProviderState {
  stored: ConnectedProvider | null;
  editing: boolean;
  keyInput: string;
  baseUrlInput: string;
  testing: boolean;
  testResult: TestResult | null;
  /** Provider-authoritative models discovered via the /models endpoint.
   *  Null = not yet discovered; empty array = discovered but none found. */
  discoveredModels: DiscoveredModel[] | null;
  discovering: boolean;
}

export type StudioToast = { kind: 'success' | 'error'; message: string } | null;

export function emptyProviderState(): ProviderState {
  return {
    stored: null,
    editing: false,
    keyInput: '',
    baseUrlInput: '',
    testing: false,
    testResult: null,
    discoveredModels: null,
    discovering: false };
}
