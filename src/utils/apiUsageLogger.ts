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
import { ApiUsageLogEntry, MonthApiUsage, ServiceUsageSummary, SystemMetricsReport } from '../types';
import { sanitizeForFirestore } from './cloudSync';

export const API_USAGE_COLLECTION = 'api_usage_logs';
export const ARS_EXCHANGE_RATE = 1060;

/**
 * Calculates official Gemini 2.5 / 3.7 Flash pricing:
 * - $0.10 / 1M prompt tokens ($0.00000010 per token)
 * - $0.40 / 1M output tokens ($0.00000040 per token)
 */
export function calculateGeminiCost(promptTokens = 0, candidatesTokens = 0): number {
  const inputCost = (promptTokens / 1_000_000) * 0.10;
  const outputCost = (candidatesTokens / 1_000_000) * 0.40;
  const total = inputCost + outputCost;
  return Number(total.toFixed(6));
}

/**
 * Persists an API usage log entry to Cloud Firestore
 */
export async function logApiUsageEvent(entry: {
  service: 'gemini_ai' | 'google_drive' | 'google_gmail' | 'firestore';
  serviceName: string;
  endpoint: string;
  actionName: string;
  model?: string;
  promptTokens?: number;
  candidatesTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  status?: 'success' | 'error';
  durationMs?: number;
  userEmail?: string;
  details?: string;
}): Promise<ApiUsageLogEntry | null> {
  try {
    const timestamp = new Date().toISOString();
    const logId = `api_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    let costUsd = entry.estimatedCostUsd;
    if (costUsd === undefined) {
      if (entry.service === 'gemini_ai') {
        costUsd = calculateGeminiCost(entry.promptTokens || 0, entry.candidatesTokens || 0);
      } else {
        costUsd = 0.0001; // Drive / Gmail operation baseline
      }
    }

    const estimatedCostArs = Number((costUsd * ARS_EXCHANGE_RATE).toFixed(2));
    const totalTokens = entry.totalTokens || ((entry.promptTokens || 0) + (entry.candidatesTokens || 0));

    const fullRecord: ApiUsageLogEntry = {
      id: logId,
      timestamp,
      service: entry.service,
      serviceName: entry.serviceName,
      endpoint: entry.endpoint,
      actionName: entry.actionName,
      model: entry.model,
      promptTokens: entry.promptTokens || 0,
      candidatesTokens: entry.candidatesTokens || 0,
      totalTokens,
      estimatedCostUsd: Number(costUsd.toFixed(6)),
      estimatedCostArs,
      status: entry.status || 'success',
      durationMs: entry.durationMs || 0,
      userEmail: entry.userEmail,
      details: entry.details,
    };

    const docRef = doc(db, API_USAGE_COLLECTION, logId);
    await setDoc(docRef, sanitizeForFirestore(fullRecord));

    // Also notify backend mirror in background
    fetch('/api/system/log-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullRecord),
    }).catch(() => {});

    return fullRecord;
  } catch (err) {
    console.warn('[ApiUsageLogger] Could not record API usage log in Firestore:', err);
    return null;
  }
}

/**
 * Fetches all persistent API usage logs from Firestore
 */
export async function fetchCentralApiUsageLogs(maxCount = 2000): Promise<ApiUsageLogEntry[]> {
  try {
    const logsCol = collection(db, API_USAGE_COLLECTION);
    const snap = await getDocs(logsCol);
    const logs: ApiUsageLogEntry[] = [];
    snap.forEach((d) => {
      const data = d.data() as ApiUsageLogEntry;
      if (data && data.id && !data.id.startsWith('seed_')) {
        logs.push(data);
      }
    });

    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, maxCount);
  } catch (e) {
    console.warn('[ApiUsageLogger] Error fetching API logs:', e);
    return [];
  }
}

/**
 * Real-time Firestore Subscription for persistent API usage logs
 */
export function subscribeToApiUsageLogs(
  onUpdate: (logs: ApiUsageLogEntry[]) => void,
  maxCount = 2000
): () => void {
  return onSnapshot(
    collection(db, API_USAGE_COLLECTION),
    (snap) => {
      const logs: ApiUsageLogEntry[] = [];
      snap.forEach((d) => {
        const data = d.data() as ApiUsageLogEntry;
        if (data && data.id && !data.id.startsWith('seed_')) {
          logs.push(data);
        }
      });
      const sorted = logs
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, maxCount);
      onUpdate(sorted);
    },
    (err) => console.warn('[ApiUsageLogger Live] listener note:', err.message)
  );
}

/**
 * Computes monthly aggregated statistics from the persistent API logs
 */
export function aggregateApiUsage(logs: ApiUsageLogEntry[]) {
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const now = new Date();
  const currYear = now.getFullYear();
  const currMonth = now.getMonth();
  const currMonthKey = `${currYear}-${String(currMonth + 1).padStart(2, '0')}`;
  const currMonthLabel = `${monthNames[currMonth]} ${currYear}`;

  const prevMonthIdx = currMonth === 0 ? 11 : currMonth - 1;
  const prevYearVal = currMonth === 0 ? currYear - 1 : currYear;
  const prevMonthKey = `${prevYearVal}-${String(prevMonthIdx + 1).padStart(2, '0')}`;
  const prevMonthLabel = `${monthNames[prevMonthIdx]} ${prevYearVal}`;

  const createMonthAggregation = (key: string, label: string): MonthApiUsage => {
    const monthLogs = logs.filter((l) => l.timestamp.startsWith(key));
    let totalCalls = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    const byService: Record<string, ServiceUsageSummary> = {
      gemini_ai: { service: 'gemini_ai', serviceName: 'Google Gemini AI', calls: 0, tokens: 0, costUsd: 0, costArs: 0 },
      google_drive: { service: 'google_drive', serviceName: 'Google Drive API', calls: 0, tokens: 0, costUsd: 0, costArs: 0 },
      google_gmail: { service: 'google_gmail', serviceName: 'Google Gmail API', calls: 0, tokens: 0, costUsd: 0, costArs: 0 },
      firestore: { service: 'firestore', serviceName: 'Firebase Firestore', calls: 0, tokens: 0, costUsd: 0, costArs: 0 },
    };

    for (const log of monthLogs) {
      totalCalls += 1;
      totalTokens += log.totalTokens || 0;
      totalCostUsd += log.estimatedCostUsd || 0;

      const svc = byService[log.service] || {
        service: log.service,
        serviceName: log.serviceName || log.service,
        calls: 0,
        tokens: 0,
        costUsd: 0,
        costArs: 0,
      };
      svc.calls += 1;
      svc.tokens += log.totalTokens || 0;
      svc.costUsd += log.estimatedCostUsd || 0;
      svc.costArs += log.estimatedCostArs || (log.estimatedCostUsd * ARS_EXCHANGE_RATE);
      byService[log.service] = svc;
    }

    totalCostUsd = Number(totalCostUsd.toFixed(4));
    const totalCostArs = Number((totalCostUsd * ARS_EXCHANGE_RATE).toFixed(2));
    for (const k of Object.keys(byService)) {
      byService[k].costUsd = Number(byService[k].costUsd.toFixed(4));
      byService[k].costArs = Number(byService[k].costArs.toFixed(2));
    }

    return {
      monthKey: key,
      monthLabel: label,
      totalCalls,
      totalTokens,
      totalCostUsd,
      totalCostArs,
      byService,
    };
  };

  const currentMonthUsage = createMonthAggregation(currMonthKey, currMonthLabel);
  const previousMonthUsage = createMonthAggregation(prevMonthKey, prevMonthLabel);

  const diffCostUsd = Number((currentMonthUsage.totalCostUsd - previousMonthUsage.totalCostUsd).toFixed(4));
  const diffCostArs = Number((diffCostUsd * ARS_EXCHANGE_RATE).toFixed(2));
  let percentageChange = 0;
  if (previousMonthUsage.totalCostUsd > 0) {
    percentageChange = Number((((currentMonthUsage.totalCostUsd - previousMonthUsage.totalCostUsd) / previousMonthUsage.totalCostUsd) * 100).toFixed(1));
  } else if (currentMonthUsage.totalCostUsd > 0) {
    percentageChange = 100;
  }

  const totalHistoricalCalls = logs.length;
  const totalHistoricalCostUsd = Number(logs.reduce((acc, l) => acc + (l.estimatedCostUsd || 0), 0).toFixed(4));

  return {
    currentMonth: currentMonthUsage,
    previousMonth: previousMonthUsage,
    comparison: {
      percentageChange,
      diffCostUsd,
      diffCostArs,
      isHigher: diffCostUsd >= 0,
    },
    exchangeRateArs: ARS_EXCHANGE_RATE,
    recentLogs: logs.slice(0, 100),
    totalHistoricalCalls,
    totalHistoricalCostUsd,
  };
}

/**
 * Resets / Clears the API usage logs collection in Cloud Firestore
 */
export async function clearCentralApiUsageLogs(): Promise<boolean> {
  try {
    const logsCol = collection(db, API_USAGE_COLLECTION);
    const snap = await getDocs(logsCol);

    const batch = writeBatch(db);
    snap.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();

    // Also notify server backend
    fetch('/api/system/clear-logs', { method: 'POST' }).catch(() => {});

    return true;
  } catch (e) {
    console.error('[ApiUsageLogger] Error clearing API logs in Firestore:', e);
    return false;
  }
}
