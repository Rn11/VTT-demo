import type { Asset } from '@vtt/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  const res = await fetch(url, init);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok)
    throw new ApiError(
      res.status,
      (data as { error?: string } | null)?.error ?? `Fehler ${res.status}`,
    );
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

export interface Gm {
  id: string;
  name: string;
}

export interface AdventureSummary {
  id: string;
  name: string;
  inviteToken: string;
}

export const assetUrl = (id: string, thumb = false) =>
  `/api/assets/${id}${thumb ? '?thumb=1' : ''}`;

export const inviteUrl = (token: string) => `${location.origin}/join/${token}`;

export async function uploadAsset(adventureId: string, file: File): Promise<Asset> {
  const form = new FormData();
  form.append('file', file, file.name);
  const r = await api.post<{ asset: Asset }>(`/api/adventures/${adventureId}/assets`, form);
  return r.asset;
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback für unsichere Kontexte (http ohne localhost)
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
