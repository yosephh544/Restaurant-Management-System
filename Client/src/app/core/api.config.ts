import { environment } from '../../environments/environment';

export const API_ORIGIN = environment.apiOrigin;
export const API_BASE_URL = `${API_ORIGIN}/api/v1`;
export const RESPONSE_ENCRYPTION_KEY = environment.responseEncryptionKey;

/** Resolves server-relative asset paths (e.g. /uploads/menu/x.jpg) to the API origin. */
export function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}
