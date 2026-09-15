import { auth } from '../lib/firebase';

/**
 * Retrieves the current user's Firebase Auth ID token (JWT)
 * Automatically waits for authStateReady if Firebase Auth is initializing.
 */
export async function getFirebaseIdToken(): Promise<string | null> {
  try {
    if (!auth.currentUser && typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn('[authFetch] Error retrieving Firebase ID token:', err);
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
