import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { AiOcrSettings, DEFAULT_AI_OCR_SETTINGS, normalizeAiOcrSettings } from './aiModels';
import { sanitizeForFirestore } from './cloudSync';

/**
 * Motor de IA para leer comprobantes (app_settings/ai): lo elige Administración en Sistema.
 * Se guarda en memoria para que la carga de comprobantes y de constancias lo envíen en cada lectura.
 */
const AI_SETTINGS_DOC = doc(db, 'app_settings', 'ai');

let currentAiSettings: AiOcrSettings = DEFAULT_AI_OCR_SETTINGS;

export function getAiOcrSettings(): AiOcrSettings {
  return currentAiSettings;
}

/** Datos que se agregan al pedido de lectura: el servidor los valida y, si Claude falla, usa Gemini */
export function getOcrRequestOptions(): { aiProvider: string; aiModel: string } {
  return { aiProvider: currentAiSettings.ocrProvider, aiModel: currentAiSettings.claudeModel };
}

export function subscribeToAiOcrSettings(onUpdate?: (settings: AiOcrSettings) => void): () => void {
  return onSnapshot(
    AI_SETTINGS_DOC,
    (snap) => {
      currentAiSettings = normalizeAiOcrSettings(snap.exists() ? (snap.data() as Partial<AiOcrSettings>) : null);
      onUpdate?.(currentAiSettings);
    },
    (err) => console.warn('[Firestore Live] motor de IA:', err.message)
  );
}

/** Guarda el motor de IA. Solo administradores (lo validan las reglas de app_settings). */
export async function saveAiOcrSettings(settings: AiOcrSettings): Promise<{ ok: boolean; error?: string }> {
  try {
    const normalized = normalizeAiOcrSettings(settings);
    await setDoc(
      AI_SETTINGS_DOC,
      sanitizeForFirestore({
        ocrProvider: normalized.ocrProvider,
        claudeModel: normalized.claudeModel,
        updatedAt: new Date().toISOString(),
        updatedBy: (auth.currentUser?.email || '').toLowerCase().trim() || null,
      })
    );
    currentAiSettings = normalized;
    return { ok: true };
  } catch (e: any) {
    console.warn('[Firestore] No se pudo guardar el motor de IA:', e);
    return {
      ok: false,
      error: e?.code === 'permission-denied' ? 'Solo un administrador puede cambiar el motor de IA.' : 'No se pudo guardar (sin conexión).',
    };
  }
}
