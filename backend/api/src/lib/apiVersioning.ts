export type ApiVersion = 'legacy' | 'v1';

function routePath(url: string): string {
  return url.split('?')[0] || '/';
}

export function normalizeVersionedUrl(url: string): {
  url: string;
  apiVersion: ApiVersion;
} {
  const path = routePath(url);
  const prefix = ['/api/v1', '/v1'].find(
    (candidate) => path === candidate || path.startsWith(`${candidate}/`)
  );

  if (!prefix) {
    return {
      url,
      apiVersion: 'legacy',
    };
  }

  const suffix = url.slice(path.length);
  const normalizedPath = path === prefix ? '/' : path.slice(prefix.length);
  return {
    url: `${normalizedPath}${suffix}`,
    apiVersion: 'v1',
  };
}

export function normalizedRoutePath(url: string): string {
  return routePath(normalizeVersionedUrl(url).url);
}
