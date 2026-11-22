type LoadingListener = (activeCount: number) => void;

let activeRequests = 0;
const listeners = new Set<LoadingListener>();
let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function subscribeLoading(listener: LoadingListener): () => void {
  listeners.add(listener);
  listener(activeRequests);
  return () => {
    listeners.delete(listener);
  };
}

function notifyLoading(delta: number) {
  activeRequests = Math.max(0, activeRequests + delta);
  listeners.forEach((fn) => fn(activeRequests));
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit & { signal?: AbortSignal } = {}
): Promise<T> {
  notifyLoading(1);
  try {
    const headers = new Headers(options.headers);
    headers.set('X-Requested-With', 'AZRIL-CLAS');
    if (inMemoryToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${inMemoryToken}`);
    }
    if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      let msg = `Permintaan gagal (${res.status})`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data?.error) msg = data.error;
      } catch {
        // ignore JSON parse failure
      }
      throw new ApiError(msg, res.status);
    }

    return (await res.json()) as T;
  } finally {
    notifyLoading(-1);
  }
}

export async function apiDownloadFile(url: string, fallbackFilename: string): Promise<void> {
  notifyLoading(1);
  try {
    const headers = new Headers();
    headers.set('X-Requested-With', 'AZRIL-CLAS');
    if (inMemoryToken) {
      headers.set('Authorization', `Bearer ${inMemoryToken}`);
    }
    const res = await fetch(url, { headers, credentials: 'include' });
    if (!res.ok) {
      let msg = `Gagal mengunduh file (${res.status})`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data?.error) msg = data.error;
      } catch {
        // ignore
      }
      throw new ApiError(msg, res.status);
    }

    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || fallbackFilename;

    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objUrl);
  } finally {
    notifyLoading(-1);
  }
}
