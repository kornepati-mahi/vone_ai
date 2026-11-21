import { authStore, getApiBase } from './api';

export const isRemoteUrl = (url: string) => /^https?:\/\//i.test(url);

/**
 * Backend audio URLs can be relative ("/api/employees/voice-samples/....wav").
 * The browser resolves those against the *frontend* origin, so on Vercel they
 * 404. Prefix the backend base for relative URLs; data:/https URLs pass through.
 */
export const toAudioUrl = (url: string): string => {
  if (!url || url.startsWith('data:')) return url;
  if (isRemoteUrl(url)) return url;
  if (url.startsWith('/')) return `${getApiBase()}${url}`;
  return url;
};

/**
 * Audio samples for cloned voices are served from an authenticated API route,
 * so we must fetch them with the Bearer token and hand back a blob: URL.
 * data: URLs pass through untouched.
 */
export async function fetchAudioObjectUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) return url;
  // Relative URLs (e.g. "/api/employees/voice-samples/...") must be resolved
  // against the backend origin, not the frontend origin.
  const absolute = url.startsWith('/') && !isRemoteUrl(url) ? `${getApiBase()}${url}` : url;
  const headers: Record<string, string> = {};
  const token = authStore.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(absolute, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load audio (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function triggerAudioDownload(objectUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function slugifyFileName(name: string, fallback = 'voice') {
  const slug = String(name || '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return slug || fallback;
}
