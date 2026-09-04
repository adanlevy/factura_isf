import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AuditLogEntry, AuditLogChange, AuditLogAction, AuditLogEntityType } from '../types';
import { sanitizeForFirestore } from './cloudSync';

export const AUDIT_LOGS_COLLECTION = 'audit_logs';

/**
 * Computes deep human-readable field-level diffs between old and new state
 */
export function computeObjectDiff<T extends Record<string, any>>(
  oldObj: T | null | undefined,
  newObj: T | null | undefined,
  fieldLabels: Record<string, string>,
  ignoredFields: string[] = ['id', 'createdAt', 'updatedAt', 'receiptImage', 'paymentProofImage', 'withholdingCertificateImage']
): AuditLogChange[] {
  if (!oldObj || !newObj) return [];
  const changes: AuditLogChange[] = [];

  const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));

  for (const key of allKeys) {
    if (ignoredFields.includes(key)) continue;

    const oldVal = oldObj[key];
    const newVal = newObj[key];

    // Check bank details specially
    if (key === 'bankDetails' && (oldVal || newVal)) {
      const oldBank = oldVal || {};
      const newBank = newVal || {};
      const bankKeys: Record<string, string> = {
        bankName: 'Banco',
        accountType: 'Tipo de Cuenta',
        cbuCvu: 'CBU / CVU',
        alias: 'Alias Bancario',
        accountHolder: 'Titular de Cuenta',
        cuitCuil: 'CUIT/CUIL Titular',
      };

      for (const [bKey, bLabel] of Object.entries(bankKeys)) {
        const oBVal = (oldBank[bKey] ?? '').toString().trim();
        const nBVal = (newBank[bKey] ?? '').toString().trim();
        if (oBVal !== nBVal) {
          changes.push({
            field: `bankDetails.${bKey}`,
            fieldLabel: `Datos Bancarios: ${bLabel}`,
            oldValue: oBVal || '(Vacío)',
            newValue: nBVal || '(Eliminado/Vacío)',
          });
        }
      }
      continue;
    }

    // Standard string/number/boolean normalization
    const normalizeVal = (val: any) => {
      if (val === undefined || val === null) return '';
      if (typeof val === 'boolean') return val ? 'Sí' : 'No';
      if (Array.isArray(val)) return val.join(', ');
      return String(val).trim();
    };

    const normOld = normalizeVal(oldVal);
    const normNew = normalizeVal(newVal);

    if (normOld !== normNew) {
      changes.push({
        field: key,
        fieldLabel: fieldLabels[key] || key,
        oldValue: normOld || '(Vacío)',
        newValue: normNew || '(Eliminado/Vacío)',
      });
    }
  }

  return changes;
}

const LOCAL_STORAGE_KEY = 'isf_audit_logs_cache_v1';

function getLocalAuditLogsCache(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalAuditLogsCache(logs: AuditLogEntry[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs.slice(0, 1000)));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Persists an audit log entry with multi-layer resilience (Server JSON, LocalStorage, and Cloud Firestore)
 */
export async function logAuditEvent(entry: {
  userEmail?: string;
  userName?: string;
  action: AuditLogAction;
  actionLabel: string;
  entityType: AuditLogEntityType;
  entityId: string;
  entityName: string;
  summary: string;
  changes?: AuditLogChange[];
  metadata?: Record<string, any>;
}): Promise<AuditLogEntry | null> {
  const timestamp = new Date().toISOString();
  const logId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const fullEntry: AuditLogEntry = {
    id: logId,
    timestamp,
    userEmail: (entry.userEmail || 'admin@isf-argentina.org').toLowerCase().trim(),
    userName: entry.userName || (entry.userEmail ? entry.userEmail.split('@')[0] : 'Sistema / Admin'),
    action: entry.action,
    actionLabel: entry.actionLabel,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityName: entry.entityName,
    summary: entry.summary,
    changes: entry.changes && entry.changes.length > 0 ? entry.changes : undefined,
    metadata: entry.metadata,
  };

  // 1. Immediately record in local storage cache
  try {
    const cached = getLocalAuditLogsCache();
    const updatedCache = [fullEntry, ...cached.filter((l) => l.id !== fullEntry.id)].slice(0, 1000);
    saveLocalAuditLogsCache(updatedCache);
  } catch {
    // Safe fallback
  }

  // 2. Persist to server backend (guaranteed persistence)
  try {
    fetch('/api/data/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullEntry),
    }).catch((e) => console.warn('[AuditLogger] Server sync note:', e));
  } catch (err) {
    console.warn('[AuditLogger] Error posting to server:', err);
  }

  // 3. Attempt cloud Firestore write (non-blocking)
  try {
    const docRef = doc(db, AUDIT_LOGS_COLLECTION, logId);
    setDoc(docRef, sanitizeForFirestore(fullEntry)).catch(() => {});
  } catch {
    // Non-blocking
  }

  return fullEntry;
}

