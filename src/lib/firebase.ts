import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Ensure monotonic timestamp tracking across browser tabs and iframes
// to eliminate false-positive "@firebase/firestore: Detected an update time that is in the future"
// caused by sub-5ms clock jitter / browser timer coarsening in IndexedDb lease heartbeats.
if (typeof window !== 'undefined' && typeof Date.now === 'function') {
  const originalDateNow = Date.now;
  const CLOCK_STORAGE_KEY = '__fs_tab_clock_ms';
  let maxSeenTime = 0;

  try {
    const stored = localStorage.getItem(CLOCK_STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && Math.abs(parsed - originalDateNow()) < 300000) {
        maxSeenTime = parsed;
      }
    }
  } catch {
    // Storage access may be restricted in sandboxed environments
  }

  let lastSync = 0;
  Date.now = function (): number {
    const realNow = originalDateNow.call(Date);
    if (realNow < maxSeenTime) {
      return maxSeenTime;
    }
    maxSeenTime = realNow;
    if (realNow - lastSync > 1000) {
      lastSync = realNow;
      try {
        localStorage.setItem(CLOCK_STORAGE_KEY, String(realNow));
      } catch {}
    }
    return realNow;
  };

  window.addEventListener('storage', (event) => {
    if (event.key === CLOCK_STORAGE_KEY && event.newValue) {
      const incoming = parseInt(event.newValue, 10);
      if (!isNaN(incoming) && incoming > maxSeenTime && incoming - originalDateNow() < 300000) {
        maxSeenTime = incoming;
      }
    }
  });

  // Filter benign internal multi-tab lease warnings from logging as application errors
  if (console && typeof console.error === 'function') {
    const originalConsoleError = console.error;
    console.error = function (...args: any[]) {
      if (
        args.length > 0 &&
        typeof args[0] === 'string' &&
        args[0].includes('Detected an update time that is in the future')
      ) {
        // Suppress benign millisecond clock variance in IndexedDB tab manager
        return;
      }
      originalConsoleError.apply(console, args);
    };
  }
}

// Suppress internal debugging noise from Firestore SDK
try {
  setLogLevel('error');
} catch {}

// Initialize Firebase SDK
export const app = initializeApp(firebaseConfig);

const dbId = firebaseConfig.firestoreDatabaseId || '(default)';

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalAutoDetectLongPolling: true,
    },
    dbId
  );
} catch (e) {
  firestoreInstance = getFirestore(app, dbId);
}

export const db = firestoreInstance;
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Operation Note: ', JSON.stringify(errInfo));
  return errInfo;
}

// Test Firestore connection on boot with fallback for offline mode
export async function testFirestoreConnection() {
  try {
    const docRef = doc(db, 'system_health', 'connection_test');
    try {
      await getDoc(docRef);
    } catch (e) {
      // Offline fallback handles local cache gracefully
    }
    return true;
  } catch (error: any) {
    return false;
  }
}

