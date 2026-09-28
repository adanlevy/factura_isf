/**
 * Cloud Sync Service with Firebase Firestore
 * Provides direct real-time cloud persistence across all mobile and desktop devices
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  deleteField,
  updateDoc,
  writeBatch,
  onSnapshot,
  getDoc,
  getDocFromServer,
  query,
  where,
  orderBy,
  limit,
  QueryConstraint,
  QuerySnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db, auth, testFirestoreConnection } from '../lib/firebase';
import { Expense, Vendor, CostCenter, AppUserRecord, DriveSettings } from '../types';
import { DEFAULT_CATEGORIES, DEFAULT_COST_CENTERS_DATA, DEFAULT_VENDORS } from '../data/initialData';
import { cacheReceiptFile, cachePaymentProofFile, cacheWithholdingCertificateFile } from './receiptCache';
import { sanitizeCostCenter } from './helpers';
import { authFetch } from './authFetch';

// No hay usuarios fijos en el código: la tabla de usuarios (Firestore app_users) es la única fuente.

const USERS_CACHE_KEY = 'isf_app_users_cache_v2';
const DELETED_USERS_KEY = 'isf_deleted_user_emails_v1';

export function getDeletedUsersSet(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_USERS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map((e) => String(e).toLowerCase().trim()));
      }
    }
  } catch (_) {}
  return new Set<string>();
}

export function markUserAsDeleted(email: string): void {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();
  const set = getDeletedUsersSet();
  set.add(cleanEmail);
  try {
    localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(Array.from(set)));
  } catch (_) {}
}

export function unmarkUserAsDeleted(email: string): void {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();
  const set = getDeletedUsersSet();
  set.delete(cleanEmail);
  try {
    localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(Array.from(set)));
  } catch (_) {}
}

export function isUserDeletedLocally(email: string): boolean {
  if (!email) return false;
  return getDeletedUsersSet().has(email.toLowerCase().trim());
}

export function deduplicateUsers(users: AppUserRecord[]): AppUserRecord[] {
  if (!Array.isArray(users)) return [];
  const map = new Map<string, AppUserRecord>();
  const deleted = getDeletedUsersSet();
  for (const u of users) {
    if (u && u.email) {
      const emailClean = u.email.toLowerCase().trim();
      if (!deleted.has(emailClean)) {
        const existing = map.get(emailClean);
        map.set(emailClean, existing ? { ...existing, ...u } : { ...u, email: emailClean });
      }
    }
  }
  return Array.from(map.values());
}

export function getLocalUsersCache(): AppUserRecord[] {
  try {
    const raw = localStorage.getItem(USERS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return deduplicateUsers(parsed);
      }
    }
  } catch (_) {}
  return [];
}

export function saveLocalUsersCache(users: AppUserRecord[]): void {
  try {
    if (Array.isArray(users)) {
      const clean = deduplicateUsers(users);
      localStorage.setItem(USERS_CACHE_KEY, JSON.stringify(clean));
    }
  } catch (_) {}
}

export interface ExpenseQueryOptions {
  period?: '30days' | 'currentYear' | 'lastYear' | 'all' | string;
  costCenter?: string;
  limitCount?: number;
}

export interface SyncPayload {
  expenses: Expense[];
  vendors: Vendor[];
  costCenters: CostCenter[];
  categories: string[];
  hasMore?: boolean;
  removedExpenseIds?: string[];
}

export interface UserPreferencesPayload {
  favoriteCostCenters?: string[];
  categoryCostCenterPatterns?: Record<string, Record<string, number>>;
  lastSelectedCostCenter?: string;
  theme?: string;
}

// Persistent tombstone tracking of deleted expenses across sessions and browser tabs
// v3: solo contiene borrados confirmados. La v2 podía incluir comprobantes que solo salieron
// de la ventana de la query (falsos positivos), por eso se descarta.
const DELETED_EXPENSES_STORAGE_KEY = 'isf_deleted_expense_ids_v3';
const LEGACY_DELETED_EXPENSES_STORAGE_KEYS = ['isf_deleted_expense_ids_v2'];
export const DELETED_EXPENSES_COLLECTION = 'deleted_expenses';
const sessionDeletedExpenseIds = new Set<string>();
export const sessionDeletedVendorIds = new Set<string>();

function initDeletedExpensesFromStorage() {
  try {
    LEGACY_DELETED_EXPENSES_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
    const raw = localStorage.getItem(DELETED_EXPENSES_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach((id) => {
          if (typeof id === 'string' && id.trim()) {
            sessionDeletedExpenseIds.add(id.trim());
          }
        });
      }
    }
  } catch {}
}
initDeletedExpensesFromStorage();

export function getDeletedExpensesSet(): Set<string> {
  initDeletedExpensesFromStorage();
  return sessionDeletedExpenseIds;
}

export function trackDeletedExpenseId(id: string) {
  if (!id || typeof id !== 'string') return;
  const cleanId = id.trim();
  if (!cleanId) return;
  sessionDeletedExpenseIds.add(cleanId);
  try {
    const arr = Array.from(sessionDeletedExpenseIds).slice(-3000);
    localStorage.setItem(DELETED_EXPENSES_STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

export function clearDeletedExpenseId(id: string) {
  if (!id) return;
  sessionDeletedExpenseIds.delete(id.trim());
  try {
    const arr = Array.from(sessionDeletedExpenseIds);
    localStorage.setItem(DELETED_EXPENSES_STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

export function isExpenseDeletedInSession(id: string): boolean {
  return getDeletedExpensesSet().has(id?.trim?.() || id);
}

export function trackDeletedVendorId(id: string) {
  if (!id) return;
  sessionDeletedVendorIds.add(id.trim());
}

// Helper to remove undefined fields which Firestore rejects
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    const clean: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        clean[key] = sanitizeForFirestore(value);
      }
    }
    return clean as T;
  }
  return data;
}

/**
 * Prepares an expense for Firestore:
 * Strictly saves data & metadata only (vendor, amount, date, categories, Drive links, status, etc.)
 * Raw binary files (invoices, transfer proofs, withholding certs) are stored in Google Drive and cached locally in IndexedDB, NEVER in Firestore.
 */
export function prepareExpenseForFirestore(expense: Expense): any {
  if (!expense || !expense.id) return expense;
  
  const item: any = { ...expense };

  // Cache files locally in IndexedDB for the current session if available
  if (item.receiptImage) {
    cacheReceiptFile(item.id, item.receiptImage).catch(() => {});
  }
  if (item.paymentProofImage) {
    cachePaymentProofFile(item.id, item.paymentProofImage).catch(() => {});
  }
  if (item.withholdingCertificateImage) {
    cacheWithholdingCertificateFile(item.id, item.withholdingCertificateImage).catch(() => {});
  }

  // Strictly strip raw base64/binary payloads from Firestore to keep DB pure data & light (< 2KB per doc)
  delete item.receiptImage;
  delete item.paymentProofImage;
  delete item.withholdingCertificateImage;
  delete item.audioRecordingUrl;

  // Defensive boundary guard: remove any large data URLs or oversized binary strings from any field
  for (const key of Object.keys(item)) {
    const val = item[key];
    if (typeof val === 'string' && (val.startsWith('data:') || val.length > 5000)) {
      delete item[key];
    }
  }

  // Explicitly set bankDetails to null if missing or without valid account fields so Firestore merge clears it
  const b = item.bankDetails;
  if (
    !b ||
    (!b.cbuCvu?.trim() &&
      !b.alias?.trim() &&
      !b.bankName?.trim() &&
      !b.accountHolder?.trim() &&
      !b.cuitCuil?.trim())
  ) {
    item.bankDetails = null;
  }

  return sanitizeForFirestore(item);
}

