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
  writeBatch,
  onSnapshot,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  QueryConstraint,
} from 'firebase/firestore';
import { db, testFirestoreConnection } from '../lib/firebase';
import { Expense, Vendor, CostCenter, AppUserRecord } from '../types';
import { DEFAULT_CATEGORIES, DEFAULT_COST_CENTERS_DATA, DEFAULT_VENDORS } from '../data/initialData';
import { cacheReceiptFile, cachePaymentProofFile, cacheWithholdingCertificateFile } from './receiptCache';
import { sanitizeCostCenter } from './helpers';

export const DEFAULT_APP_USERS: AppUserRecord[] = [];

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
}

export interface UserPreferencesPayload {
  favoriteCostCenters?: string[];
  categoryCostCenterPatterns?: Record<string, Record<string, number>>;
  lastSelectedCostCenter?: string;
  theme?: string;
}

// Track IDs of expenses and vendors deleted in this session to prevent race condition resurrection
const sessionDeletedExpenseIds = new Set<string>();
export const sessionDeletedVendorIds = new Set<string>();

export function trackDeletedExpenseId(id: string) {
  sessionDeletedExpenseIds.add(id);
}

export function trackDeletedVendorId(id: string) {
  sessionDeletedVendorIds.add(id);
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

  // 1. Populate map with local expenses
  if (Array.isArray(local)) {
    for (const exp of local) {
      if (exp && exp.id && !sessionDeletedExpenseIds.has(exp.id)) {
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

  // 2. Incoming cloud expenses: merge respecting latest timestamps & preserving local cache
  if (Array.isArray(incoming)) {
    for (const cloudExp of incoming) {
      if (cloudExp && cloudExp.id && !sessionDeletedExpenseIds.has(cloudExp.id)) {
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
              driveUploadedUrl: localExp.driveUploadedUrl || cloudExp.driveUploadedUrl,
              driveUploadedFileName: localExp.driveUploadedFileName || cloudExp.driveUploadedFileName,
              paymentProofDriveUrl: localExp.paymentProofDriveUrl || cloudExp.paymentProofDriveUrl,
              withholdingCertificateDriveUrl: localExp.withholdingCertificateDriveUrl || cloudExp.withholdingCertificateDriveUrl,
              receiptImage: localExp.receiptImage || cloudExp.receiptImage,
              paymentProofImage: localExp.paymentProofImage || cloudExp.paymentProofImage,
              withholdingCertificateImage: localExp.withholdingCertificateImage || cloudExp.withholdingCertificateImage,
              audioRecordingUrl: localExp.audioRecordingUrl || cloudExp.audioRecordingUrl,
            });
          } else {
            // Cloud is newer or equal
            map.set(cloudExp.id, {
              ...localExp,
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
      const res = await fetch(url);
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

  const unsubExpenses = onSnapshot(
    expensesQuery,
    (snap) => {
      const expenses: Expense[] = [];
      snap.forEach((d) => expenses.push(d.data() as Expense));
      const hasMore = snap.size >= currentLimit;
      onUpdate({ expenses, hasMore });
    },
    (err) => {
      console.warn('[Firestore Live] expenses listener note, fallbacking to ordered limit:', err.message);
      try {
        const fallbackQuery = query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(currentLimit));
        return onSnapshot(fallbackQuery, (fallbackSnap) => {
          const fallbackExpenses: Expense[] = [];
          fallbackSnap.forEach((d) => fallbackExpenses.push(d.data() as Expense));
          onUpdate({ expenses: fallbackExpenses, hasMore: fallbackSnap.size >= currentLimit });
        });
      } catch {}
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
    unsubVendors();
    unsubCostCenters();
  };
}

export async function saveCentralExpenses(expenses: Expense[]): Promise<boolean> {
  try {
    const batch = writeBatch(db);
    for (const exp of expenses) {
      if (exp && exp.id) {
        sessionDeletedExpenseIds.delete(exp.id);
        const docRef = doc(db, 'expenses', exp.id);
        const safeDoc = prepareExpenseForFirestore(exp);
        batch.set(docRef, safeDoc, { merge: true });
      }
    }
    await batch.commit();

    // Also notify server backend with lightweight metadata
    fetch('/api/data/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expenses: expenses.map((e) => prepareExpenseForFirestore(e)) }),
    }).catch(() => {});

    return true;
  } catch (e) {
    console.warn('[Firestore] Error saving all expenses with batch, falling back to individual docs:', e);
    let allOk = true;
    for (const exp of expenses) {
      if (exp && exp.id) {
        try {
          const docRef = doc(db, 'expenses', exp.id);
          const safeDoc = prepareExpenseForFirestore(exp);
          await setDoc(docRef, safeDoc, { merge: true });
        } catch (err) {
          console.error(`[Firestore] Could not save expense ${exp.id}:`, err);
          allOk = false;
        }
      }
    }
    return allOk;
  }
}

export async function upsertCentralExpenses(items: Expense[]): Promise<boolean> {
  if (!items || items.length === 0) return true;

  try {
    const batch = writeBatch(db);
    for (const item of items) {
      if (item && item.id) {
        sessionDeletedExpenseIds.delete(item.id);
        const docRef = doc(db, 'expenses', item.id);
        const safeDoc = prepareExpenseForFirestore(item);
        batch.set(docRef, safeDoc, { merge: true });
      }
    }
    await batch.commit();

    fetch('/api/data/expenses/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map((i) => prepareExpenseForFirestore(i)) }),
    }).catch(() => {});

    return true;
  } catch (e) {
    console.warn('[Firestore] Error in batch upserting expenses, falling back to single setDoc:', e);
    let allOk = true;
    for (const item of items) {
      if (item && item.id) {
        try {
          const docRef = doc(db, 'expenses', item.id);
          const safeDoc = prepareExpenseForFirestore(item);
          await setDoc(docRef, safeDoc, { merge: true });
        } catch (err) {
          console.error(`[Firestore] Failed to upsert expense ${item.id}:`, err);
          try {
            // Extreme fallback: ensure all binary files are stripped
            const fallbackDoc = prepareExpenseForFirestore(item);
            await setDoc(doc(db, 'expenses', item.id), fallbackDoc, { merge: true });
          } catch (criticalErr) {
            console.error(`[Firestore] Critical error saving ${item.id}:`, criticalErr);
            allOk = false;
          }
        }
      }
    }
    return allOk;
  }
}

export async function deleteCentralExpenses(ids: string[]): Promise<boolean> {
  try {
    ids.forEach((id) => trackDeletedExpenseId(id));
    const batch = writeBatch(db);
    for (const id of ids) {
      if (id) {
        const docRef = doc(db, 'expenses', id);
        batch.delete(docRef);
      }
    }
    await batch.commit();

    fetch('/api/data/expenses/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => {});

    return true;
  } catch (e) {
    console.warn('[Firestore] Error deleting expenses batch:', e);
    for (const id of ids) {
      if (id) {
        deleteDoc(doc(db, 'expenses', id)).catch(() => {});
      }
    }
    return false;
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

    fetch('/api/data/vendors', {
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

    fetch('/api/data/vendors/delete', {
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

    fetch('/api/data/vendors', {
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

    fetch('/api/data/cost-centers', {
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

    fetch('/api/data/cost-centers/delete', {
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

    fetch('/api/data/cost-centers', {
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

    fetch('/api/data/categories', {
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
    const safeKey = userEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
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
    const safeKey = userEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
    const docRef = doc(db, 'user_preferences', safeKey);
    await setDoc(docRef, sanitizeForFirestore({ ...preferences, email: userEmail }), { merge: true });

    fetch('/api/data/user-prefs', {
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
 */
export async function fetchCentralUsers(): Promise<AppUserRecord[]> {
  try {
    const usersCol = collection(db, 'app_users');
    const snap = await getDocs(usersCol);
    const usersMap = new Map<string, AppUserRecord>();
    snap.forEach((d) => {
      const data = d.data() as AppUserRecord;
      if (data && data.email) {
        usersMap.set(data.email.toLowerCase().trim(), data);
      }
    });

    if (usersMap.size === 0) {
      // Fetch from backend server API
      const res = await fetch('/api/data/users');
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          return json.data;
        }
      }
    }

    return Array.from(usersMap.values());
  } catch (e) {
    console.warn('[Firestore] Notice fetching users, querying server:', e);
    try {
      const res = await fetch('/api/data/users');
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch (_) {}
    return [];
  }
}

export async function saveCentralUser(user: AppUserRecord): Promise<boolean> {
  if (!user.email) return false;
  const cleanEmail = user.email.toLowerCase().trim();
  const safeDoc = sanitizeForFirestore({
    ...user,
    email: cleanEmail,
    updatedAt: new Date().toISOString(),
  });

  // 1. Write through backend server first
  fetch('/api/data/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(safeDoc),
  }).catch(() => {});

  // 2. Also write to Firestore directly
  try {
    const emailDocRef = doc(db, 'app_users', cleanEmail);
    await setDoc(emailDocRef, safeDoc, { merge: true });

    const safeKey = cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (safeKey !== cleanEmail) {
      const safeKeyDocRef = doc(db, 'app_users', safeKey);
      await setDoc(safeKeyDocRef, safeDoc, { merge: true }).catch(() => {});
    }
    return true;
  } catch (e) {
    console.warn('[Firestore] Notice saving user record to Firestore:', e);
    return true;
  }
}

export async function deleteCentralUser(email: string): Promise<boolean> {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();

  // 1. Delete through backend server
  fetch('/api/data/users/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail }),
  }).catch(() => {});

  // 2. Delete from Firestore directly
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
    return true;
  }
}

export function subscribeToUsersFirestore(
  onUpdate: (users: AppUserRecord[]) => void
): () => void {
  return onSnapshot(
    collection(db, 'app_users'),
    (snap) => {
      const map = new Map<string, AppUserRecord>();
      snap.forEach((d) => {
        const data = d.data() as AppUserRecord;
        if (data && data.email) {
          map.set(data.email.toLowerCase().trim(), data);
        }
      });
      onUpdate(Array.from(map.values()));
    },
    (err) => console.warn('[Firestore Live] users listener note:', err.message)
  );
}

export async function resolveUserRoleFromEmail(email: string): Promise<'admin' | 'user' | null> {
  const cleanEmail = (email || '').toLowerCase().trim();
  if (!cleanEmail) return null;

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
        if (data.role === 'admin' || data.role === 'user') {
          return data.role;
        }
      }
    }
  } catch (e) {
    console.warn('[Firestore] Cloud check note, resolving via server:', e);
  }

  // 2. Server-side verification (environment config & database gate)
  try {
    const res = await fetch('/api/auth/resolve-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.role === 'admin' || json.role === 'user') {
        return json.role;
      }
    }
  } catch (err) {
    console.warn('[Server Auth] Role check error:', err);
  }

  // If not found in the authorized database or server configuration, return null (unauthorized)
  return null;
}

export { testFirestoreConnection };
