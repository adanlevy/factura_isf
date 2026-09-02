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

/**
 * Persists an audit log entry in Firestore
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
  try {
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

    const docRef = doc(db, AUDIT_LOGS_COLLECTION, logId);
    await setDoc(docRef, sanitizeForFirestore(fullEntry));

    // Optional server backend notification for mirror archiving
    fetch('/api/data/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullEntry),
    }).catch(() => {});

    return fullEntry;
  } catch (err) {
    console.warn('[AuditLogger] Could not record audit log:', err);
    return null;
  }
}

/**
 * Fetches all audit logs from Firestore, ordered newest first
 */
export async function fetchCentralAuditLogs(maxCount = 250): Promise<AuditLogEntry[]> {
  try {
    const logsCol = collection(db, AUDIT_LOGS_COLLECTION);
    const snap = await getDocs(logsCol);
    const logs: AuditLogEntry[] = [];
    snap.forEach((d) => logs.push(d.data() as AuditLogEntry));

    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, maxCount);
  } catch (e) {
    console.warn('[AuditLogger] Error fetching audit logs:', e);
    return [];
  }
}

/**
 * Real-time Firestore Subscription for audit logs
 */
export function subscribeToAuditLogs(
  onUpdate: (logs: AuditLogEntry[]) => void,
  maxCount = 250
): () => void {
  return onSnapshot(
    collection(db, AUDIT_LOGS_COLLECTION),
    (snap) => {
      const logs: AuditLogEntry[] = [];
      snap.forEach((d) => logs.push(d.data() as AuditLogEntry));
      const sorted = logs
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, maxCount);
      onUpdate(sorted);
    },
    (err) => console.warn('[AuditLogger Live] listener note:', err.message)
  );
}

/**
 * Clears and initializes the audit log in Firestore
 */
export async function clearCentralAuditLogs(user?: { email?: string; name?: string }): Promise<boolean> {
  try {
    const logsCol = collection(db, AUDIT_LOGS_COLLECTION);
    const snap = await getDocs(logsCol);

    const batch = writeBatch(db);
    snap.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();

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
