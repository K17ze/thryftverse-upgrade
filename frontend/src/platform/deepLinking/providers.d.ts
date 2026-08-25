declare module 'expo-branch' {
  export interface BranchParams {
    error?: string | null;
    url?: string;
    params?: Record<string, unknown>;
    [key: string]: unknown;
  }
  export function subscribe(callback: (params: BranchParams) => void): void;
  export function addListener(callback: (params: BranchParams) => void): void;
  export function getLatestReferringParams(): Promise<Record<string, unknown>>;
  const _default: {
    subscribe?: typeof subscribe;
    addListener?: typeof addListener;
    getLatestReferringParams?: typeof getLatestReferringParams;
  };
  export default _default;
}

declare module 'react-native-appsflyer' {
  export interface AppsFlyerAttribution {
    deepLink?: string;
    [key: string]: unknown;
  }
  export function onInstallConversionData(
    callback: (data: Record<string, unknown>) => void,
  ): void;
  export function onAppOpenAttribution(
    callback: (data: AppsFlyerAttribution) => void,
  ): void;
  export function getAppsFlyerUID(): string;
  const _default: {
    onInstallConversionData?: typeof onInstallConversionData;
    onAppOpenAttribution?: typeof onAppOpenAttribution;
    getAppsFlyerUID?: typeof getAppsFlyerUID;
  };
  export default _default;
}
