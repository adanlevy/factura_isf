import { Expense } from '../types';
import { saveUserCloudPreferences } from './cloudSync';

export type ExpenseSortField =
  | 'createdAt'
  | 'date'
  | 'vendor'
  | 'amount'
  | 'project'
  | 'category'
  | 'status'
  | 'bankDetails'
  | 'submittedByName'
  | 'invoiceNumber'
  | 'notes'
  | 'accountingNotes'
  | 'paymentType';

export type SortDirection = 'asc' | 'desc';

export interface ExpenseSortConfig {
  field: ExpenseSortField;
  direction: SortDirection;
}

/**
 * Sorts an array of expenses according to the given sort configuration.
 * Default is 'createdAt' descending (Fecha de Carga más reciente primero).
 */
export function sortExpenses(
  expenses: Expense[],
  config: ExpenseSortConfig = { field: 'createdAt', direction: 'desc' }
): Expense[] {
  const { field, direction } = config;
  const multiplier = direction === 'asc' ? 1 : -1;

  return [...expenses].sort((a, b) => {
    let result = 0;

    switch (field) {
      case 'createdAt': {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : (a.date ? new Date(a.date).getTime() : 0);
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : (b.date ? new Date(b.date).getTime() : 0);
        result = (timeA - timeB) * multiplier;
        break;
      }
      case 'date': {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        result = (dateA - dateB) * multiplier;
        break;
      }
      case 'vendor': {
        const vendorA = (a.vendor || '').trim();
        const vendorB = (b.vendor || '').trim();
        result = vendorA.localeCompare(vendorB, 'es', { sensitivity: 'base' }) * multiplier;
        break;
      }
      case 'amount': {
        const amountA = typeof a.amount === 'number' ? a.amount : 0;
        const amountB = typeof b.amount === 'number' ? b.amount : 0;
        result = (amountA - amountB) * multiplier;
        break;
      }
      case 'project': {
        const projA = (a.project || '').trim();
        const projB = (b.project || '').trim();
        result = projA.localeCompare(projB, 'es', { sensitivity: 'base' }) * multiplier;
        break;
      }
      case 'category': {
        const catA = (a.category || '').trim();
        const catB = (b.category || '').trim();
        result = catA.localeCompare(catB, 'es', { sensitivity: 'base' }) * multiplier;
        break;
      }
      case 'status': {
        const isPaidA = a.reimbursementStatus === 'REIMBURSED';
        const isPendingA = (a.reimbursable || a.paymentType === 'PAGO_PROVEEDOR' || a.paymentType === 'REINTEGRO') && !isPaidA;
        const statusScoreA = isPaidA ? 2 : isPendingA ? 1 : 0;

        const isPaidB = b.reimbursementStatus === 'REIMBURSED';
        const isPendingB = (b.reimbursable || b.paymentType === 'PAGO_PROVEEDOR' || b.paymentType === 'REINTEGRO') && !isPaidB;
        const statusScoreB = isPaidB ? 2 : isPendingB ? 1 : 0;

        result = (statusScoreA - statusScoreB) * multiplier;
        break;
      }
      case 'bankDetails': {
        const bankStrA = `${a.bankDetails?.accountHolder || ''} ${a.bankDetails?.bankName || ''} ${a.bankDetails?.alias || ''} ${a.bankDetails?.cbuCvu || ''}`.trim();
        const bankStrB = `${b.bankDetails?.accountHolder || ''} ${b.bankDetails?.bankName || ''} ${b.bankDetails?.alias || ''} ${b.bankDetails?.cbuCvu || ''}`.trim();
        result = bankStrA.localeCompare(bankStrB, 'es', { sensitivity: 'base' }) * multiplier;
        break;
      }
      case 'submittedByName': {
        const subA = (a.submittedByName || a.submittedByEmail || '').trim();
        const subB = (b.submittedByName || b.submittedByEmail || '').trim();
        result = subA.localeCompare(subB, 'es', { sensitivity: 'base' }) * multiplier;
        break;
      }
      case 'invoiceNumber': {
        const invA = (a.invoiceNumber || '').trim();
        const invB = (b.invoiceNumber || '').trim();
        result = invA.localeCompare(invB, 'es', { sensitivity: 'base' }) * multiplier;
        break;
      }
      case 'notes':
      case 'accountingNotes': {
        const noteA = (a.accountingNotes || a.notes || '').trim();
        const noteB = (b.accountingNotes || b.notes || '').trim();
        result = noteA.localeCompare(noteB, 'es', { sensitivity: 'base' }) * multiplier;
        break;
      }
      case 'paymentType': {
        const payA = (a.paymentType || a.paymentMethod || '').trim();
        const payB = (b.paymentType || b.paymentMethod || '').trim();
        result = payA.localeCompare(payB, 'es', { sensitivity: 'base' }) * multiplier;
        break;
      }
      default:
        result = 0;
    }

    // Stable tie-breaker: sort newest createdAt first
    if (result === 0) {
      const createdA = a.createdAt || a.date || '';
      const createdB = b.createdAt || b.date || '';
      result = createdB.localeCompare(createdA);
      if (result === 0) {
        result = (b.id || '').localeCompare(a.id || '');
      }
    }

    return result;
  });
}