/**
 * Fetches all audit logs, querying server backend, Firestore, and local cache
 */
export async function fetchCentralAuditLogs(maxCount = 250): Promise<AuditLogEntry[]> {
  const logMap = new Map<string, AuditLogEntry>();

  // 1. Load from local cache first for instant response
  getLocalAuditLogsCache().forEach((l) => {
    if (l && l.id) logMap.set(l.id, l);
  });

  // 2. Fetch from server backend
  try {
    const res = await fetch('/api/data/audit-logs');
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        json.data.forEach((l: AuditLogEntry) => {
          if (l && l.id) logMap.set(l.id, l);
        });
      }
    }
  } catch (e) {
    console.warn('[AuditLogger] Server fetch note:', e);
  }

  // 3. Attempt Firestore fetch
  try {
    const logsCol = collection(db, AUDIT_LOGS_COLLECTION);
    const snap = await getDocs(logsCol);
    snap.forEach((d) => {
      const data = d.data() as AuditLogEntry;
      if (data && data.id) logMap.set(data.id, data);
    });
  } catch {
    // Firestore might be in fallback mode
  }

  const sorted = Array.from(logMap.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, maxCount);

  saveLocalAuditLogsCache(sorted);
  return sorted;
}

/**
 * Real-time Subscription for audit logs (hybrid Server Poll + Firestore)
 */
export function subscribeToAuditLogs(
  onUpdate: (logs: AuditLogEntry[]) => void,
  maxCount = 250
): () => void {
  let isSubscribed = true;

  // Initial load
  fetchCentralAuditLogs(maxCount).then((logs) => {
    if (isSubscribed && logs.length > 0) {
      onUpdate(logs);
    }
  });

  // Periodic poll to server for real-time updates across multiple tabs/devices
  const pollInterval = setInterval(() => {
    if (!isSubscribed) return;
    fetchCentralAuditLogs(maxCount).then((logs) => {
      if (isSubscribed) {
        onUpdate(logs);
      }
    }).catch(() => {});
  }, 4000);

  // Also listen to Firestore live snapshot if available
  let unsubFirestore: (() => void) | null = null;
  try {
    unsubFirestore = onSnapshot(
      collection(db, AUDIT_LOGS_COLLECTION),
      (snap) => {
        if (!isSubscribed) return;
        const logs: AuditLogEntry[] = [];
        snap.forEach((d) => logs.push(d.data() as AuditLogEntry));
        if (logs.length > 0) {
          fetchCentralAuditLogs(maxCount).then((all) => {
            if (isSubscribed) onUpdate(all);
          });
        }
      },
      () => {}
    );
  } catch {
    // Non-blocking
  }

  return () => {
    isSubscribed = false;
    clearInterval(pollInterval);
    if (unsubFirestore) {
      unsubFirestore();
    }
  };
}

/**
 * Clears and initializes the audit log
 */
export async function clearCentralAuditLogs(user?: { email?: string; name?: string }): Promise<boolean> {
  try {
    saveLocalAuditLogsCache([]);

    // Clear server
    await fetch('/api/data/audit-logs/clear', { method: 'POST' }).catch(() => {});

    // Clear Firestore if accessible
    try {
      const logsCol = collection(db, AUDIT_LOGS_COLLECTION);
      const snap = await getDocs(logsCol);
      const batch = writeBatch(db);
      snap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    } catch {
      // Non-blocking
    }

    // Add initialization entry
    const email = user?.email || 'admin@isf-argentina.org';
    const name = user?.name || 'Administrador';

    await logAuditEvent({
      userEmail: email,
      userName: name,
      action: 'SYSTEM_CLEAR_LOGS',
      actionLabel: 'Auditoría Inicializada / Vaciada',
      entityType: 'system',
      entityId: 'audit-reset',
      entityName: 'Registro General de Auditoría',
      summary: `El historial de cambios fue inicializado y limpiado por ${name} (${email}).`,
    });

    return true;
  } catch (e) {
    console.error('[AuditLogger] Error clearing audit logs:', e);
    return false;
  }
}
