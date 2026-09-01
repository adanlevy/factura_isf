import { AppUserRecord, CostCenter, Expense } from '../types';

/**
 * Normalizes and extracts valid emails from a comma, semicolon, space, or newline delimited string or array.
 */
export function parseEmailList(raw?: string | string[] | null): string[] {
  if (!raw) return [];
  const rawArray = Array.isArray(raw) ? raw : [raw];
  const results: string[] = [];

  for (const item of rawArray) {
    if (!item || typeof item !== 'string') continue;
    const splitItems = item.split(/[,;\n\r\t]+/);
    for (const part of splitItems) {
      const clean = part.trim().toLowerCase();
      // Basic email syntax validation
      if (clean && clean.includes('@') && clean.includes('.') && !clean.includes(' ')) {
        results.push(clean);
      }
    }
  }

  return Array.from(new Set(results));
}

/**
 * Formats a list of emails into a clean, comma-separated string
 */
export function formatEmailList(emails: string[]): string {
  return Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))).join(', ');
}

export interface ResolveEmailCcParams {
  toEmail?: string | string[];
  costCenterNameOrCode?: string;
  costCenters?: CostCenter[];
  expense?: Expense;
  expenses?: Expense[];
  appUsers?: AppUserRecord[];
  explicitCc?: string | string[];
}

/**
 * Resolves the full carbon copy (CC) recipients for any outgoing email:
 * 
 * 1. Global Platform CC Users:
 *    Any registered app user with `ccAllOutgoingEmails === true`.
 * 
 * 2. Cost Center Specific CC Emails:
 *    If the movement/expense is linked to a Cost Center, extracts the comma-separated
 *    emails configured in that Cost Center's `notifyEmails` or `ccEmails` field.
 * 
 * 3. Explicit CC:
 *    Any CC explicitly specified in the action.
 * 
 * Rules:
 * - Excludes the primary recipient (to) to avoid duplicate delivery.
 * - Deduplicates case-insensitively.
 * - Filters out invalid strings.
 */
export function resolveEmailCcRecipients(params: ResolveEmailCcParams): string[] {
  const {
    toEmail,
    costCenterNameOrCode,
    costCenters = [],
    expense,
    expenses = [],
    appUsers = [],
    explicitCc,
  } = params;

  const toList = new Set(parseEmailList(toEmail));
  const ccSet = new Set<string>();

  // 1. Global CC: Users with ccAllOutgoingEmails === true
  if (Array.isArray(appUsers) && appUsers.length > 0) {
    for (const user of appUsers) {
      if (user && user.ccAllOutgoingEmails && user.email) {
        const clean = user.email.trim().toLowerCase();
        if (clean && clean.includes('@')) {
          ccSet.add(clean);
        }
      }
    }
  }

  // 2. Cost Center Specific CC
  const targetCostCenterKeys = new Set<string>();
  if (costCenterNameOrCode && costCenterNameOrCode.trim()) {
    targetCostCenterKeys.add(costCenterNameOrCode.trim().toLowerCase());
  }
  if (expense && expense.project) {
    targetCostCenterKeys.add(expense.project.trim().toLowerCase());
  }
  if (Array.isArray(expenses) && expenses.length > 0) {
    for (const exp of expenses) {
      if (exp && exp.project) {
        targetCostCenterKeys.add(exp.project.trim().toLowerCase());
      }
    }
  }

  if (targetCostCenterKeys.size > 0 && Array.isArray(costCenters) && costCenters.length > 0) {
    for (const targetKey of targetCostCenterKeys) {
      const matchingCc = costCenters.find((cc) => {
        if (!cc) return false;
        const nameNorm = (cc.name || '').trim().toLowerCase();
        const codeNorm = (cc.code || '').trim().toLowerCase();
        const idNorm = (cc.id || '').trim().toLowerCase();
        return nameNorm === targetKey || codeNorm === targetKey || idNorm === targetKey;
      });

      if (matchingCc) {
        const ccField = matchingCc.notifyEmails || matchingCc.ccEmails;
        if (ccField) {
          const parsed = parseEmailList(ccField);
          for (const email of parsed) {
            ccSet.add(email);
          }
        }
      }
    }
  }

  // 3. Explicit CC passed
  if (explicitCc) {
    const explicitList = parseEmailList(explicitCc);
    for (const email of explicitList) {
      ccSet.add(email);
    }
  }

  // Remove primary recipients
  for (const to of toList) {
    ccSet.delete(to);
  }

  return Array.from(ccSet);
}