/**
 * Robust non-destructive merge of local and cloud expenses with timestamp conflict resolution.
 * If local state has a newer modification (e.g. freshly marked as reimbursed or withholding cert attached),
 * it is never reverted by older/in-flight incoming snapshots.
 */
export function mergeExpensesList(local: Expense[], incoming: Expense[]): Expense[] {
  const map = new Map<string, Expense>();
  const deletedSet = getDeletedExpensesSet();

  // Helper to extract highest modification timestamp
  const getTimestamp = (exp: Expense): number => {
    const dates = [
      exp.updatedAt,
      exp.paymentConfirmedAt,
      exp.withholdingCertificateUploadedAt,
      exp.reimbursedAt,
      exp.createdAt,
      exp.date,
    ];
    let max = 0;
    for (const d of dates) {
      if (d) {
        const t = new Date(d).getTime();
        if (!isNaN(t) && t > max) max = t;
      }
    }
    return max;
  };

  // 1. Populate map with local expenses (strictly excluding any tombstoned / deleted IDs)
  if (Array.isArray(local)) {
    for (const exp of local) {
      if (exp && exp.id && !deletedSet.has(exp.id)) {
        const b = exp.bankDetails;
        const hasBank = Boolean(
          b &&
            (b.cbuCvu?.trim() ||
              b.alias?.trim() ||
              b.bankName?.trim() ||
              b.accountHolder?.trim() ||
              b.cuitCuil?.trim())
        );
        map.set(exp.id, hasBank ? exp : { ...exp, bankDetails: undefined });
      }
    }
  }

  // 2. Incoming cloud expenses: merge respecting latest timestamps & strictly excluding deleted
  if (Array.isArray(incoming)) {
    for (const cloudExp of incoming) {
      if (cloudExp && cloudExp.id && !deletedSet.has(cloudExp.id)) {
        const cloudB = cloudExp.bankDetails;
        const hasCloudBank = Boolean(
          cloudB &&
            (cloudB.cbuCvu?.trim() ||
              cloudB.alias?.trim() ||
              cloudB.bankName?.trim() ||
              cloudB.accountHolder?.trim() ||
              cloudB.cuitCuil?.trim())
        );
        const sanitizedCloudExp = hasCloudBank
          ? cloudExp
          : { ...cloudExp, bankDetails: undefined };

        const localExp = map.get(cloudExp.id);
        if (!localExp) {
          map.set(cloudExp.id, sanitizedCloudExp);
        } else {
          const localTime = getTimestamp(localExp);
          const cloudTime = getTimestamp(cloudExp);

          const localB = localExp.bankDetails;
          const hasLocalBank = Boolean(
            localB &&
              (localB.cbuCvu?.trim() ||
                localB.alias?.trim() ||
                localB.bankName?.trim() ||
                localB.accountHolder?.trim() ||
                localB.cuitCuil?.trim())
          );

          if (localTime > cloudTime) {
            // Local state is more recent: preserve local changes (like new payment status, notes, etc.)
            map.set(cloudExp.id, {
              ...sanitizedCloudExp,
              ...localExp,
              bankDetails: hasLocalBank ? localExp.bankDetails : undefined,
              // Si la copia local quitó el campo a propósito (p. ej. al revertir un pago), no se recupera de la nube
              driveUploadedUrl: 'driveUploadedUrl' in localExp ? localExp.driveUploadedUrl : cloudExp.driveUploadedUrl,
              driveUploadedFileName: 'driveUploadedFileName' in localExp ? localExp.driveUploadedFileName : cloudExp.driveUploadedFileName,
              paymentProofDriveUrl: 'paymentProofDriveUrl' in localExp ? localExp.paymentProofDriveUrl : cloudExp.paymentProofDriveUrl,
              withholdingCertificateDriveUrl:
                'withholdingCertificateDriveUrl' in localExp ? localExp.withholdingCertificateDriveUrl : cloudExp.withholdingCertificateDriveUrl,
              receiptImage: localExp.receiptImage || cloudExp.receiptImage,
              paymentProofImage: localExp.paymentProofImage || cloudExp.paymentProofImage,
              withholdingCertificateImage: localExp.withholdingCertificateImage || cloudExp.withholdingCertificateImage,
              audioRecordingUrl: localExp.audioRecordingUrl || cloudExp.audioRecordingUrl,
            });
          } else {
            // La nube es más nueva o igual: se parte del documento de la nube (así un campo que otra
            // persona borró no reaparece desde la copia local) y solo se conservan los archivos locales
            map.set(cloudExp.id, {
              ...sanitizedCloudExp,
              bankDetails: hasCloudBank ? cloudExp.bankDetails : undefined,
              receiptImage: localExp.receiptImage || cloudExp.receiptImage,
              paymentProofImage: localExp.paymentProofImage || cloudExp.paymentProofImage,
              withholdingCertificateImage: localExp.withholdingCertificateImage || cloudExp.withholdingCertificateImage,
              audioRecordingUrl: localExp.audioRecordingUrl || cloudExp.audioRecordingUrl,
            });
          }
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.createdAt || a.date || 0).getTime();
    const timeB = new Date(b.createdAt || b.date || 0).getTime();
    return timeB - timeA;
  });
}

/**
 * Normalizes vendor bank details safely:
 * - Preserves explicitly specified accountType (Cuenta Corriente / Caja de Ahorro / Indefinido).
 * - Preserves explicitly set bankName.
 * - Detects and cleans placeholder strings like "NO_ALIAS", "NO_TIENE", "N/A", "null".
 * - Detects 22-digit numeric CBU and extracts correctly.
 */
export function normalizeVendorBankDetails(vendor: Vendor): Vendor {
  if (!vendor) return vendor;

  const sampleIds = ['ven-1', 'ven-2', 'ven-3', 'ven-4', 'ven-5'];
  if (sampleIds.includes(vendor.id)) return vendor;

  const bankDetails = vendor.bankDetails ? { ...vendor.bankDetails } : undefined;
  if (!bankDetails) return vendor;

  const invalidPlaceholders = /^(no_alias|no alias|no_tiene|no tiene|n\/a|na|null|none|sin alias|undefined|sin_alias|no posee|s\/d|sd|-|—)$/i;

  let rawCbu = (bankDetails.cbuCvu || '').trim();
  let rawAlias = (bankDetails.alias || '').trim();
  let bankName = (bankDetails.bankName || '').trim();
  let accountType = (bankDetails.accountType || '').trim();

  // Clean placeholders
  if (invalidPlaceholders.test(rawAlias)) {
    rawAlias = '';
  }
  if (invalidPlaceholders.test(rawCbu)) {
    rawCbu = '';
  }
  if (invalidPlaceholders.test(bankName)) {
    bankName = '';
  }

  // Preserve valid existing accountType if specified
  const isCajaDeAhorro = /^(caja de ahorro|caja de ahorros|ca|c\.a\.|c\/a)$/i.test(accountType);
  const isCuentaCorriente = /^(cuenta corriente|cc|c\.c\.|c\/c|cta cte|cta\. cte\.|cta corriente)$/i.test(accountType);

  if (isCajaDeAhorro) {
    accountType = 'Caja de Ahorro';
  } else if (isCuentaCorriente) {
    accountType = 'Cuenta Corriente';
  } else if (!accountType || accountType === 'Indefinido') {
    // Check if CBU string has prefix like "CA" or "CC"
    const upperCbu = rawCbu.toUpperCase();
    const hasCA = /\b(CA|C\.A\.|C\/A)\b/i.test(upperCbu) || upperCbu.startsWith('CA') || upperCbu.startsWith('C.A.') || upperCbu.includes('CAJA');
    const hasCC = /\b(CC|C\.C\.|C\/C|CTA\s*CTE|CTA\.\s*CTE\.)\b/i.test(upperCbu) || upperCbu.startsWith('CC') || upperCbu.startsWith('C.C.') || upperCbu.includes('CORRIENTE');

    if (hasCA) {
      accountType = 'Caja de Ahorro';
      rawCbu = rawCbu.replace(/\b(CA|C\.A\.|CAJA(\s+DE\s+AHORRO)?)\b/gi, '').replace(/^CA[:\s\-]*/i, '').trim();
    } else if (hasCC) {
      accountType = 'Cuenta Corriente';
      rawCbu = rawCbu.replace(/\b(CC|C\.C\.|CUENTA(\s+CORRIENTE)?)\b/gi, '').replace(/^CC[:\s\-]*/i, '').trim();
    } else {
      accountType = 'Indefinido';
    }
  }

  // Detect Alias in CBU field or separate numeric digits
  if (rawCbu) {
    const cleanedDigits = rawCbu.replace(/\D/g, '');
    const containsLetters = /[a-zA-Z]/.test(rawCbu);
    const containsDots = rawCbu.includes('.');

    if (cleanedDigits.length === 22) {
      rawCbu = cleanedDigits;
    } else if (containsLetters || containsDots) {
      if (!rawAlias) {
        rawAlias = rawCbu;
      }
      rawCbu = '';
    }
  }

  const normalizedCuit = (vendor.cuit || bankDetails.cuitCuil || '').trim();

  return {
    ...vendor,
    cuit: normalizedCuit,
    bankDetails: {
      ...bankDetails,
      bankName: bankName,
      accountType,
      currency: bankDetails.currency || '$Ar',
      cbuCvu: rawCbu,
      alias: rawAlias,
      cuitCuil: normalizedCuit,
      accountHolder: bankDetails.accountHolder || vendor.name || '',
    },
  };
}

export function mergeVendorsList(local: Vendor[], incoming: Vendor[]): Vendor[] {
  const map = new Map<string, Vendor>();
  if (Array.isArray(local)) {
    for (const v of local) {
      if (v && v.id && !sessionDeletedVendorIds.has(v.id)) {
        map.set(v.id, normalizeVendorBankDetails(v));
      }
    }
  }
  if (Array.isArray(incoming)) {
    for (const v of incoming) {
      if (v && v.id && !sessionDeletedVendorIds.has(v.id)) {
        const localV = map.get(v.id);
        const norm = normalizeVendorBankDetails(v);
        map.set(v.id, localV ? { ...localV, ...norm } : norm);
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Builds an optimized Firestore query for expenses based on period, cost center, and limit constraints.
 */
export function buildExpensesFirestoreQuery(options?: ExpenseQueryOptions) {
  const expensesCol = collection(db, 'expenses');
  const constraints: QueryConstraint[] = [];
  const limitCount = options?.limitCount && options.limitCount > 0 ? options.limitCount : 50;

  // 1. Period filter (by ISO date 'YYYY-MM-DD')
  if (options?.period && options.period !== 'all') {
    if (options.period === '30days') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const minDateStr = thirtyDaysAgo.toISOString().slice(0, 10);
      constraints.push(where('date', '>=', minDateStr));
    } else if (options.period === 'currentYear') {
      const currYear = new Date().getFullYear();
      constraints.push(where('date', '>=', `${currYear}-01-01`));
    } else if (options.period === 'lastYear') {
      const prevYear = new Date().getFullYear() - 1;
      constraints.push(where('date', '>=', `${prevYear}-01-01`));
      constraints.push(where('date', '<=', `${prevYear}-12-31`));
    } else if (/^\d{4}$/.test(options.period)) {
      constraints.push(where('date', '>=', `${options.period}-01-01`));
      constraints.push(where('date', '<=', `${options.period}-12-31`));
    }
  }

  // 2. Cost Center filter (project field)
  if (options?.costCenter && options.costCenter !== 'ALL') {
    constraints.push(where('project', '==', options.costCenter));
  }

  // 3. Order by document date descending
  constraints.push(orderBy('date', 'desc'));

  // 4. Limit to avoid loading entire databases into memory
  constraints.push(limit(limitCount));

  return query(expensesCol, ...constraints);
}

/**
 * Fetches expenses with server-side query filtering and pagination.
 */
export async function fetchExpensesPage(options?: ExpenseQueryOptions): Promise<{ expenses: Expense[]; hasMore: boolean }> {
  try {
    const q = buildExpensesFirestoreQuery(options);
    const snap = await getDocs(q);
    const expenses: Expense[] = [];
    snap.forEach((d) => expenses.push(d.data() as Expense));
    const limitCount = options?.limitCount && options.limitCount > 0 ? options.limitCount : 50;
    return {
      expenses,
      hasMore: snap.size >= limitCount,
    };
  } catch (err) {
    console.warn('[Firestore] Query with constraints failed, trying fallback query:', err);
    try {
      const fallbackLimit = options?.limitCount || 50;
      const fallbackQuery = query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(fallbackLimit));
      const snap = await getDocs(fallbackQuery);
      const expenses: Expense[] = [];
      snap.forEach((d) => expenses.push(d.data() as Expense));
      return { expenses, hasMore: snap.size >= fallbackLimit };
    } catch (fallbackErr) {
      console.error('[Firestore] Fallback query failed:', fallbackErr);
      return { expenses: [], hasMore: false };
    }
  }
}

/**
 * Fetches collections from Firestore using query-level filters for expenses,
 * with fallback to backend API and initial seeding if empty.
 */
export async function fetchCentralSync(options?: ExpenseQueryOptions): Promise<SyncPayload | null> {
  try {
    // 1. Read expenses using query-level filtering (period, cost center, limit)
    const expensesQuery = buildExpensesFirestoreQuery(options);
    const vendorsCol = collection(db, 'vendors');
    const costCentersCol = collection(db, 'cost_centers');
    const categoriesCol = collection(db, 'categories');

    let expensesSnap;
    try {
      expensesSnap = await getDocs(expensesQuery);
    } catch (queryErr) {
      console.warn('[Firestore] Filtered query note, falling back to ordered limit:', queryErr);
      const safeLimit = options?.limitCount || 50;
      expensesSnap = await getDocs(query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(safeLimit)));
    }

    const [vendorsSnap, costCentersSnap, categoriesSnap] = await Promise.all([
      getDocs(vendorsCol),
      getDocs(costCentersCol),
      getDocs(categoriesCol),
    ]);

    const expenses: Expense[] = [];
    expensesSnap.forEach((d) => expenses.push(d.data() as Expense));
    const limitCount = options?.limitCount || 50;
    const hasMore = expensesSnap.size >= limitCount;

    let vendors: Vendor[] = [];
    vendorsSnap.forEach((d) => vendors.push(normalizeVendorBankDetails(d.data() as Vendor)));

    let costCenters: CostCenter[] = [];
    let hadDirtyCostCenters = false;
    costCentersSnap.forEach((d) => {
      const raw = d.data() as CostCenter;
      const sanitized = sanitizeCostCenter(raw);
      if (raw.name !== sanitized.name || raw.driveFolder !== sanitized.driveFolder || raw.driveUrl !== sanitized.driveUrl) {
        hadDirtyCostCenters = true;
      }
      costCenters.push(sanitized);
    });

    let categories: string[] = [];
    categoriesSnap.forEach((d) => {
      const data = d.data();
      if (data.name) categories.push(data.name);
      else if (Array.isArray(data.items)) categories.push(...data.items);
    });

    // Seed defaults in Firestore if empty (only cost centers & categories if needed)
    if (costCenters.length === 0 && DEFAULT_COST_CENTERS_DATA.length > 0) {
      costCenters = DEFAULT_COST_CENTERS_DATA.map(sanitizeCostCenter);
      saveCentralCostCenters(costCenters).catch(console.warn);
    } else if (hadDirtyCostCenters) {
      saveCentralCostCenters(costCenters).catch(console.warn);
    }
    if (categories.length === 0 && DEFAULT_CATEGORIES.length > 0) {
      categories = DEFAULT_CATEGORIES;
      saveCentralCategories(DEFAULT_CATEGORIES).catch(console.warn);
    }

    return {
      expenses,
      vendors,
      costCenters,
      categories,
      hasMore,
    };
  } catch (firestoreErr) {
    console.warn('[Firestore] Sync direct read note:', firestoreErr);
    
    // Fallback to server JSON sync
    try {
      const queryParams = new URLSearchParams();
      if (options?.period) queryParams.set('period', options.period);
      if (options?.costCenter) queryParams.set('costCenter', options.costCenter);
      if (options?.limitCount) queryParams.set('limit', String(options.limitCount));
      const url = `/api/data/sync${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          return data.data;
        }
      }
    } catch (apiErr) {
      console.warn('[Sync] Fallback API sync note:', apiErr);
    }
  }
  return null;
}

/**
 * Firestore emite 'removed' tanto cuando un comprobante se borra como cuando solo sale de la
 * ventana de la query (limit de paginación, filtro de período o de centro de costos). Solo un
 * documento que ya no existe en el servidor es un borrado real; el resto no se toca.
 */
async function confirmServerDeletedExpenseIds(ids: string[]): Promise<string[]> {
  const confirmed: string[] = [];
  await Promise.all(
    ids.map(async (id) => {
      try {
        const snap = await getDocFromServer(doc(db, 'expenses', id));
        if (!snap.exists()) confirmed.push(id);
      } catch {
        // Sin conexión o sin permisos: no se asume borrado
      }
    })
  );
  return confirmed;
}

type RealtimeUpdate = Partial<SyncPayload> & { hasMore?: boolean };

function handleExpensesSnapshot(
  snap: QuerySnapshot<DocumentData>,
  currentLimit: number,
  onUpdate: (payload: RealtimeUpdate) => void
) {
  const removedCandidates = snap
    .docChanges()
    .filter((change) => change.type === 'removed' && change.doc.id)
    .map((change) => change.doc.id);

  const deletedSet = getDeletedExpensesSet();
  const expenses: Expense[] = [];
  snap.forEach((d) => {
    if (d.id && !deletedSet.has(d.id)) {
      expenses.push(d.data() as Expense);
    }
  });
  onUpdate({ expenses, hasMore: snap.size >= currentLimit });

  if (removedCandidates.length > 0) {
    confirmServerDeletedExpenseIds(removedCandidates).then((confirmed) => {
      if (confirmed.length === 0) return;
      confirmed.forEach((id) => trackDeletedExpenseId(id));
      onUpdate({ removedExpenseIds: confirmed });
    });
  }
}

/**
 * Real-time Firestore Subscriptions with query-level filtering and pagination support.
 */
export function subscribeToRealtimeFirestore(
  onUpdate: (payload: Partial<SyncPayload> & { hasMore?: boolean }) => void,
  options?: ExpenseQueryOptions
): () => void {
  const currentLimit = options?.limitCount && options.limitCount > 0 ? options.limitCount : 50;
  let expensesQuery;
  try {
    expensesQuery = buildExpensesFirestoreQuery(options);
  } catch {
    expensesQuery = query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(currentLimit));
  }

  let unsubFallbackExpenses: (() => void) | null = null;

  const unsubExpenses = onSnapshot(
    expensesQuery,
    (snap) => handleExpensesSnapshot(snap, currentLimit, onUpdate),
    (err) => {
      console.warn('[Firestore Live] expenses listener note:', err.message);
      if (err.code !== 'permission-denied') {
        try {
          const fallbackQuery = query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(currentLimit));
          unsubFallbackExpenses = onSnapshot(
            fallbackQuery,
            (fallbackSnap) => handleExpensesSnapshot(fallbackSnap, currentLimit, onUpdate),
            (fallbackErr) => {
              console.warn('[Firestore Live] fallback expenses listener note:', fallbackErr.message);
            }
          );
        } catch {}
      }
    }
  );

  const unsubVendors = onSnapshot(
    collection(db, 'vendors'),
    (snap) => {
      const vendors: Vendor[] = [];
      snap.forEach((d) => vendors.push(normalizeVendorBankDetails(d.data() as Vendor)));
      onUpdate({ vendors });
    },
    (err) => console.warn('[Firestore Live] vendors listener note:', err.message)
  );

  const unsubCostCenters = onSnapshot(
    collection(db, 'cost_centers'),
    (snap) => {
      const costCenters: CostCenter[] = [];
      snap.forEach((d) => costCenters.push(sanitizeCostCenter(d.data() as CostCenter)));
      if (costCenters.length > 0) {
        onUpdate({ costCenters });
      }
    },
    (err) => console.warn('[Firestore Live] cost_centers listener note:', err.message)
  );

  return () => {
    unsubExpenses();
    if (unsubFallbackExpenses) {
      unsubFallbackExpenses();
    }
    unsubVendors();
    unsubCostCenters();
  };
}

// Firestore limita a 20 lecturas de reglas (get/exists) por batch; con lotes chicos cada
// escritura queda holgada incluso con el chequeo de tombstone y de rol.
const EXPENSE_WRITE_CHUNK = 15;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Nunca reescribe comprobantes borrados: una escritura tardía (p. ej. el callback de la subida a
 * Drive o un modal abierto con una copia vieja) no debe resucitarlos. Las reglas de Firestore lo
 * bloquean igualmente para todos los dispositivos mediante el tombstone en `deleted_expenses`.
 */
function withoutDeletedExpenses(items: Expense[]): Expense[] {
  const deletedSet = getDeletedExpensesSet();
  return (items || []).filter((item) => {
    if (!item || !item.id) return false;
    if (deletedSet.has(item.id)) {
      console.info(`[Firestore] Se omite la escritura del comprobante borrado ${item.id}.`);
      return false;
    }
    return true;
  });
}

// Datos de pago que se borran del documento al revertir un pago. Con set(merge) un campo
// ausente no se borra, así que hay que pedirlo explícitamente con deleteField().
const PAYMENT_RESET_FIELDS = [
  'reimbursedAt',
  'paymentConfirmedAt',
  'paymentProofFileName',
  'paymentProofDriveUrl',
  'paymentProofAt',
  'withholdingCertificateFileName',
  'withholdingCertificateUploadedAt',
  'withholdingCertificateDriveUrl',
  'withholdingCertificateSentAt',
] as const;

function buildExpenseWrite(item: Expense, clearPaymentFields: boolean): any {
  const data = prepareExpenseForFirestore(item);
  if (clearPaymentFields) {
    for (const field of PAYMENT_RESET_FIELDS) {
      if (data[field] === undefined) data[field] = deleteField();
    }
  }
  return data;
}

async function writeExpensesToFirestore(items: Expense[], clearPaymentFields = false): Promise<boolean> {
  return (await writeExpensesToFirestoreDetailed(items, clearPaymentFields)).length === 0;
}

// Devuelve los IDs que no se pudieron guardar (p. ej. rechazados por las reglas)
async function writeExpensesToFirestoreDetailed(items: Expense[], clearPaymentFields = false): Promise<string[]> {
  const failedIds: string[] = [];
  for (const chunk of chunkArray(items, EXPENSE_WRITE_CHUNK)) {
    try {
      const batch = writeBatch(db);
      for (const item of chunk) {
        batch.set(doc(db, 'expenses', item.id), buildExpenseWrite(item, clearPaymentFields), { merge: true });
      }
      await batch.commit();
    } catch (e) {
      console.warn('[Firestore] Error en batch de comprobantes, reintentando uno por uno:', e);
      for (const item of chunk) {
        try {
          await setDoc(doc(db, 'expenses', item.id), buildExpenseWrite(item, clearPaymentFields), { merge: true });
        } catch (err) {
          console.error(`[Firestore] No se pudo guardar el comprobante ${item.id}:`, err);
          failedIds.push(item.id);
        }
      }
    }
  }
  return failedIds;
}

export async function saveCentralExpenses(expenses: Expense[]): Promise<boolean> {
  const items = withoutDeletedExpenses(expenses);
  if (items.length === 0) return true;
  const ok = await writeExpensesToFirestore(items);

  // Also notify server backend with lightweight metadata
  authFetch('/api/data/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expenses: items.map((e) => prepareExpenseForFirestore(e)) }),
  }).catch(() => {});

  return ok;
}

export async function upsertCentralExpenses(
  items: Expense[],
  options?: { clearPaymentFields?: boolean }
): Promise<boolean> {
  const valid = withoutDeletedExpenses(items);
  if (valid.length === 0) return true;

  // Mirror to server-side JSON store in parallel for dual persistence
  authFetch('/api/data/expenses/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: valid.map((i) => prepareExpenseForFirestore(i)) }),
  }).catch((err) => {
    console.warn('[Sync] Notice mirroring expenses to server store:', err);
  });

  return writeExpensesToFirestore(valid, Boolean(options?.clearPaymentFields));
}

/**
 * Un mismo comprobante de pago en Drive puede estar vinculado a varios comprobantes (pago en lote).
 * Devuelve true si algún comprobante fuera de `excludeIds` sigue usando ese archivo.
 * Si no se puede verificar (sin conexión, sin permisos) devuelve true: ante la duda no se borra.
 */
export async function isPaymentProofUsedByOtherExpenses(driveUrl: string, excludeIds: string[]): Promise<boolean> {
  try {
    const snap = await getDocs(query(collection(db, 'expenses'), where('paymentProofDriveUrl', '==', driveUrl)));
    return snap.docs.some((d) => !excludeIds.includes(d.id));
  } catch (err) {
    console.warn('[Firestore] No se pudo verificar si el comprobante de pago está compartido:', err);
    return true;
  }
}

// ==========================================
// Escrituras parciales de comprobantes
// ==========================================
// Escribir el comprobante completo (set con merge) desde una copia vieja pisa los cambios que otra
// persona hizo mientras tanto (p. ej. un pago registrado por otro Admin). Estas funciones escriben
// solo los campos que cambiaron, y borran de verdad los que se quitaron.

// Archivos binarios: viven en Drive y en la caché local, nunca en Firestore
const EXPENSE_LOCAL_ONLY_KEYS = new Set([
  'receiptImage',
  'paymentProofImage',
  'withholdingCertificateImage',
  'audioRecordingUrl',
]);

const stableStringify = (value: any): string => {
  if (value === undefined || value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

/** Campos que difieren entre dos versiones de un comprobante (valor undefined = quitar el campo). */
export function diffExpenseFields(before: Partial<Expense> | null | undefined, after: Partial<Expense>): Record<string, any> {
  const changes: Record<string, any> = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (key === 'id' || key === 'updatedAt' || EXPENSE_LOCAL_ONLY_KEYS.has(key)) continue;
    const a = (before as any)?.[key];
    const b = (after as any)?.[key];
    if (stableStringify(a) !== stableStringify(b)) changes[key] = b;
  }
  return changes;
}

/** Toma solo ciertos campos de un comprobante (para cambios de alcance conocido, p. ej. un pago). */
export function pickExpenseFields(item: Partial<Expense>, keys: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of keys) out[key] = (item as any)[key];
  return out;
}

export interface ExpensePatch {
  id: string;
  changes: Record<string, any>;
}

function buildPatchData(id: string, changes: Record<string, any>): Record<string, any> {
  const data: Record<string, any> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'id') continue;
    if (EXPENSE_LOCAL_ONLY_KEYS.has(key)) {
      // Los archivos se guardan solo en la caché local del dispositivo
      if (typeof value === 'string' && value) {
        if (key === 'receiptImage') cacheReceiptFile(id, value).catch(() => {});
        if (key === 'paymentProofImage') cachePaymentProofFile(id, value).catch(() => {});
        if (key === 'withholdingCertificateImage') cacheWithholdingCertificateFile(id, value).catch(() => {});
      }
      continue;
    }
    if (value === undefined) {
      data[key] = deleteField();
    } else if (typeof value === 'string' && value.startsWith('data:')) {
      continue; // nunca binarios embebidos en Firestore
    } else {
      data[key] = sanitizeForFirestore(value);
    }
  }
  if (Object.keys(data).length > 0 && !('updatedAt' in data)) {
    data.updatedAt = new Date().toISOString();
  }
  return data;
}

/**
 * Aplica cambios parciales a comprobantes existentes (update: si el comprobante ya no existe, falla
 * en lugar de crear un documento a medias). Devuelve qué IDs no se pudieron guardar.
 */
export async function patchCentralExpenses(
  patches: ExpensePatch[],
  options?: { mirror?: Expense[] }
): Promise<{ ok: boolean; failedIds: string[] }> {
  const deletedSet = getDeletedExpensesSet();
  const prepared = (patches || [])
    .filter((p) => p && p.id && !deletedSet.has(p.id))
    .map((p) => ({ id: p.id, data: buildPatchData(p.id, p.changes || {}) }))
    .filter((p) => Object.keys(p.data).length > 0);
  if (prepared.length === 0) return { ok: true, failedIds: [] };

  const failedIds: string[] = [];
  for (const chunk of chunkArray(prepared, EXPENSE_WRITE_CHUNK)) {
    try {
      const batch = writeBatch(db);
      for (const p of chunk) batch.update(doc(db, 'expenses', p.id), p.data);
      await batch.commit();
    } catch (e) {
      console.warn('[Firestore] Error en batch de cambios, reintentando uno por uno:', e);
      for (const p of chunk) {
        try {
          await updateDoc(doc(db, 'expenses', p.id), p.data);
        } catch (err) {
          console.error(`[Firestore] No se pudo guardar el cambio del comprobante ${p.id}:`, err);
          failedIds.push(p.id);
        }
      }
    }
  }

  if (options?.mirror && options.mirror.length > 0) {
    const okMirror = options.mirror.filter((e) => e && !failedIds.includes(e.id));
    if (okMirror.length > 0) {
      authFetch('/api/data/expenses/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: okMirror.map((i) => prepareExpenseForFirestore(i)) }),
      }).catch(() => {});
    }
  }

  return { ok: failedIds.length === 0, failedIds };
}

/** Guarda la diferencia entre la versión de partida y la editada de un comprobante. */
export async function saveExpenseChanges(before: Expense | null | undefined, after: Expense): Promise<boolean> {
  const changes = diffExpenseFields(before, after);
  if (Object.keys(changes).length === 0) return true;
  changes.updatedAt = after.updatedAt || new Date().toISOString();
  // Los archivos nuevos (si los hay) se cachean localmente
  for (const key of EXPENSE_LOCAL_ONLY_KEYS) {
    if ((after as any)[key] && (after as any)[key] !== (before as any)?.[key]) changes[key] = (after as any)[key];
  }
  const res = await patchCentralExpenses([{ id: after.id, changes }], { mirror: [after] });
  return res.ok;
}

/**
 * Renombra un centro de costos o una categoría en TODOS los comprobantes de la base
 * (no solo en los cargados en pantalla). Solo Admin.
 */
export async function renameExpenseFieldValue(
  field: 'project' | 'category',
  oldValue: string,
  newValue: string
): Promise<{ updated: number; failed: number }> {
  if (!oldValue || !newValue || oldValue === newValue) return { updated: 0, failed: 0 };
  const snap = await getDocs(query(collection(db, 'expenses'), where(field, '==', oldValue)));
  const patches = snap.docs.map((d) => ({ id: d.id, changes: { [field]: newValue } }));
  const res = await patchCentralExpenses(patches);
  return { updated: patches.length - res.failedIds.length, failed: res.failedIds.length };
}

/** Como upsertCentralExpenses, pero informa qué comprobantes no se pudieron guardar. */
export async function upsertCentralExpensesDetailed(items: Expense[]): Promise<{ ok: boolean; failedIds: string[] }> {
  const deletedSet = getDeletedExpensesSet();
  const valid = withoutDeletedExpenses(items);
  const skipped = (items || []).filter((i) => i?.id && deletedSet.has(i.id)).map((i) => i.id);
  if (valid.length === 0) return { ok: skipped.length === 0, failedIds: skipped };

  authFetch('/api/data/expenses/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: valid.map((i) => prepareExpenseForFirestore(i)) }),
  }).catch(() => {});

  const failedIds = [...skipped, ...(await writeExpensesToFirestoreDetailed(valid))];
  return { ok: failedIds.length === 0, failedIds };
}

export interface DeleteExpensesResult {
  deletedIds: string[];
  failedIds: string[];
}

// El tombstone se crea en el mismo batch que el borrado; las reglas validan ambos juntos.
// Lotes de 5 comprobantes (10 escrituras) para no superar el límite de accesos de reglas por batch.
const EXPENSE_DELETE_CHUNK = 5;

/**
 * Borra comprobantes de Firestore y deja un tombstone compartido en `deleted_expenses/{id}`.
 * Devuelve qué IDs se borraron realmente y cuáles fallaron (p. ej. sin permisos o sin conexión),
 * para que la UI no informe un borrado que no ocurrió.
 */
export async function deleteCentralExpenses(ids: string[]): Promise<DeleteExpensesResult> {
  const cleanIds = Array.from(
    new Set((ids || []).filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()))
  );
  const result: DeleteExpensesResult = { deletedIds: [], failedIds: [] };
  if (cleanIds.length === 0) return result;

  // Tombstone local optimista: evita que listeners o escrituras en curso lo vuelvan a mostrar
  cleanIds.forEach((id) => trackDeletedExpenseId(id));

  const deletedBy = (auth.currentUser?.email || '').toLowerCase().trim();
  const deletedAt = new Date().toISOString();
  const addToBatch = (batch: ReturnType<typeof writeBatch>, id: string) => {
    batch.delete(doc(db, 'expenses', id));
    batch.set(doc(db, DELETED_EXPENSES_COLLECTION, id), { id, deletedAt, deletedBy });
  };

  for (const chunk of chunkArray(cleanIds, EXPENSE_DELETE_CHUNK)) {
    try {
      const batch = writeBatch(db);
      chunk.forEach((id) => addToBatch(batch, id));
      await batch.commit();
      result.deletedIds.push(...chunk);
    } catch (chunkErr) {
      console.warn('[Firestore] Error borrando lote de comprobantes, reintentando uno por uno:', chunkErr);
      for (const id of chunk) {
        try {
          const batch = writeBatch(db);
          addToBatch(batch, id);
          await batch.commit();
          result.deletedIds.push(id);
        } catch (err) {
          // Compatibilidad con reglas publicadas que todavía no conocen `deleted_expenses`:
          // se borra sin tombstone compartido. El permiso de borrado es exactamente el mismo.
          try {
            await deleteDoc(doc(db, 'expenses', id));
            console.warn(
              `[Firestore] Comprobante ${id} borrado sin tombstone compartido: ` +
                'verificá que estén publicadas las reglas actuales de firestore.rules.'
            );
            result.deletedIds.push(id);
            continue;
          } catch {
            // se evalúa abajo
          }
          // Si el documento ya no existe en el servidor, el objetivo del borrado se cumplió
          try {
            const snap = await getDocFromServer(doc(db, 'expenses', id));
            if (!snap.exists()) {
              result.deletedIds.push(id);
              continue;
            }
          } catch {
            // sin conexión: se considera fallido
          }
          console.error(`[Firestore] No se pudo eliminar el comprobante ${id}:`, err);
          result.failedIds.push(id);
        }
      }
    }
  }

  // Lo que no se pudo borrar vuelve a ser visible
  result.failedIds.forEach((id) => clearDeletedExpenseId(id));

  // Espejo del servidor: solo los borrados confirmados en Firestore
  if (result.deletedIds.length > 0) {
    authFetch('/api/data/expenses/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: result.deletedIds }),
    }).catch((serverErr) => {
      console.warn('[Delete] Notice mirroring deletion to server store:', serverErr);
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Configuración de Drive (app_settings/drive): carpeta única de comprobantes de
// pago y certificados de retención, independiente de los centros de costos.
// ---------------------------------------------------------------------------
const DRIVE_SETTINGS_DOC = doc(db, 'app_settings', 'drive');

function normalizeDriveSettings(data: any): DriveSettings | null {
  if (!data || typeof data !== 'object') return null;
  return {
    paymentsFolderUrl: data.paymentsFolderUrl || undefined,
    paymentsFolderId: data.paymentsFolderId || undefined,
    paymentsFolderName: data.paymentsFolderName || undefined,
    updatedAt: data.updatedAt || undefined,
    updatedBy: data.updatedBy || undefined,
  };
}

export async function fetchDriveSettings(): Promise<DriveSettings | null> {
  try {
    const snap = await getDoc(DRIVE_SETTINGS_DOC);
    return snap.exists() ? normalizeDriveSettings(snap.data()) : null;
  } catch (e) {
    console.warn('[Firestore] No se pudo leer la configuración de Drive:', e);
    return null;
  }
}

export function subscribeToDriveSettings(onUpdate: (settings: DriveSettings | null) => void): () => void {
  return onSnapshot(
    DRIVE_SETTINGS_DOC,
    (snap) => onUpdate(snap.exists() ? normalizeDriveSettings(snap.data()) : null),
    (err) => console.warn('[Firestore Live] configuración de Drive:', err.message)
  );
}

/** Guarda la configuración de Drive. Solo administradores (lo validan las reglas). */
export async function saveDriveSettings(settings: DriveSettings): Promise<{ ok: boolean; error?: string }> {
  try {
    await setDoc(
      DRIVE_SETTINGS_DOC,
      sanitizeForFirestore({
        paymentsFolderUrl: settings.paymentsFolderUrl || null,
        paymentsFolderId: settings.paymentsFolderId || null,
        paymentsFolderName: settings.paymentsFolderName || null,
        updatedAt: new Date().toISOString(),
        updatedBy: (auth.currentUser?.email || '').toLowerCase().trim() || null,
      })
    );
    return { ok: true };
  } catch (e: any) {
    console.warn('[Firestore] No se pudo guardar la configuración de Drive:', e);
    const denied = e?.code === 'permission-denied';
    return {
      ok: false,
      error: denied
        ? 'Sin permisos para guardar. Verificá que tu usuario sea administrador y que estén publicadas las reglas actuales de Firestore.'
        : 'No se pudo guardar la carpeta. Revisá la conexión e intentá de nuevo.',
    };
  }
}

export async function saveCentralVendors(vendors: Vendor[]): Promise<boolean> {
  try {
    const normalizedList = vendors.map((v) => normalizeVendorBankDetails(v));
    const batch = writeBatch(db);
    for (const v of normalizedList) {
      if (v && v.id) {
        const docRef = doc(db, 'vendors', v.id);
        batch.set(docRef, sanitizeForFirestore(v), { merge: true });
      }
    }
    await batch.commit();

    authFetch('/api/data/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendors: normalizedList }),
    }).catch(() => {});

    return true;
  } catch (e) {
    console.warn('[Firestore] Error saving vendors:', e);
    return false;
  }
}

export async function deleteCentralVendors(ids: string[]): Promise<boolean> {
  try {
    for (const id of ids) {
      if (id) trackDeletedVendorId(id);
    }
    const batch = writeBatch(db);
    for (const id of ids) {
      if (id) {
        const docRef = doc(db, 'vendors', id);
        batch.delete(docRef);
      }
    }
    await batch.commit();

    authFetch('/api/data/vendors/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => {});

    return true;
  } catch (e) {
    console.warn('[Firestore] Error deleting vendors:', e);
    return false;
  }
}

export async function saveSingleVendor(vendor: Vendor): Promise<boolean> {
  if (!vendor || !vendor.id) return false;
  try {
    sessionDeletedVendorIds.delete(vendor.id);
    const normalized = normalizeVendorBankDetails(vendor);
    const docRef = doc(db, 'vendors', vendor.id);
    await setDoc(docRef, sanitizeForFirestore(normalized));

    authFetch('/api/data/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendors: [normalized] }),
    }).catch(() => {});

    return true;
  } catch (e) {
    console.error(`[Firestore] Error saving single vendor ${vendor.id}:`, e);
    return false;
  }
}

export async function deleteCentralVendor(id: string): Promise<boolean> {
  if (!id) return false;
  return deleteCentralVendors([id]);
}

export async function saveSingleCostCenter(costCenter: CostCenter): Promise<boolean> {
  if (!costCenter || !costCenter.id) return false;
  try {
    const cleanCc = sanitizeCostCenter(costCenter);
    const docRef = doc(db, 'cost_centers', cleanCc.id);
    // Overwrite cleanly so removed fields like notifyEmails are completely wiped
    await setDoc(docRef, sanitizeForFirestore({
      ...cleanCc,
      notifyEmails: cleanCc.notifyEmails ?? '',
      ccEmails: cleanCc.ccEmails ?? '',
    }));

    authFetch('/api/data/cost-centers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ costCenters: [cleanCc] }),
    }).catch(() => {});

    return true;
  } catch (e) {
    console.error(`[Firestore] Error saving single cost center ${costCenter.id}:`, e);
    return false;
  }
}

export async function deleteCentralCostCenter(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const docRef = doc(db, 'cost_centers', id);
    await deleteDoc(docRef);

    authFetch('/api/data/cost-centers/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => {});

    return true;
  } catch (e) {
    console.error(`[Firestore] Error deleting cost center ${id}:`, e);
    return false;
  }
}

export async function saveCentralCostCenters(costCenters: CostCenter[]): Promise<boolean> {
  try {
    const batch = writeBatch(db);
    for (const cc of costCenters) {
      if (cc && cc.id) {
        const cleanCc = sanitizeCostCenter(cc);
        const docRef = doc(db, 'cost_centers', cleanCc.id);
        batch.set(docRef, sanitizeForFirestore({
          ...cleanCc,
          notifyEmails: cleanCc.notifyEmails ?? '',
          ccEmails: cleanCc.ccEmails ?? '',
        }));
      }
    }
    await batch.commit();

    authFetch('/api/data/cost-centers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ costCenters }),
    }).catch(() => {});

    return true;
  } catch (e) {
    console.warn('[Firestore] Error saving cost centers batch, retrying individually:', e);
    let allOk = true;
    for (const cc of costCenters) {
      if (cc && cc.id) {
        const ok = await saveSingleCostCenter(cc);
        if (!ok) allOk = false;
      }
    }
    return allOk;
  }
}

export async function saveCentralCategories(categories: string[]): Promise<boolean> {
  try {
    const docRef = doc(db, 'categories', 'master_list');
    await setDoc(docRef, { items: categories, updatedAt: new Date().toISOString() }, { merge: true });

    authFetch('/api/data/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories }),
    }).catch(() => {});

    return true;
  } catch (e) {
    console.warn('[Firestore] Error saving categories:', e);
    return false;
  }
}

export async function fetchUserCloudPreferences(userEmail: string): Promise<UserPreferencesPayload | null> {
  if (!userEmail) return null;
  try {
    // La clave es el email en minúsculas con símbolos reemplazados (las reglas exigen que sea la propia)
    const safeKey = userEmail.toLowerCase().trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const docRef = doc(db, 'user_preferences', safeKey);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as UserPreferencesPayload;
    }
  } catch (e) {
    console.warn('[Firestore] Error fetching user preferences:', e);
  }
  return null;
}

export async function saveUserCloudPreferences(userEmail: string, preferences: UserPreferencesPayload): Promise<boolean> {
  if (!userEmail) return false;
  try {
    const safeKey = userEmail.toLowerCase().trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const docRef = doc(db, 'user_preferences', safeKey);
    await setDoc(docRef, sanitizeForFirestore({ ...preferences, email: userEmail }), { merge: true });

    authFetch('/api/data/user-prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, preferences }),
    }).catch(() => {});

    return true;
  } catch (e) {
    console.warn('[Firestore] Error saving user preferences:', e);
    return false;
  }
}

/**
 * App Users / Administrators Cloud Storage
 * Centralized store with single source of truth: Firestore + Server API + Local Cache & Deletion Tombstones
 */
export async function fetchCentralUsers(): Promise<AppUserRecord[]> {
  const deleted = getDeletedUsersSet();
  const usersMap = new Map<string, AppUserRecord>();

  // 1. Load from local cache for immediate display
  for (const u of getLocalUsersCache()) {
    if (u && u.email && !deleted.has(u.email.toLowerCase().trim())) {
      usersMap.set(u.email.toLowerCase().trim(), u);
    }
  }

  // 2. Fetch directly from Firestore (authoritative)
  try {
    const usersCol = collection(db, 'app_users');
    const snap = await getDocs(usersCol);
    if (!snap.empty) {
      const firestoreUsers = new Map<string, AppUserRecord>();
      snap.forEach((d) => {
        const data = d.data() as AppUserRecord;
        if (data && data.email) {
          const key = data.email.toLowerCase().trim();
          if (!deleted.has(key)) {
            firestoreUsers.set(key, data);
          }
        }
      });
      if (firestoreUsers.size > 0) {
        const result = Array.from(firestoreUsers.values());
        saveLocalUsersCache(result);
        return result;
      }
    }
  } catch (e) {
    console.warn('[Firestore] Notice fetching users from Firestore:', e);
  }

  // 3. Query backend server API
  try {
    const res = await authFetch('/api/data/users');
    if (res.ok) {
      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
        json.data.forEach((u: AppUserRecord) => {
          if (u && u.email) {
            const key = u.email.toLowerCase().trim();
            if (!deleted.has(key)) {
              usersMap.set(key, u);
            }
          }
        });
      }
    }
  } catch (_) {}

  const result = Array.from(usersMap.values());
  saveLocalUsersCache(result);
  return result;
}

export async function saveCentralUser(user: AppUserRecord): Promise<boolean> {
  if (!user.email) return false;
  const cleanEmail = user.email.toLowerCase().trim();

  // If user was previously deleted, unmark so they are restored cleanly
  unmarkUserAsDeleted(cleanEmail);

  const safeDoc: AppUserRecord = sanitizeForFirestore({
    ...user,
    email: cleanEmail,
    updatedAt: new Date().toISOString(),
  });

  // 1. Immediately write to local cache so the UI never drops the record
  try {
    const current = getLocalUsersCache();
    const updated = [safeDoc, ...current.filter((u) => u.email.toLowerCase().trim() !== cleanEmail)];
    saveLocalUsersCache(updated);
  } catch (_) {}

  // 2. Write through backend server
  authFetch('/api/data/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(safeDoc),
  }).catch((err) => {
    console.warn('[saveCentralUser] Server write notice:', err);
  });

  // 3. Also write to Firestore directly
  try {
    const emailDocRef = doc(db, 'app_users', cleanEmail);
    await setDoc(emailDocRef, safeDoc, { merge: true });

    // Clean up any legacy sanitized safeKey document to prevent duplicate entries
    const safeKey = cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (safeKey !== cleanEmail) {
      const safeKeyDocRef = doc(db, 'app_users', safeKey);
      await deleteDoc(safeKeyDocRef).catch(() => {});
    }
    return true;
  } catch (e) {
    console.warn('[Firestore] Notice saving user record to Firestore:', e);
    return false;
  }
}

/**
 * Personas que cargaron comprobantes pero no están en la tabla de usuarios (p. ej. cuentas
 * @isf-argentina.org que antes entraban automáticamente). Solo Admin: recorre todos los comprobantes.
 */
export async function findUnregisteredSubmitters(
  registeredEmails: string[]
): Promise<{ email: string; name: string; count: number; lastDate?: string }[]> {
  const registered = new Set(registeredEmails.map((e) => e.toLowerCase().trim()));
  const snap = await getDocs(collection(db, 'expenses'));
  const found = new Map<string, { email: string; name: string; count: number; lastDate?: string }>();
  snap.forEach((d) => {
    const data = d.data() as Expense;
    const email = String(data.submittedByEmail || '').toLowerCase().trim();
    if (!email || !email.includes('@') || registered.has(email)) return;
    const prev = found.get(email);
    const date = data.createdAt || data.date;
    found.set(email, {
      email,
      name: prev?.name || data.submittedByName || email.split('@')[0],
      count: (prev?.count || 0) + 1,
      lastDate: prev?.lastDate && date && prev.lastDate > date ? prev.lastDate : date || prev?.lastDate,
    });
  });
  return Array.from(found.values()).sort((a, b) => b.count - a.count);
}

export async function deleteCentralUser(email: string): Promise<boolean> {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();

  // 1. Mark in tombstone set so it can NEVER be resurrected by cache, defaults, or stale queries
  markUserAsDeleted(cleanEmail);

  // 2. Immediately update local cache
  try {
    const current = getLocalUsersCache();
    const updated = current.filter((u) => u.email.toLowerCase().trim() !== cleanEmail);
    saveLocalUsersCache(updated);
  } catch (_) {}

  // 3. Delete through backend server
  authFetch('/api/data/users/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail }),
  }).catch(() => {});

  // 4. Delete from Firestore directly
  try {
    const emailDocRef = doc(db, 'app_users', cleanEmail);
    await deleteDoc(emailDocRef);

    const safeKey = cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (safeKey !== cleanEmail) {
      const safeKeyDocRef = doc(db, 'app_users', safeKey);
      await deleteDoc(safeKeyDocRef).catch(() => {});
    }
    return true;
  } catch (e) {
    console.warn('[Firestore] Notice deleting user record from Firestore:', e);
    return false;
  }
}

export function subscribeToUsersFirestore(
  onUpdate: (users: AppUserRecord[]) => void
): () => void {
  return onSnapshot(
    collection(db, 'app_users'),
    (snap) => {
      const usersMap = new Map<string, AppUserRecord>();
      const deleted = getDeletedUsersSet();
      snap.forEach((d) => {
        const data = d.data() as AppUserRecord;
        if (data && data.email) {
          const key = data.email.toLowerCase().trim();
          if (!deleted.has(key)) {
            const existing = usersMap.get(key);
            usersMap.set(key, existing ? { ...existing, ...data } : { ...data, email: key });
          }
        }
      });
      const uniqueUsers = deduplicateUsers(Array.from(usersMap.values()));
      saveLocalUsersCache(uniqueUsers);
      onUpdate(uniqueUsers);
    },
    (err) => console.warn('[Firestore Live] users listener note:', err.message)
  );
}

/**
 * Las primeras versiones de la app guardaban a cada usuario con una clave "limpia"
 * (p. ej. juan_gmail_com). Las reglas de Firestore identifican a cada usuario por
 * app_users/{email}, así que se crea ese documento canónico copiando el mismo rol
 * (las reglas solo permiten copiar el rol que ya asignó un admin).
 */
async function migrateLegacyUserDoc(cleanEmail: string, legacy: AppUserRecord): Promise<void> {
  if ((auth.currentUser?.email || '').toLowerCase().trim() !== cleanEmail) return;
  const canonical: Record<string, unknown> = {
    email: cleanEmail,
    role: legacy.role,
    updatedAt: new Date().toISOString(),
  };
  if (legacy.name) canonical.name = legacy.name;
  if (legacy.picture) canonical.picture = legacy.picture;
  if (legacy.createdAt) canonical.createdAt = legacy.createdAt;
  try {
    await setDoc(doc(db, 'app_users', cleanEmail), canonical, { merge: true });
  } catch (e) {
    console.warn('[Firestore] No se pudo migrar el registro de usuario al formato actual:', e);
  }
}

/**
 * Rol del usuario según la tabla de usuarios (Firestore app_users).
 * - Devuelve el rol si está registrado, o null si NO está en la tabla (sin acceso).
 * - Lanza un error si no se pudo verificar (sin conexión): así un corte de red no cierra la sesión.
 */
export async function resolveUserRoleFromEmail(email: string): Promise<'admin' | 'user' | null> {
  const cleanEmail = (email || '').toLowerCase().trim();
  if (!cleanEmail) return null;
  let firestoreChecked = false;

  // 1. Direct Firestore check (by clean email document ID)
  try {
    const emailDocRef = doc(db, 'app_users', cleanEmail);
    const snap = await getDoc(emailDocRef);
    if (snap.exists()) {
      const data = snap.data() as AppUserRecord;
      if (data.role === 'admin' || data.role === 'user') {
        return data.role;
      }
    }

    const safeKey = cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (safeKey !== cleanEmail) {
      const safeSnap = await getDoc(doc(db, 'app_users', safeKey));
      if (safeSnap.exists()) {
        const data = safeSnap.data() as AppUserRecord;
        if ((data.role === 'admin' || data.role === 'user') && (data.email || '').toLowerCase().trim() === cleanEmail) {
          await migrateLegacyUserDoc(cleanEmail, data);
          return data.role;
        }
      }
    }
    firestoreChecked = true;
  } catch (e) {
    console.warn('[Firestore] Cloud check note, resolving via server:', e);
  }

  // 2. Server-side verification (environment config & database gate)
  try {
    const res = await authFetch('/api/auth/resolve-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.role === 'admin' || json.role === 'user') {
        return json.role;
      }
      return null;
    }
    // 403 = el servidor verificó que no está en la tabla de usuarios
    if (res.status === 403 || res.status === 401) return null;
  } catch (err) {
    console.warn('[Server Auth] Role check error:', err);
  }

  if (firestoreChecked) return null;
  throw new Error('No se pudo verificar el usuario (sin conexión). Se mantiene la sesión actual.');
}

export { testFirestoreConnection };
