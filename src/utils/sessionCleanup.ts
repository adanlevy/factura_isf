import { terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { clearAllCachedFiles } from './receiptCache';

// Configuración del dispositivo que no son datos de nadie (se conserva)
const KEEP_LOCAL_KEYS = new Set(['isf_custom_google_client_id']);

/**
 * Al cerrar sesión se borra todo lo que la app guardó en este navegador: comprobantes y archivos
 * cacheados, usuarios, auditoría, datos bancarios del perfil y la caché local de Firestore.
 * Importante en computadoras compartidas. Después hay que recargar la página.
 */
export async function clearLocalSessionData(): Promise<void> {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('isf_') || key.startsWith('factura_isf')) && !KEEP_LOCAL_KEYS.has(key)) keys.push(key);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // almacenamiento no disponible
  }
  try {
    sessionStorage.clear();
  } catch {
    // almacenamiento no disponible
  }
  await clearAllCachedFiles().catch(() => {});
  // La caché persistente de Firestore guarda copias de los documentos leídos
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (err) {
    console.warn('[Logout] No se pudo limpiar la caché local de Firestore:', err);
  }
}
