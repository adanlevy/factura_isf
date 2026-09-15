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
