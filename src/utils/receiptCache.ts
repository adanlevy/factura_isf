/**
 * Local IndexedDB cache for high-resolution files (invoices, payment proofs, withholding certificates).
 * Keeps files in the browser session/local storage without storing raw binaries in Firestore (1MB limit).
 * The master source of truth for files in the cloud is Google Drive.
 */

const DB_NAME = 'factura_isf_files_db';
const DB_VERSION = 2;
const STORE_NAME = 'cached_files';

function openFilesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// In-memory fallback
const memoryCache = new Map<string, string>();

export async function cacheFile(key: string, dataUrl: string): Promise<void> {
  if (!key || !dataUrl) return;
  memoryCache.set(key, dataUrl);

  try {
    const db = await openFilesDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ id: key, dataUrl, savedAt: Date.now() });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[FileCache] IndexedDB store note:', e);
  }
}

export async function getCachedFile(key: string): Promise<string | null> {
  if (!key) return null;
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }

  try {
    const db = await openFilesDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    return new Promise((resolve) => {
      request.onsuccess = () => {
        if (request.result && request.result.dataUrl) {
          memoryCache.set(key, request.result.dataUrl);
          resolve(request.result.dataUrl);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

export async function removeCachedFile(key: string): Promise<void> {
  if (!key) return;
  memoryCache.delete(key);

  try {
    const db = await openFilesDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(key);
  } catch (e) {
    // ignore
  }
}

// Dedicated helpers
export const cacheReceiptFile = (expenseId: string, dataUrl: string) => cacheFile(expenseId, dataUrl);
export const getCachedReceiptFile = (expenseId: string) => getCachedFile(expenseId);

export const cachePaymentProofFile = (expenseId: string, dataUrl: string) =>
  cacheFile(`${expenseId}_payment_proof`, dataUrl);
export const getCachedPaymentProofFile = (expenseId: string) =>
  getCachedFile(`${expenseId}_payment_proof`);

export const cacheWithholdingCertificateFile = (expenseId: string, dataUrl: string) =>
  cacheFile(`${expenseId}_withholding_cert`, dataUrl);
export const getCachedWithholdingCertificateFile = (expenseId: string) =>
  getCachedFile(`${expenseId}_withholding_cert`);

export const removeAllExpenseCachedFiles = async (expenseId: string) => {
  await removeCachedFile(expenseId);
  await removeCachedFile(`${expenseId}_payment_proof`);
  await removeCachedFile(`${expenseId}_withholding_cert`);
};

export const removeCachedReceiptFile = removeCachedFile;

