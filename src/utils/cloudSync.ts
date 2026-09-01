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
} from 'firebase/firestore';
import { db, testFirestoreConnection } from '../lib/firebase';
import { Expense, Vendor, CostCenter, AppUserRecord } from '../types';
import { DEFAULT_CATEGORIES, DEFAULT_COST_CENTERS_DATA, DEFAULT_VENDORS } from '../data/initialData';
import { cacheReceiptFile, cachePaymentProofFile, cacheWithholdingCertificateFile } from './receiptCache';
import { sanitizeCostCenter } from './helpers';

export const DEFAULT_APP_USERS: AppUserRecord[] = [
  {
    email: 'admin@isf-argentina.org',
    name: 'Administración ISF',
    role: 'admin',
    notes: 'Cuenta Institucional Central / Finanzas',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    email: 'alevy@isf-argentina.org',
    name: 'Adán Levy',
    role: 'admin',
    notes: 'Administrador Principal / Finanzas',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    email: 'adanlevy@gmail.com',
    name: 'Adán Levy (Cuenta Google)',
    role: 'admin',
    notes: 'Administrador / Propietario Técnico',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    email: 'finanzas@isf-argentina.org',
    name: 'Finanzas ISF',
    role: 'admin',
    notes: 'Equipo Central de Finanzas',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
];

export interface SyncPayload {
  expenses: Expense[];
  vendors: Vendor[];
  costCenters: CostCenter[];
  categories: string[];
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

  return {
    ...vendor,
    bankDetails: {
      ...bankDetails,
      bankName: bankName,
      accountType,
      cbuCvu: rawCbu,
      alias: rawAlias,
      cuitCuil: bankDetails.cuitCuil || vendor.cuit || '',
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
 * Fetches all collections from Firestore, with fallback to backend API and initial seeding if empty
 */
export async function fetchCentralSync(): Promise<SyncPayload | null> {
  try {
    // 1. Try reading from Firestore
    const expensesCol = collection(db, 'expenses');
    const vendorsCol = collection(db, 'vendors');
    const costCentersCol = collection(db, 'cost_centers');
    const categoriesCol = collection(db, 'categories');

    const [expensesSnap, vendorsSnap, costCentersSnap, categoriesSnap] = await Promise.all([
      getDocs(expensesCol),
      getDocs(vendorsCol),
      getDocs(costCentersCol),
      getDocs(categoriesCol),
    ]);

    const expenses: Expense[] = [];
    expensesSnap.forEach((d) => expenses.push(d.data() as Expense));

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
      // Automatically persist cleaned cost centers to Firestore
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
    };
  } catch (firestoreErr) {
    console.warn('[Firestore] Sync direct read note:', firestoreErr);
    
    // Fallback to server JSON sync
    try {
      const res = await fetch('/api/data/sync');
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
 * Real-time Firestore Subscriptions
 */
export function subscribeToRealtimeFirestore(
  onUpdate: (payload: Partial<SyncPayload>) => void
): () => void {
  const unsubExpenses = onSnapshot(
    collection(db, 'expenses'),
    (snap) => {
      const expenses: Expense[] = [];
      snap.forEach((d) => expenses.push(d.data() as Expense));
      onUpdate({ expenses });
    },
    (err) => console.warn('[Firestore Live] expenses listener note:', err.message)
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

export async function saveCentralCostCenters(costCenters: CostCenter[]): Promise<boolean> {
  try {
    const batch = writeBatch(db);
    for (const cc of costCenters) {
      if (cc && cc.id) {
        const docRef = doc(db, 'cost_centers', cc.id);
        batch.set(docRef, sanitizeForFirestore(cc), { merge: true });
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
    console.warn('[Firestore] Error saving cost centers:', e);
    return false;
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
    const users: AppUserRecord[] = [];
    snap.forEach((d) => users.push(d.data() as AppUserRecord));

    if (users.length === 0) {
      // Seed default admin users
      for (const defaultUser of DEFAULT_APP_USERS) {
        await saveCentralUser(defaultUser);
      }
      return DEFAULT_APP_USERS;
    }

    return users;
  } catch (e) {
    console.warn('[Firestore] Error fetching users:', e);
    return DEFAULT_APP_USERS;
  }
}

export async function saveCentralUser(user: AppUserRecord): Promise<boolean> {
  if (!user.email) return false;
  try {
    const safeKey = user.email.toLowerCase().trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const docRef = doc(db, 'app_users', safeKey);
    await setDoc(
      docRef,
      sanitizeForFirestore({
        ...user,
        email: user.email.toLowerCase().trim(),
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
    return true;
  } catch (e) {
    console.warn('[Firestore] Error saving user record:', e);
    return false;
  }
}

export async function deleteCentralUser(email: string): Promise<boolean> {
  if (!email) return false;
  try {
    const safeKey = email.toLowerCase().trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const docRef = doc(db, 'app_users', safeKey);
    await deleteDoc(docRef);
    return true;
  } catch (e) {
    console.warn('[Firestore] Error deleting user record:', e);
    return false;
  }
}

export function subscribeToUsersFirestore(
  onUpdate: (users: AppUserRecord[]) => void
): () => void {
  return onSnapshot(
    collection(db, 'app_users'),
    (snap) => {
      const users: AppUserRecord[] = [];
      snap.forEach((d) => users.push(d.data() as AppUserRecord));
      onUpdate(users);
    },
    (err) => console.warn('[Firestore Live] users listener note:', err.message)
  );
}

export async function resolveUserRoleFromEmail(email: string): Promise<'admin' | 'user' | null> {
  const cleanEmail = (email || '').toLowerCase().trim();
  if (!cleanEmail) return null;

  // Predefined/Bootstrapped administrators
  if (
    cleanEmail === 'admin@isf-argentina.org' ||
    cleanEmail === 'alevy@isf-argentina.org' ||
    cleanEmail === 'adanlevy@gmail.com' ||
    cleanEmail === 'finanzas@isf-argentina.org'
  ) {
    return 'admin';
  }

  try {
    const safeKey = cleanEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
    const docRef = doc(db, 'app_users', safeKey);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as AppUserRecord;
      if (data.role) {
        return data.role;
      }
    }
  } catch (e) {
    console.warn('[Firestore] Could not resolve user role from cloud:', e);
  }

  // If not found in the authorized database or predefined admins list, return null (unauthorized)
  return null;
}

export { testFirestoreConnection };