/**
 * Utility to group selection lists by most frequently used first, followed
 * by a separator and then the rest sorted alphabetically.
 */

export interface SmartSortedGroup {
  frequent: string[];
  alphabetical: string[];
}

export function getSmartSortedOptions(
  allItems: string[],
  frequencyHistory: (string | undefined | null)[],
  topCount: number = 3
): SmartSortedGroup {
  if (!allItems || allItems.length === 0) {
    return { frequent: [], alphabetical: [] };
  }

  // Count occurrences in history
  const counts: Record<string, number> = {};
  frequencyHistory.forEach((item) => {
    if (item && allItems.includes(item)) {
      counts[item] = (counts[item] || 0) + 1;
    }
  });

  // Sort items by frequency descending
  const sortedByFrequency = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, count]) => count > 0)
    .map(([item]) => item);

  // Take top items
  const frequent = sortedByFrequency.slice(0, topCount);

  // All items sorted strictly alphabetically
  const alphabetical = [...allItems].sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  );

  return {
    frequent,
    alphabetical,
  };
}

const PATTERN_STORAGE_KEY_PREFIX = 'isf_cat_cost_center_patterns_';

/**
 * Persists a user's selection of cost center for a specific category
 * Updates both localStorage and Cloud User Preferences
 */
export function recordCategoryCostCenterUsage(
  userEmail: string | undefined | null,
  category: string,
  costCenter: string
) {
  if (!category || !costCenter) return;
  try {
    const key = `${PATTERN_STORAGE_KEY_PREFIX}${userEmail || 'global'}`;
    const raw = localStorage.getItem(key);
    const map: Record<string, Record<string, number>> = raw ? JSON.parse(raw) : {};

    if (!map[category]) {
      map[category] = {};
    }
    map[category][costCenter] = (map[category][costCenter] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(map));

    // Async sync to Firestore & server user preferences
    if (userEmail && userEmail !== 'global') {
      saveUserCloudPreferences(userEmail, {
        categoryCostCenterPatterns: map,
        lastSelectedCostCenter: costCenter,
      }).catch((err) => console.warn('[Firestore] Could not save pattern:', err));
    }

    // Also update global fallback patterns
    if (userEmail && userEmail !== 'global') {
      const globalKey = `${PATTERN_STORAGE_KEY_PREFIX}global`;
      const globalRaw = localStorage.getItem(globalKey);
      const globalMap: Record<string, Record<string, number>> = globalRaw ? JSON.parse(globalRaw) : {};
      if (!globalMap[category]) {
        globalMap[category] = {};
      }
      globalMap[category][costCenter] = (globalMap[category][costCenter] || 0) + 1;
      localStorage.setItem(globalKey, JSON.stringify(globalMap));
    }
  } catch (e) {
    console.warn('Error recording category cost center pattern:', e);
  }
}

