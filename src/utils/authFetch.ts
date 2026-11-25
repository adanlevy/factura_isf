import { auth } from '../lib/firebase';
import { getStoredWorkspaceToken } from './googleWorkspace';

/**
 * Retrieves the current user's authentication token:
 * 1. Firebase Auth ID token (JWT) if Firebase user is signed in
 * 2. Google Workspace OAuth access token (starts with ya29.) if workspace session is active
 */
export async function getFirebaseIdToken(): Promise<string | null> {
  try {
    if (!auth.currentUser && typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
    const wsToken = getStoredWorkspaceToken();
    if (wsToken) {
      return wsToken;
    }
  } catch (err) {
    console.warn('[authFetch] Error retrieving authentication token:', err);
  }
  return null;
}

/**
 * Drop-in replacement for window.fetch that injects Authorization: Bearer <ID_TOKEN>
 * for calls to /api/* endpoints.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await getFirebaseIdToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, {
    ...init,
    headers,
  });
}

/**
 * POST de un JSON grande (archivos) con avance de envío: fetch no informa cuánto se subió,
 * XMLHttpRequest sí. Misma autenticación que authFetch. Devuelve el estado y el JSON de respuesta.
 */
export async function authPostJsonWithProgress(
  url: string,
  body: unknown,
  onProgress?: (loaded: number, total: number) => void
): Promise<{ ok: boolean; status: number; data: any }> {
  const token = await getFirebaseIdToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (onProgress) {
      xhr.upload.onprogress = (event) => onProgress(event.loaded, event.lengthComputable ? event.total : 0);
      xhr.upload.onload = () => onProgress(1, 1);
    }
    xhr.onload = () => {
      let data: any = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        data = {};
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error('Error de red al enviar el archivo.'));
    xhr.ontimeout = () => reject(new Error('El envío del archivo tardó demasiado.'));
    xhr.timeout = 5 * 60 * 1000;
    xhr.send(JSON.stringify(body));
  });
}