/**
 * Hydrates cloud patterns into local cache when a user logs in on a new device
 */
export function hydrateUserPatternsFromCloud(
  userEmail: string,
  patterns: Record<string, Record<string, number>>
) {
  if (!userEmail || !patterns) return;
  try {
    const key = `${PATTERN_STORAGE_KEY_PREFIX}${userEmail}`;
    const raw = localStorage.getItem(key);
    const existing: Record<string, Record<string, number>> = raw ? JSON.parse(raw) : {};
    
    // Merge cloud patterns with local
    const merged = { ...patterns, ...existing };
    localStorage.setItem(key, JSON.stringify(merged));
  } catch (e) {
    console.warn('Error hydrating user patterns from cloud:', e);
  }
}

export function getCategoryCostCenterPatternMap(
  userEmail: string | undefined | null
): Record<string, Record<string, number>> {
  try {
    const key = `${PATTERN_STORAGE_KEY_PREFIX}${userEmail || 'global'}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Error reading category cost center patterns:', e);
  }
  return {};
}

/**
 * Computes the ranking of cost centers (projects),
 * prioritizing the user's most frequently chosen cost centers first,
 * followed by organization-wide frequent cost centers, and then the rest alphabetically.
 */
export function getSmartSortedCostCenters(
  availableProjects: string[],
  existingExpenses: Array<{ project?: string; submittedByEmail?: string }>,
  userEmail?: string
): {
  topSuggested?: string;
  frequent: string[];
  remaining: string[];
  alphabetical: string[];
} {
  if (!availableProjects || availableProjects.length === 0) {
    return { frequent: [], remaining: [], alphabetical: [] };
  }

  const counts: Record<string, number> = {};

  // 1. Calculate from local storage persisted user patterns
  const localMap = getCategoryCostCenterPatternMap(userEmail);
  for (const catPatterns of Object.values(localMap)) {
    for (const [proj, count] of Object.entries(catPatterns)) {
      if (availableProjects.includes(proj)) {
        counts[proj] = (counts[proj] || 0) + count * 2;
      }
    }
  }

  const globalMap = getCategoryCostCenterPatternMap('global');
  for (const catPatterns of Object.values(globalMap)) {
    for (const [proj, count] of Object.entries(catPatterns)) {
      if (availableProjects.includes(proj)) {
        counts[proj] = (counts[proj] || 0) + count;
      }
    }
  }

  // 2. Calculate from existing expenses prioritizing current user
  existingExpenses.forEach((exp) => {
    if (exp.project && availableProjects.includes(exp.project)) {
      const isUser = userEmail && exp.submittedByEmail && exp.submittedByEmail.toLowerCase() === userEmail.toLowerCase();
      counts[exp.project] = (counts[exp.project] || 0) + (isUser ? 3 : 1);
    }
  });

  // Sort by count descending
  const sortedByFreq = Object.entries(counts)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([proj]) => proj);

  const frequent = sortedByFreq.slice(0, 5);

  // Remaining projects sorted alphabetically
  const remaining = availableProjects
    .filter((p) => !frequent.includes(p))
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  return {
    topSuggested: frequent.length > 0 ? frequent[0] : undefined,
    frequent,
    remaining,
    alphabetical: remaining,
  };
}

/**
 * Backwards compatibility wrapper for cost center smart sorting
 */
export function getCategorySmartSortedProjects(
  _category: string | undefined,
  availableProjects: string[],
  existingExpenses: Array<{ category?: string; project?: string; submittedByEmail?: string }>,
  userEmail?: string
): {
  topSuggested?: string;
  frequentForCategory: string[];
  remaining: string[];
} {
  const result = getSmartSortedCostCenters(availableProjects, existingExpenses, userEmail);
  return {
    topSuggested: result.topSuggested,
    frequentForCategory: result.frequent,
    remaining: result.remaining,
  };
}

