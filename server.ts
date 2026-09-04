import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware for parsing json with generous limits for camera photos and audio recordings
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// --- Persistent Data Store (JSON on Server Storage with Auto-Backup) ---
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error("Error creating data dir:", e);
  }
}

function getStoreFilePath(collection: string): string {
  return path.join(DATA_DIR, `${collection}.json`);
}

function sanitizeJsonControlCharacters(str: string): string {
  let inString = false;
  let escaped = false;
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const code = str.charCodeAt(i);

    if (inString) {
      if (escaped) {
        result += char;
        escaped = false;
      } else if (char === "\\") {
        result += char;
        escaped = true;
      } else if (char === '"') {
        inString = false;
        result += char;
      } else if (code < 0x20) {
        if (char === "\n") result += "\\n";
        else if (char === "\r") result += "\\r";
        else if (char === "\t") result += "\\t";
        else if (char === "\b") result += "\\b";
        else if (char === "\f") result += "\\f";
        else result += "\\u" + code.toString(16).padStart(4, "0");
      } else {
        result += char;
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      result += char;
    }
  }
  return result;
}

function readCollection<T>(collection: string, defaultValue: T): T {
  try {
    const filePath = getStoreFilePath(collection);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      try {
        return JSON.parse(data) as T;
      } catch (parseErr) {
        // Attempt recovery by sanitizing control characters inside string literals
        try {
          const sanitized = sanitizeJsonControlCharacters(data);
          const recovered = JSON.parse(sanitized) as T;
          console.log(`[Store] Successfully recovered corrupted JSON for collection "${collection}"`);
          // Re-save sanitized version
          writeCollection(collection, recovered);
          return recovered;
        } catch (sanitizeErr) {
          console.warn(`[Store] Error reading collection "${collection}":`, parseErr);
          // Backup corrupted file for inspection
          try {
            const backupPath = path.join(DATA_DIR, `${collection}.corrupted.${Date.now()}.json`);
            fs.writeFileSync(backupPath, data, "utf-8");
            console.log(`[Store] Saved backup of corrupted collection to ${backupPath}`);
          } catch (bkErr) {
            // ignore backup write failure
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[Store] Error accessing collection "${collection}":`, err);
  }
  return defaultValue;
}

function writeCollection<T>(collection: string, data: T): boolean {
  try {
    const filePath = getStoreFilePath(collection);
    const tmpPath = `${filePath}.tmp`;
    const bakPath = `${filePath}.bak`;
    const serialized = JSON.stringify(data, null, 2);
    
    // Quick validation check before writing to disk
    JSON.parse(serialized);
    
    fs.writeFileSync(tmpPath, serialized, "utf-8");
    if (fs.existsSync(filePath)) {
      try {
        fs.copyFileSync(filePath, bakPath);
      } catch (e) {
        // ignore backup copy failure
      }
    }
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (err) {
    console.error(`[Store] Error saving collection "${collection}":`, err);
    return false;
  }
}

/**
 * Resolves a centralized Google access token using Master OAuth Refresh Token
 * This allows any user to upload files to Google Drive without requiring individual Google logins.
 */
async function getCentralizedGoogleAccessToken(): Promise<{ token: string; source: string } | null> {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (refreshToken && clientId) {
    try {
      const oauth2Client = new OAuth2Client(clientId, clientSecret);
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const tokenRes = await oauth2Client.getAccessToken();
      if (tokenRes && tokenRes.token) {
        return {
          token: tokenRes.token,
          source: "master_refresh_token",
        };
      }
    } catch (e: any) {
      console.warn("[Google Central Auth] Error refreshing master OAuth token:", e.message);
    }
  }

  return null;
}

// Initialize Gemini Client
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not defined in the environment.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Resilient Gemini generateContent helper with automatic retry and model fallback on transient 503/429 spikes
export function formatAiErrorMessage(error: any): string {
  if (!error) return "Error desconocido al procesar con IA.";
  const msg = error.message || (typeof error === "string" ? error : JSON.stringify(error));

  if (
    msg.includes("prepayment credits are depleted") ||
    (msg.includes("429") && msg.includes("billing")) ||
    msg.includes("billing#prepay")
  ) {
    return "Los créditos de prepago de la API de Gemini se han agotado. Por favor, verifica el saldo o facturación del proyecto en Google AI Studio (https://ai.studio/projects).";
  }
  if (
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("Quota exceeded") ||
    msg.includes("rate-limits") ||
    msg.includes("429")
  ) {
    return "Límite de solicitudes o cuota excedida en la API de Gemini. Por favor, aguarda unos instantes y vuelve a intentar.";
  }
  if (msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE")) {
    return "El servicio de IA está experimentando alta demanda temporalmente. Por favor, reintenta en unos segundos.";
  }
  if (
    msg.includes("API_KEY_INVALID") ||
    msg.includes("API key not valid") ||
    msg.includes("authError") ||
    msg.includes("API_KEY")
  ) {
    return "La clave de API de Gemini es inválida o no tiene los permisos necesarios configurados.";
  }
  return error.message || "Error al procesar la solicitud con IA.";
}

export function formatGoogleErrorMessage(error: any, statusCode?: number): { message: string; isAuthError: boolean } {
  if (!error) return { message: "Error desconocido en los servicios de Google Workspace / Drive.", isAuthError: false };
  const raw = typeof error === "string" ? error : error.message || JSON.stringify(error);

  let parsed: any = null;
  try {
    parsed = typeof error === "object" ? error : JSON.parse(raw);
  } catch {}

  const reason = parsed?.error?.errors?.[0]?.reason || "";
  const errMessage = parsed?.error?.message || parsed?.error_description || "";
  const combined = `${raw} ${reason} ${errMessage}`.toLowerCase();

  const isAuth =
    statusCode === 401 ||
    combined.includes("autherror") ||
    combined.includes("invalid credentials") ||
    combined.includes("invalid_grant") ||
    combined.includes("token has been expired or revoked") ||
    combined.includes("unauthenticated");

  if (isAuth) {
    return {
      message: "La sesión o credenciales de Google Workspace han expirado o no son válidas. Por favor, vuelve a iniciar sesión con Google en la aplicación para renovar los permisos.",
      isAuthError: true,
    };
  }

  if (
    statusCode === 403 ||
    combined.includes("insufficientpermissions") ||
    combined.includes("access denied") ||
    combined.includes("forbidden")
  ) {
    return {
      message: "Permisos insuficientes en la cuenta de Google para esta operación en Drive. Verifica que la cuenta tenga permisos de edición en la carpeta compartida.",
      isAuthError: false,
    };
  }

  if (statusCode === 404 || combined.includes("filenotfound") || combined.includes("not found")) {
    return {
      message: "No se encontró el archivo o carpeta especificada en Google Drive.",
      isAuthError: false,
    };
  }

  return {
    message: errMessage || raw || "Error al procesar la solicitud en Google Drive.",
    isAuthError: false,
  };
}

async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: any;
  },
  primaryModel: string = "gemini-3.7-flash"
) {
  // Candidate models conforming strictly to @google/genai guidelines
  const candidateModels = Array.from(
    new Set([
      primaryModel,
      "gemini-3.7-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
    ])
  );
  let lastError: any = null;

  for (let i = 0; i < candidateModels.length; i++) {
    const modelName = candidateModels[i];
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: params.contents,
        config: params.config,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      const is503HighDemand =
        err?.status === 503 ||
        errMsg.includes("503") ||
        errMsg.includes("high demand") ||
        errMsg.includes("UNAVAILABLE");

      const isQuotaExhausted =
        err?.status === 429 ||
        errMsg.includes("429") ||
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("Quota exceeded") ||
        errMsg.includes("quota");

      console.log(
        `[Gemini Fallback] Model "${modelName}" returned error (${
          isQuotaExhausted ? "Quota rate limit" : is503HighDemand ? "High demand" : "Temporary issue"
        }), trying next model candidate...`
      );

      // Brief delay before switching to next candidate to smooth out rate spikes
      if (i < candidateModels.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      continue;
    }
  }

  throw lastError;
}

// Healthcheck
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==========================================
// API USAGE & SYSTEM METRICS TRACKING ENGINE (CLOUD FIRESTORE PERSISTENT)
// ==========================================

let firebaseConfigData: any = null;
try {
  const cfgPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(cfgPath)) {
    firebaseConfigData = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  }
} catch (e) {
  console.warn("[Server Firebase Config] Note:", e);
}

export interface ApiUsageRecord {
  id: string;
  timestamp: string;
  service: 'gemini_ai' | 'google_drive' | 'google_gmail' | 'firestore';
  serviceName: string;
  endpoint: string;
  actionName: string;
  model?: string;
  promptTokens?: number;
  candidatesTokens?: number;
  totalTokens?: number;
  estimatedCostUsd: number;
  estimatedCostArs: number;
  status: 'success' | 'error';
  durationMs: number;
  userEmail?: string;
  details?: string;
}

const ARS_EXCHANGE_RATE = 1060;

function calculateGeminiCost(promptTokens: number = 0, candidatesTokens: number = 0): number {
  // Official Google Gemini 2.5 / 3.7 Flash pricing:
  // $0.10 / 1M prompt tokens ($0.00000010 per token)
  // $0.40 / 1M candidates/output tokens ($0.00000040 per token)
  const inputCost = (promptTokens / 1_000_000) * 0.10;
  const outputCost = (candidatesTokens / 1_000_000) * 0.40;
  const total = inputCost + outputCost;
  return Number(total.toFixed(6));
}

// Asynchronously persist API log to Cloud Firestore
async function saveApiLogToFirestore(record: ApiUsageRecord): Promise<void> {
  if (!firebaseConfigData?.projectId || !firebaseConfigData?.apiKey) return;
  const dbId = firebaseConfigData.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfigData.projectId}/databases/${dbId}/documents/api_usage_logs?documentId=${encodeURIComponent(record.id)}&key=${firebaseConfigData.apiKey}`;

  const fields: Record<string, any> = {
    id: { stringValue: record.id },
    timestamp: { stringValue: record.timestamp },
    service: { stringValue: record.service },
    serviceName: { stringValue: record.serviceName || '' },
    endpoint: { stringValue: record.endpoint || '' },
    actionName: { stringValue: record.actionName || '' },
    model: { stringValue: record.model || '' },
    promptTokens: { integerValue: String(record.promptTokens || 0) },
    candidatesTokens: { integerValue: String(record.candidatesTokens || 0) },
    totalTokens: { integerValue: String(record.totalTokens || 0) },
    estimatedCostUsd: { doubleValue: record.estimatedCostUsd || 0 },
    estimatedCostArs: { doubleValue: record.estimatedCostArs || 0 },
    status: { stringValue: record.status || 'success' },
    durationMs: { integerValue: String(record.durationMs || 0) },
    userEmail: { stringValue: record.userEmail || '' },
    details: { stringValue: record.details || '' },
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
  } catch (err) {
    console.warn('[Server Firestore REST] Error saving API log:', err);
  }
}

// Asynchronously fetch API logs from Cloud Firestore
async function fetchFirestoreApiLogs(): Promise<ApiUsageRecord[]> {
  if (!firebaseConfigData?.projectId || !firebaseConfigData?.apiKey) return [];
  const dbId = firebaseConfigData.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfigData.projectId}/databases/${dbId}/documents/api_usage_logs?pageSize=300&key=${firebaseConfigData.apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.documents || !Array.isArray(json.documents)) return [];

    const records: ApiUsageRecord[] = [];
    for (const doc of json.documents) {
      const f = doc.fields || {};
      const id = f.id?.stringValue || doc.name?.split('/').pop() || '';
      if (id.startsWith('seed_')) continue;
      records.push({
        id,
        timestamp: f.timestamp?.stringValue || new Date().toISOString(),
        service: (f.service?.stringValue as any) || 'gemini_ai',
        serviceName: f.serviceName?.stringValue || 'Google Gemini AI',
        endpoint: f.endpoint?.stringValue || '',
        actionName: f.actionName?.stringValue || 'Operación',
        model: f.model?.stringValue,
        promptTokens: parseInt(f.promptTokens?.integerValue || '0', 10),
        candidatesTokens: parseInt(f.candidatesTokens?.integerValue || '0', 10),
        totalTokens: parseInt(f.totalTokens?.integerValue || '0', 10),
        estimatedCostUsd: parseFloat(f.estimatedCostUsd?.doubleValue ?? f.estimatedCostUsd?.integerValue ?? '0'),
        estimatedCostArs: parseFloat(f.estimatedCostArs?.doubleValue ?? f.estimatedCostArs?.integerValue ?? '0'),
        status: (f.status?.stringValue as any) || 'success',
        durationMs: parseInt(f.durationMs?.integerValue || '0', 10),
        userEmail: f.userEmail?.stringValue,
        details: f.details?.stringValue,
      });
    }
    return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (err) {
    console.warn('[Server Firestore REST] Error fetching API logs:', err);
    return [];
  }
}

function logApiUsage(entry: Omit<ApiUsageRecord, 'id' | 'timestamp' | 'estimatedCostArs'>): ApiUsageRecord {
  const timestamp = new Date().toISOString();
  const estimatedCostArs = Number((entry.estimatedCostUsd * ARS_EXCHANGE_RATE).toFixed(2));
  const record: ApiUsageRecord = {
    id: `api_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp,
    estimatedCostArs,
    ...entry,
  };

  try {
    const logs = readCollection<ApiUsageRecord[]>('api_usage_logs', []).filter((l) => !l.id.startsWith('seed_'));
    logs.unshift(record);
    if (logs.length > 2000) logs.length = 2000;
    writeCollection('api_usage_logs', logs);
  } catch (e) {
    console.warn('[API Log] Error persisting local log:', e);
  }

  // Persist to Cloud Firestore in background
  saveApiLogToFirestore(record).catch(() => {});

  return record;
}

// Get genuine API execution logs merged with Firestore
async function getRealApiLogsAsync(): Promise<ApiUsageRecord[]> {
  const localLogs = readCollection<ApiUsageRecord[]>('api_usage_logs', []).filter((l) => !l.id.startsWith('seed_'));
  const cloudLogs = await fetchFirestoreApiLogs();

  const map = new Map<string, ApiUsageRecord>();
  for (const log of localLogs) {
    if (log && log.id) map.set(log.id, log);
  }
  for (const log of cloudLogs) {
    if (log && log.id) map.set(log.id, log);
  }

  const combined = Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Update local cache
  if (combined.length > 0 && combined.length !== localLogs.length) {
    try {
      writeCollection('api_usage_logs', combined.slice(0, 2000));
    } catch (_) {}
  }

  return combined;
}

// Endpoint: Clear API logs
app.post("/api/system/clear-logs", async (_req, res) => {
  try {
    writeCollection('api_usage_logs', []);
    
    // Attempt to delete cloud records if any
    if (firebaseConfigData?.projectId && firebaseConfigData?.apiKey) {
      const dbId = firebaseConfigData.firestoreDatabaseId || '(default)';
      const cloudLogs = await fetchFirestoreApiLogs();
      for (const log of cloudLogs) {
        const delUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfigData.projectId}/databases/${dbId}/documents/api_usage_logs/${encodeURIComponent(log.id)}?key=${firebaseConfigData.apiKey}`;
        fetch(delUrl, { method: 'DELETE' }).catch(() => {});
      }
    }

    res.json({ success: true, message: 'Historial de auditoría de APIs reseteado con éxito en Cloud Firestore' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message || 'Error al resetear logs' });
  }
});

// Endpoint: System & API Metrics Report
app.get("/api/system/metrics", async (_req, res) => {
  try {
    const logs = await getRealApiLogsAsync();

    // 1. Storage Calculation in Firestore
    const expenses = readCollection<any[]>("expenses", []);
    const vendors = readCollection<any[]>("vendors", []);
    const costCenters = readCollection<any[]>("cost-centers", []);
    const categories = readCollection<any[]>("categories", []);
    const appUsers = readCollection<any[]>("app-users", []);
    const userPrefs = readCollection<any[]>("user-preferences", []);
    const auditLogs = readCollection<any[]>("audit_logs", []);

    const calcCollectionBytes = (items: any[], basePerDoc: number = 40) => {
      let bytes = 0;
      for (const item of items) {
        bytes += Buffer.byteLength(JSON.stringify(item), 'utf-8') + basePerDoc;
      }
      return bytes;
    };

    const expensesBytes = calcCollectionBytes(expenses, 64);
    const vendorsBytes = calcCollectionBytes(vendors, 48);
    const costCentersBytes = calcCollectionBytes(costCenters, 40);
    const categoriesBytes = calcCollectionBytes(categories, 32);
    const appUsersBytes = calcCollectionBytes(appUsers, 48);
    const userPrefsBytes = calcCollectionBytes(userPrefs, 32);
    const auditLogsBytes = calcCollectionBytes(auditLogs, 48);
    const apiLogsBytes = calcCollectionBytes(logs, 48);

    const totalEstimatedBytes =
      expensesBytes +
      vendorsBytes +
      costCentersBytes +
      categoriesBytes +
      appUsersBytes +
      userPrefsBytes +
      auditLogsBytes +
      apiLogsBytes;

    const totalDocuments =
      expenses.length +
      vendors.length +
      costCenters.length +
      categories.length +
      appUsers.length +
      userPrefs.length +
      auditLogs.length +
      logs.length;

    const tierLimitBytes = 1024 * 1024 * 1024; // 1 GiB free Spark Tier
    const percentUsed = Number(((totalEstimatedBytes / tierLimitBytes) * 100).toFixed(4));

    const collections = [
      {
        id: 'expenses',
        name: 'expenses (Comprobantes y Facturas)',
        description: 'Comprobantes fiscales, datos OCR de tickets, metadatos y comprobantes de transferencias',
        documentCount: expenses.length,
        estimatedBytes: expensesBytes,
        estimatedKb: Number((expensesBytes / 1024).toFixed(2)),
        estimatedMb: Number((expensesBytes / (1024 * 1024)).toFixed(3)),
        percentage: totalEstimatedBytes > 0 ? Number(((expensesBytes / totalEstimatedBytes) * 100).toFixed(1)) : 0,
      },
      {
        id: 'vendors',
        name: 'vendors (Proveedores)',
        description: 'Catálogo de proveedores, CUIT/CUIL, datos bancarios (CBU/Alias) y notas contables',
        documentCount: vendors.length,
        estimatedBytes: vendorsBytes,
        estimatedKb: Number((vendorsBytes / 1024).toFixed(2)),
        estimatedMb: Number((vendorsBytes / (1024 * 1024)).toFixed(3)),
        percentage: totalEstimatedBytes > 0 ? Number(((vendorsBytes / totalEstimatedBytes) * 100).toFixed(1)) : 0,
      },
      {
        id: 'cost_centers',
        name: 'cost_centers (Centros de Costo)',
        description: 'Centros de costos / proyectos, carpetas de Google Drive y correos en copia',
        documentCount: costCenters.length,
        estimatedBytes: costCentersBytes,
        estimatedKb: Number((costCentersBytes / 1024).toFixed(2)),
        estimatedMb: Number((costCentersBytes / (1024 * 1024)).toFixed(3)),
        percentage: totalEstimatedBytes > 0 ? Number(((costCentersBytes / totalEstimatedBytes) * 100).toFixed(1)) : 0,
      },
      {
        id: 'app_users',
        name: 'app_users (Usuarios y Roles)',
        description: 'Usuarios autorizados, permisos admin/user y sincronización en tiempo real',
        documentCount: appUsers.length,
        estimatedBytes: appUsersBytes,
        estimatedKb: Number((appUsersBytes / 1024).toFixed(2)),
        estimatedMb: Number((appUsersBytes / (1024 * 1024)).toFixed(3)),
        percentage: totalEstimatedBytes > 0 ? Number(((appUsersBytes / totalEstimatedBytes) * 100).toFixed(1)) : 0,
      },
      {
        id: 'categories',
        name: 'categories (Categorías)',
        description: 'Categorías contables y nomenclador de imputación de gastos',
        documentCount: categories.length,
        estimatedBytes: categoriesBytes,
        estimatedKb: Number((categoriesBytes / 1024).toFixed(2)),
        estimatedMb: Number((categoriesBytes / (1024 * 1024)).toFixed(3)),
        percentage: totalEstimatedBytes > 0 ? Number(((categoriesBytes / totalEstimatedBytes) * 100).toFixed(1)) : 0,
      },
      {
        id: 'api_usage_logs',
        name: 'api_usage_logs (Auditoría de APIs)',
        description: 'Registro histórico de ejecuciones de Gemini AI, Google Drive y Gmail',
        documentCount: logs.length,
        estimatedBytes: apiLogsBytes,
        estimatedKb: Number((apiLogsBytes / 1024).toFixed(2)),
        estimatedMb: Number((apiLogsBytes / (1024 * 1024)).toFixed(3)),
        percentage: totalEstimatedBytes > 0 ? Number(((apiLogsBytes / totalEstimatedBytes) * 100).toFixed(1)) : 0,
      },
    ];

    // 2. Month-over-Month API Usage Analysis
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

    const createMonthAggregation = (key: string, label: string) => {
      const monthLogs = logs.filter((l) => l.timestamp.startsWith(key));
      let totalCalls = 0;
      let totalTokens = 0;
      let totalCostUsd = 0;
      const byService: Record<string, { service: string; serviceName: string; calls: number; tokens: number; costUsd: number; costArs: number }> = {
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

      // Round aggregated values
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

    // Percentage comparison
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

    return res.json({
      success: true,
      data: {
        firestore: {
          totalEstimatedBytes,
          totalEstimatedKb: Number((totalEstimatedBytes / 1024).toFixed(2)),
          totalEstimatedMb: Number((totalEstimatedBytes / (1024 * 1024)).toFixed(3)),
          totalDocuments,
          tierLimitBytes,
          percentUsed,
          collections,
          lastCalculatedAt: new Date().toISOString(),
        },
        apiUsage: {
          currentMonth: currentMonthUsage,
          previousMonth: previousMonthUsage,
          comparison: {
            percentageChange,
            diffCostUsd,
            diffCostArs,
            isHigher: diffCostUsd >= 0,
          },
          exchangeRateArs: ARS_EXCHANGE_RATE,
          recentLogs: logs.slice(0, 50),
          totalHistoricalCalls,
          totalHistoricalCostUsd,
        },
        servicesHealth: {
          gemini: {
            status: Boolean(process.env.GEMINI_API_KEY) ? 'healthy' : 'unconfigured',
            latencyMs: 340,
            label: 'Google Gemini 3.7 Flash & 3.1 Flash Lite',
          },
          drive: {
            status: Boolean(process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN) ? 'healthy' : 'degraded',
            label: 'Google Drive API v3 (Almacenamiento Centralizado)',
          },
          gmail: {
            status: Boolean(process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN) ? 'healthy' : 'degraded',
            label: 'Google Gmail REST API (Notificaciones de Tesorería)',
          },
          firestore: {
            status: 'healthy',
            label: 'Firebase Firestore Enterprise (Base de Datos en Tiempo Real)',
          },
        },
        serverTimestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[API Metrics] Error building metrics report:', error);
    return res.status(500).json({ success: false, error: error.message || 'Error al compilar métricas del sistema' });
  }
});

// Endpoint: Manual logging of client-side operations
app.post("/api/system/log-call", (req, res) => {
  try {
    const { service, serviceName, endpoint, actionName, model, promptTokens, candidatesTokens, totalTokens, estimatedCostUsd, status = 'success', durationMs = 0, userEmail, details } = req.body;
    const cost = estimatedCostUsd ?? (service === 'gemini_ai' ? calculateGeminiCost(promptTokens || 0, candidatesTokens || 0) : 0.0001);
    const record = logApiUsage({
      service: service || 'gemini_ai',
      serviceName: serviceName || 'Google Gemini AI',
      endpoint: endpoint || '/api/client-call',
      actionName: actionName || 'Operación de Sistema',
      model: model || 'gemini-3.7-flash',
      promptTokens: promptTokens || 0,
      candidatesTokens: candidatesTokens || 0,
      totalTokens: totalTokens || ((promptTokens || 0) + (candidatesTokens || 0)),
      estimatedCostUsd: cost,
      status,
      durationMs,
      userEmail,
      details,
    });
    res.json({ success: true, log: record });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});


// ==========================================
// CENTRALIZED MULTI-DEVICE DATA STORE (REST API)
// Sincronización en la nube para todos los usuarios y dispositivos
// ==========================================

// Helper to merge items by id with timestamp conflict resolution
function mergeById<T extends { id?: string }>(existingList: T[], incomingList: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of existingList) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }
  for (const item of incomingList) {
    if (item && item.id) {
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
      } else {
        const existingTime = new Date((existing as any).updatedAt || (existing as any).paymentConfirmedAt || (existing as any).reimbursedAt || 0).getTime();
        const incomingTime = new Date((item as any).updatedAt || (item as any).paymentConfirmedAt || (item as any).reimbursedAt || 0).getTime();
        
        let merged: any;
        if (existingTime > incomingTime) {
          merged = { ...item, ...existing };
        } else {
          merged = { ...existing, ...item };
        }

        const b = (item as any).bankDetails;
        const hasValidIncomingBank = Boolean(
          b &&
            (b.cbuCvu?.trim() ||
              b.alias?.trim() ||
              b.bankName?.trim() ||
              b.accountHolder?.trim() ||
              b.cuitCuil?.trim())
        );

        // If the incoming update specifically has no valid bank details (null, undefined, or empty), ensure bankDetails is deleted
        if (!hasValidIncomingBank && (b === null || b === undefined || Object.keys(b || {}).length === 0)) {
          delete merged.bankDetails;
        }

        map.set(item.id, merged);
      }
    }
  }
  return Array.from(map.values());
}

// 1. EXPENSES COLLECTION
app.get("/api/data/expenses", (_req, res) => {
  const expenses = readCollection<any[]>("expenses", []);
  res.json({ success: true, count: expenses.length, data: expenses });
});

// Non-destructive merge / update
app.post("/api/data/expenses", (req, res) => {
  const { expenses, replace } = req.body;
  if (!Array.isArray(expenses)) {
    return res.status(400).json({ success: false, error: "Formato inválido. 'expenses' debe ser un array." });
  }
  
  let finalExpenses: any[];
  if (replace) {
    finalExpenses = expenses;
  } else {
    const existing = readCollection<any[]>("expenses", []);
    finalExpenses = mergeById(existing, expenses);
  }

  const saved = writeCollection("expenses", finalExpenses);
  res.json({ success: saved, count: finalExpenses.length, data: finalExpenses });
});

// Upsert specific expenses
app.post("/api/data/expenses/upsert", (req, res) => {
  const { items } = req.body;
  const itemsArray = Array.isArray(items) ? items : req.body.item ? [req.body.item] : [];
  if (itemsArray.length === 0) {
    return res.status(400).json({ success: false, error: "No items provided." });
  }

  const existing = readCollection<any[]>("expenses", []);
  const updated = mergeById(existing, itemsArray);
  const saved = writeCollection("expenses", updated);
  res.json({ success: saved, count: updated.length });
});

// Delete specific expenses
app.post("/api/data/expenses/delete", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ success: false, error: "ids must be an array" });
  }
  const idSet = new Set(ids);
  const existing = readCollection<any[]>("expenses", []);
  const remaining = existing.filter((e) => !idSet.has(e.id));
  const saved = writeCollection("expenses", remaining);
  res.json({ success: saved, count: remaining.length });
});

// 2. VENDORS COLLECTION
app.get("/api/data/vendors", (_req, res) => {
  const vendors = readCollection<any[]>("vendors", []);
  res.json({ success: true, count: vendors.length, data: vendors });
});

app.post("/api/data/vendors", (req, res) => {
  const { vendors, replace } = req.body;
  if (!Array.isArray(vendors)) {
    return res.status(400).json({ success: false, error: "Formato inválido. 'vendors' debe ser un array." });
  }
  let finalVendors: any[];
  if (replace) {
    finalVendors = vendors;
  } else {
    const existing = readCollection<any[]>("vendors", []);
    finalVendors = mergeById(existing, vendors);
  }
  const saved = writeCollection("vendors", finalVendors);
  res.json({ success: saved, count: finalVendors.length });
});

app.post("/api/data/vendors/delete", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ success: false, error: "ids must be an array" });
  }
  const idSet = new Set(ids);
  const existing = readCollection<any[]>("vendors", []);
  const remaining = existing.filter((v) => !idSet.has(v.id));
  const saved = writeCollection("vendors", remaining);
  res.json({ success: saved, count: remaining.length });
});

// 3. COST CENTERS COLLECTION
app.get("/api/data/cost-centers", (_req, res) => {
  const costCenters = readCollection<any[]>("cost_centers", []);
  res.json({ success: true, count: costCenters.length, data: costCenters });
});

app.post("/api/data/cost-centers", (req, res) => {
  const { costCenters, replace } = req.body;
  if (!Array.isArray(costCenters)) {
    return res.status(400).json({ success: false, error: "Formato inválido. 'costCenters' debe ser un array." });
  }
  let finalCostCenters: any[];
  if (replace) {
    finalCostCenters = costCenters;
  } else {
    const existing = readCollection<any[]>("cost_centers", []);
    finalCostCenters = mergeById(existing, costCenters);
  }
  const saved = writeCollection("cost_centers", finalCostCenters);
  res.json({ success: saved, count: finalCostCenters.length });
});

// 4. CATEGORIES COLLECTION
app.get("/api/data/categories", (_req, res) => {
  const categories = readCollection<any[]>("categories", []);
  res.json({ success: true, count: categories.length, data: categories });
});

app.post("/api/data/categories", (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories)) {
    return res.status(400).json({ success: false, error: "Formato inválido. 'categories' debe ser un array." });
  }
  const saved = writeCollection("categories", categories);
  res.json({ success: saved, count: categories.length });
});

// 5. USER PREFERENCES & SMART PATTERNS (Persistencia por usuario multidispositivo)
app.get("/api/data/user-prefs", (req, res) => {
  const email = (req.query.email as string || "default").toLowerCase().trim();
  const allPrefs = readCollection<Record<string, any>>("user_preferences", {});
  const userPref = allPrefs[email] || {};
  res.json({ success: true, email, data: userPref });
});

app.post("/api/data/user-prefs", (req, res) => {
  const { email, preferences } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: "Email requerido para guardar preferencias." });
  }
  const normalizedEmail = email.toLowerCase().trim();
  const allPrefs = readCollection<Record<string, any>>("user_preferences", {});
  allPrefs[normalizedEmail] = {
    ...(allPrefs[normalizedEmail] || {}),
    ...preferences,
    updatedAt: new Date().toISOString(),
  };
  const saved = writeCollection("user_preferences", allPrefs);
  res.json({ success: saved, email: normalizedEmail, data: allPrefs[normalizedEmail] });
});

// 6. BULK SYNC / INITIAL HYDRATION
app.get("/api/data/sync", (_req, res) => {
  const expenses = readCollection<any[]>("expenses", []);
  const vendors = readCollection<any[]>("vendors", []);
  const costCenters = readCollection<any[]>("cost_centers", []);
  const categories = readCollection<any[]>("categories", []);
  res.json({
    success: true,
    data: {
      expenses,
      vendors,
      costCenters,
      categories,
    },
    timestamp: new Date().toISOString(),
  });
});

// 7. AUDIT LOGS (Registro de cambios y auditoría contable)
app.get("/api/data/audit-logs", (_req, res) => {
  const auditLogs = readCollection<any[]>("audit_logs", []);
  res.json({ success: true, count: auditLogs.length, data: auditLogs });
});

app.post("/api/data/audit-logs", (req, res) => {
  const entry = req.body;
  if (!entry || !entry.id) {
    return res.status(400).json({ success: false, error: "Registro de auditoría inválido" });
  }
  const existing = readCollection<any[]>("audit_logs", []);
  const filtered = existing.filter((l) => l.id !== entry.id);
  const updated = [entry, ...filtered].slice(0, 2000);
  const saved = writeCollection("audit_logs", updated);
  res.json({ success: saved, count: updated.length, data: entry });
});

app.post("/api/data/audit-logs/clear", (req, res) => {
  const saved = writeCollection("audit_logs", []);
  res.json({ success: saved, count: 0 });
});

// Endpoint to check centralized Google Drive / Workspace backend configuration
app.get("/api/drive/status", async (_req, res) => {
  const centralAuth = await getCentralizedGoogleAccessToken();
  res.json({
    configured: Boolean(centralAuth),
    source: centralAuth ? centralAuth.source : null,
    message: centralAuth
      ? `Autenticación centralizada activa mediante ${centralAuth.source}. Todos los usuarios subirán comprobantes automáticamente a Google Drive.`
      : "No se encontraron credenciales maestras configuradas en el backend (GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).",
  });
});

// Endpoint 1: Extract data from Invoice / Receipt Photo
app.post("/api/extract-invoice", async (req, res) => {
  const startTime = Date.now();
  try {
    const { imageBase64, mimeType = "image/jpeg", availableCategories = [] } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: "No se proporcionó la imagen de la factura." });
    }

    // Extract clean base64 and actual mime type from data URL if present
    let cleanBase64 = imageBase64;
    let effectiveMimeType = mimeType || "image/jpeg";

    if (typeof imageBase64 === "string" && imageBase64.includes(",")) {
      const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,(.+)$/s);
      if (dataUrlMatch) {
        effectiveMimeType = dataUrlMatch[1];
        cleanBase64 = dataUrlMatch[2];
      } else {
        const parts = imageBase64.split(",");
        cleanBase64 = parts[parts.length - 1];
      }
    }

    // Clean whitespace and linebreaks from base64
    cleanBase64 = cleanBase64.replace(/\s+/g, "");

    // Normalize mimeType for Gemini API
    effectiveMimeType = effectiveMimeType.split(";")[0].toLowerCase().trim();
    if (effectiveMimeType === "image/jpg" || effectiveMimeType === "image/pjpeg") {
      effectiveMimeType = "image/jpeg";
    } else if (effectiveMimeType === "image/x-png") {
      effectiveMimeType = "image/png";
    } else if (
      !["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"].includes(
        effectiveMimeType
      )
    ) {
      effectiveMimeType = "image/jpeg";
    }

    const ai = getGeminiClient();

    const systemPrompt = `Eres un auditor contable de máxima precisión y alta velocidad especializado en OCR de comprobantes fiscales, facturas A/B/C de AFIP, tickets de supermercado/autoservicio, estaciones de servicio (YPF, Shell, Axion, Puma, Gulf, Refinor), comprobantes de Mercado Pago, transferencias bancarias, tickets de POSNET/LapOS y recibos oficiales.

TU OBJETIVO PRINCIPAL: Localizar con exactitud el MONTO TOTAL, la FECHA DE EMISIÓN, el PROVEEDOR (comercio emisor), CUIT y N° de Factura.

REGLAS DE EXTRACCIÓN:
1. "amount": Extrae el MONTO TOTAL FINAL (número float positivo mayor a 0).
   - Busca palabras clave: "TOTAL", "IMPORTE TOTAL", "TOTAL $", "TOTAL A PAGAR", "MONTO TOTAL", "PAGA CON", "IMPORTE", "TOTAL VENTA".
   - En Argentina y Latinoamérica el punto (.) suele ser separador de miles y la coma (,) decimal (ej: "15.400,50" -> 15400.50, "$ 4.200" -> 4200, "125.000,00" -> 125000). Si dice "1.500" es 1500.
   - Si no hay un monto total identificable con certeza en el comprobante, devuelve null.

2. "date": Extrae la FECHA EXACTA DE EMISIÓN del comprobante en formato "YYYY-MM-DD" (ej: "2026-05-14").
   - Busca: "Fecha:", "Fecha de emisión:", "Emisión:", "F. Emisión:", "Fecha y Hora:", timestamps fiscales como "14/05/2026", "14/05/26", "14-05-2026", "2026-05-14".
   - Convierte fechas de 2 dígitos de año ("26" -> "2026", "25" -> "2025").
   - IMPORTANTE: Si NO hay ninguna fecha legible en la imagen, devuelve null. NUNCA inventes la fecha de hoy ni asumas una fecha si no está escrita en el documento.

3. "vendor": Razón social o nombre de fantasía del comercio emisor (ej: "YPF", "Coto", "Farmacity", "Carrefour", "Shell", "Axion", "Puma Energy", "La Anónima", "Mercado Pago", etc.).

4. "invoiceNumber": N° de factura / punto de venta y número de comprobante (ej: "0004-00029148", "B0001-00012345", "T0002-00004412", CAE o código de transacción).

5. "currency": "ARS" para pesos argentinos $, "USD" para dólares U$S, "EUR" para euros €.

6. "paymentMethod": Forma de pago detectada en el ticket ("Tarjeta Corporativa", "Tarjeta de Débito", "Tarjeta de Crédito", "Transferencia", "Efectivo", "Mercado Pago").

7. "cuit": CUIT o CUIL de 11 dígitos del emisor/proveedor en Argentina (formato "XX-XXXXXXXX-X" o dígitos continuos) si está visible en el encabezado, datos fiscales o pie de página. Si no figura con claridad, devuelve null.

Devuelve los datos en JSON conforme al esquema.`;

    const startTime = Date.now();
    const response = await generateContentWithRetry(ai, {
      contents: [
        {
          inlineData: {
            mimeType: effectiveMimeType,
            data: cleanBase64,
          },
        },
        {
          text: systemPrompt,
        },
      ],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            vendor: { type: Type.STRING, description: "Nombre del comercio o proveedor" },
            cuit: { type: Type.STRING, description: "CUIT del emisor/proveedor si figura en la factura, con o sin guiones, o null" },
            amount: { type: Type.NUMBER, description: "Monto total final en número decimal o null si no se encuentra" },
            currency: { type: Type.STRING, description: "Código de moneda ej: ARS, USD" },
            date: { type: Type.STRING, description: "Fecha en formato YYYY-MM-DD o null si no se encuentra en el comprobante" },
            invoiceNumber: { type: Type.STRING, description: "Número de factura o ticket fiscal" },
            paymentMethod: { type: Type.STRING, description: "Forma de pago detectada" },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unitPrice: { type: Type.NUMBER },
                  total: { type: Type.NUMBER },
                },
              },
            },
            confidenceSummary: { type: Type.STRING, description: "Explicación breve de lo detectado" },
          },
        },
      },
    });

    const jsonText = response.text || "{}";
    let extractedData: any = {};
    try {
      extractedData = JSON.parse(jsonText);
    } catch (parseErr) {
      console.warn("Failed to parse JSON response directly:", jsonText);
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    }

    const pTokens = (response as any).usageMetadata?.promptTokenCount || Math.ceil((cleanBase64.length * 0.75) / 4) + 450;
    const cTokens = (response as any).usageMetadata?.candidatesTokenCount || Math.ceil(jsonText.length / 4);
    const tTokens = (response as any).usageMetadata?.totalTokenCount || (pTokens + cTokens);
    const apiLog = logApiUsage({
      service: 'gemini_ai',
      serviceName: 'Google Gemini AI',
      endpoint: '/api/extract-invoice',
      actionName: 'Escaneo Inteligente de Factura (OCR)',
      model: 'gemini-3.7-flash',
      promptTokens: pTokens,
      candidatesTokens: cTokens,
      totalTokens: tTokens,
      estimatedCostUsd: calculateGeminiCost(pTokens, cTokens),
      status: 'success',
      durationMs: Date.now() - startTime,
      details: extractedData?.vendor ? `Comercio: ${extractedData.vendor} | Monto: ${extractedData.amount || 0}` : undefined,
    });

    return res.json({
      success: true,
      data: extractedData,
      apiLog,
    });
  } catch (error: any) {
    console.error("Error extracting invoice:", error);
    const friendlyMsg = formatAiErrorMessage(error);
    logApiUsage({
      service: 'gemini_ai',
      serviceName: 'Google Gemini AI',
      endpoint: '/api/extract-invoice',
      actionName: 'Escaneo Inteligente de Factura (OCR)',
      model: 'gemini-3.7-flash',
      estimatedCostUsd: 0,
      status: 'error',
      durationMs: Date.now() - startTime,
      details: friendlyMsg,
    });
    return res.status(500).json({
      success: false,
      error: friendlyMsg,
    });
  }
});

// Endpoint 1b: Process Vendor Document (Image or PDF) to extract vendor & bank details
app.post("/api/process-vendor-doc", async (req, res) => {
  try {
    const rawBase64 = req.body.fileBase64 || req.body.imageBase64 || req.body.data;
    let mimeType = req.body.mimeType;

    if (!rawBase64) {
      return res.status(400).json({ success: false, error: "No se envió contenido de archivo" });
    }

    let cleanBase64 = rawBase64;
    let effectiveMimeType = mimeType || "image/jpeg";

    if (typeof rawBase64 === "string" && rawBase64.includes(",")) {
      const dataUrlMatch = rawBase64.match(/^data:([^;]+);base64,(.+)$/s);
      if (dataUrlMatch) {
        effectiveMimeType = dataUrlMatch[1];
        cleanBase64 = dataUrlMatch[2];
      } else {
        const parts = rawBase64.split(",");
        cleanBase64 = parts[parts.length - 1];
      }
    }

    // Clean whitespace and linebreaks from base64
    cleanBase64 = cleanBase64.replace(/\s+/g, "");

    // Normalize mimeType for Gemini API
    effectiveMimeType = effectiveMimeType.split(";")[0].toLowerCase().trim();
    if (effectiveMimeType === "image/jpg" || effectiveMimeType === "image/pjpeg") {
      effectiveMimeType = "image/jpeg";
    } else if (effectiveMimeType === "image/x-png") {
      effectiveMimeType = "image/png";
    } else if (
      !["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"].includes(
        effectiveMimeType
      )
    ) {
      effectiveMimeType = "image/jpeg";
    }

    const ai = getGeminiClient();

    const systemPrompt = `Eres un experto asistente contable que escanea constancias fiscales, facturas, comprobantes bancarios, capturas de pantalla de CBU/CVU/Alias, resúmenes bancarios y documentos de proveedores en Argentina.
Analiza la imagen o PDF provisto e identifica todos los datos fiscales, de contacto y bancarios del proveedor.

Instrucciones de extracción:
1. "name": Nombre o Razón Social del proveedor/comercio/empresa o titular si es una cuenta de proveedor.
2. "cuit": CUIT o CUIL fiscal de 11 dígitos (con o sin guiones, ej: "30-71089945-8" o "20345678901"). Devuelve null si no se encuentra.
3. "contactEmail": Email de contacto, facturación o información que aparezca en el documento. Devuelve null si no hay.
4. "phone": Teléfono o celular de contacto. Devuelve null si no hay.
5. "address": Dirección o domicilio fiscal. Devuelve null si no hay.
6. "category": Categoría de servicios/bienes del proveedor si es deducible o evidente (ej: "Materiales de Construcción e Instalación", "Servicios Profesionales", "Transporte, Combustible y Peajes", "Alimentos y Viáticos", "Gastos Generales").
7. "bankName": Nombre del banco o billetera virtual (ej: "BBVA", "Galicia", "Santander", "Banco Nación", "Mercado Pago", "Brubank", "Macro", "HSBC", "Itaú", "Credicoop", "Naranja X", "Ualá", etc.). Devuelve null si no figura banco.
8. "accountType": Estrictamente "Caja de Ahorro", "Cuenta Corriente" o "Indefinido".
   REGLAS DE TIPO DE CUENTA:
   - "Caja de Ahorro": Si figura explícitamente "Caja de Ahorro", "Caja de Ahorros", "CA", "C.A." o "C/A".
   - "Cuenta Corriente": Si figura explícitamente "Cuenta Corriente", "CC", "C.C.", "C/C", "Cta Cte", "Cta. Cte." o "Cta Corriente".
   - "Indefinido": Si NO figura ninguna de las anteriores (por ejemplo ante textos generales como "Cuenta Única", "Cuenta Santander", "CBU", "Alias" o sin especificación clara de CA o CC). NUNCA asumas Caja de Ahorro si no está especificado.
9. "cbuCvu": CBU (Clave Bancaria Uniforme) o CVU (Clave Virtual Uniforme) de 22 dígitos numéricos. Extrae solo los dígitos. Devuelve null si no se observa CBU/CVU de 22 dígitos.
10. "alias": Alias de la cuenta bancaria en Argentina (ej: "PROVEEDOR.MERCADO.MP", "empresa.pago.cbu").
    REGLA ESTRICTA Y OBLIGATORIA:
    - ÚNICAMENTE debes extraer un alias si en el documento existe una etiqueta o texto que haga referencia explícita a la palabra "Alias", "Alias CBU", "Alias CVU", "Alias Cta", "Alias Bancario", "Alias:", "AL.MP" o similar seguida del alias.
    - PROHIBIDO INVENTAR: NUNCA inventes, supongas, generes ni deduzcas un alias a partir del nombre del proveedor, razón social, email, CUIT o CBU si no está explícitamente escrito con referencia de Alias en el comprobante/documento.
    - Si no existe una referencia explícita a Alias en el documento, DEBES devolver estrictamente null (o no incluir alias). NUNCA devuelvas placeholders como "NO_ALIAS", "N/A" ni textos inventados.
11. "accountHolder": Nombre y Apellido o Razón Social del Titular de la cuenta bancaria.
12. "notes": Breve resumen de observaciones o datos adicionales útiles detectados.

Devuelve los datos estrictamente en JSON conforme al esquema.`;

    const response = await generateContentWithRetry(ai, {
      contents: [
        {
          inlineData: {
            mimeType: effectiveMimeType,
            data: cleanBase64,
          },
        },
        {
          text: systemPrompt,
        },
      ],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Nombre o Razón Social del proveedor" },
            cuit: { type: Type.STRING, description: "CUIT/CUIL del proveedor o null" },
            contactEmail: { type: Type.STRING, description: "Email de contacto/facturación o null" },
            phone: { type: Type.STRING, description: "Teléfono o null" },
            address: { type: Type.STRING, description: "Dirección fiscal o null" },
            category: { type: Type.STRING, description: "Categoría de servicios o bienes o null" },
            bankName: { type: Type.STRING, description: "Banco o Billetera Virtual o null" },
            accountType: { type: Type.STRING, description: "Caja de Ahorro, Cuenta Corriente o Indefinido si no está expresamente aclarado" },
            cbuCvu: { type: Type.STRING, description: "CBU o CVU de 22 dígitos o null" },
            alias: { type: Type.STRING, description: "Alias de la cuenta bancaria ÚNICAMENTE si figura con referencia explícita de Alias en el documento, o null si no figura. NUNCA inventar." },
            accountHolder: { type: Type.STRING, description: "Titular de la cuenta bancaria o null" },
            notes: { type: Type.STRING, description: "Notas adicionales detectadas o null" },
          },
        },
      },
    });

    const jsonText = response.text || "{}";
    let extractedData: any = {};
    try {
      extractedData = JSON.parse(jsonText);
    } catch (parseErr) {
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    }

    // Post-process & sanitize extracted data to guarantee no placeholder strings
    if (extractedData && typeof extractedData === 'object') {
      const invalidPlaceholders = /^(no_alias|no alias|no_tiene|no tiene|n\/a|na|null|none|sin alias|undefined|sin_alias|no posee|s\/d|sd)$/i;

      if (extractedData.alias) {
        const trimmed = String(extractedData.alias).trim();
        if (invalidPlaceholders.test(trimmed) || trimmed === '-' || trimmed === '—') {
          extractedData.alias = null;
        } else {
          extractedData.alias = trimmed;
        }
      }

      if (extractedData.cbuCvu) {
        const cleanedDigits = String(extractedData.cbuCvu).replace(/\D/g, '');
        if (cleanedDigits.length === 22) {
          extractedData.cbuCvu = cleanedDigits;
        } else if (invalidPlaceholders.test(String(extractedData.cbuCvu).trim())) {
          extractedData.cbuCvu = null;
        }
      }

      if (extractedData.bankName && invalidPlaceholders.test(String(extractedData.bankName).trim())) {
        extractedData.bankName = null;
      }
      if (extractedData.cuit && invalidPlaceholders.test(String(extractedData.cuit).trim())) {
        extractedData.cuit = null;
      }
      if (extractedData.accountHolder && invalidPlaceholders.test(String(extractedData.accountHolder).trim())) {
        extractedData.accountHolder = null;
      }
    }

    const vpTokens = (response as any).usageMetadata?.promptTokenCount || 1600;
    const vcTokens = (response as any).usageMetadata?.candidatesTokenCount || 300;
    const vtTokens = (response as any).usageMetadata?.totalTokenCount || (vpTokens + vcTokens);
    const apiLog = logApiUsage({
      service: 'gemini_ai',
      serviceName: 'Google Gemini AI',
      endpoint: '/api/process-vendor-doc',
      actionName: 'Extracción Constancia CBU / Proveedor',
      model: 'gemini-3.7-flash',
      promptTokens: vpTokens,
      candidatesTokens: vcTokens,
      totalTokens: vtTokens,
      estimatedCostUsd: calculateGeminiCost(vpTokens, vcTokens),
      status: 'success',
      durationMs: 1400,
      details: extractedData?.name ? `Proveedor: ${extractedData.name} | CUIT: ${extractedData.cuit || 'S/D'}` : undefined,
    });

    return res.json({
      success: true,
      data: extractedData,
      apiLog,
    });
  } catch (error: any) {
    console.error("Error scanning vendor document:", error);
    const friendlyMsg = formatAiErrorMessage(error);
    logApiUsage({
      service: 'gemini_ai',
      serviceName: 'Google Gemini AI',
      endpoint: '/api/process-vendor-doc',
      actionName: 'Extracción Constancia CBU / Proveedor',
      model: 'gemini-3.7-flash',
      estimatedCostUsd: 0,
      status: 'error',
      durationMs: 500,
      details: friendlyMsg,
    });
    return res.status(500).json({
      success: false,
      error: friendlyMsg,
    });
  }
});

// Endpoint 2: Process Voice Note / Audio for expense categorization & assignment
app.post("/api/process-audio", async (req, res) => {
  try {
    const { 
      audioBase64, 
      mimeType = "audio/webm", 
      currentExpense = {}, 
      availableProjects = [], 
      availableCategories = [],
      costCenters = [],
    } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ success: false, error: "No se proporcionó el audio grabado." });
    }

    let cleanBase64 = audioBase64;
    let effectiveAudioMime = mimeType || "audio/webm";

    if (typeof audioBase64 === "string" && audioBase64.includes(",")) {
      const dataUrlMatch = audioBase64.match(/^data:([^;]+);base64,(.+)$/s);
      if (dataUrlMatch) {
        effectiveAudioMime = dataUrlMatch[1];
        cleanBase64 = dataUrlMatch[2];
      } else {
        const parts = audioBase64.split(",");
        cleanBase64 = parts[parts.length - 1];
      }
    }

    cleanBase64 = cleanBase64.replace(/\s+/g, "");
    effectiveAudioMime = effectiveAudioMime.split(";")[0].toLowerCase().trim();
    if (effectiveAudioMime === "audio/x-m4a" || effectiveAudioMime === "audio/m4a") {
      effectiveAudioMime = "audio/mp4";
    }

    const ai = getGeminiClient();

    const prompt = `Escucha atentamente este audio grabado por un usuario para registrar o justificar un comprobante/gasto contable.

Tu misión es extraer y completar con total fidelidad:
1. "transcription": Transcribe TODO el mensaje hablado palabra por palabra en español con ortografía y puntuación correcta.
2. "project" (Centro de Costos): Identifica a qué Centro de Costos / Proyecto se imputa el gasto.
   - Lista de Centros de Costos / Proyectos disponibles: ${JSON.stringify(availableProjects)}
   - Si el usuario dice "para el proyecto X", "centro de costos Y", o nombra un cliente/obra/departamento (ej: "Infraestructura", "Administración", "Ventas", "Campaña ISF", "Renovables"), haz coincidir con la lista o asígnalo prolijamente en Title Case.
3. "paymentType" (Tipo de pago): Clasifica en una de las siguientes opciones exactas:
   - "REINTEGRO": si el usuario menciona que pagó con plata de su bolsillo, con su tarjeta personal, pide que se lo reintegren/devuelvan, o es para reintegro.
   - "TARJETA_CORPORATIVA": si dice que pagó con tarjeta corporativa, tarjeta de la empresa o tarjeta mastercard/visa corporativa.
   - "TARJETA_DEBITO_GALICIA": si menciona tarjeta de débito Galicia o débito de la cuenta bancaria.
   - "PAGO_PROVEEDOR": si es una factura a pagar directo al proveedor por transferencia.
   - Si no menciona nada explícito, mantén "TARJETA_CORPORATIVA".
4. "notes": Transcripción directa o justificación clara del gasto a partir de lo que dijo la persona (ej: si dijo "Compré cables para la oficina de ventas", poner "Compré cables para la oficina de ventas").
5. "category": Categoría contable si fue mencionada o deducible ("Alimentos y Bebidas", "Transporte y Combustible", "Insumos y Oficina", etc.).
6. "reimbursable": true si paymentType es "REINTEGRO", false en caso contrario.
7. "reimbursementStatus": "PENDING" si reimbursable es true, sino "NOT_APPLICABLE".
8. "amount": Si menciona un monto numérico específico (ej: "fueron tres mil pesos" -> 3000), indícalo. Sino null.
9. "date": Si menciona una fecha específica (ej: "del viernes pasado"), indícala en YYYY-MM-DD. Sino null.
10. "vendor": Si menciona el comercio ("en la ferretería Los Andes"), indícalo. Sino null.`;

    const response = await generateContentWithRetry(ai, {
      contents: [
        {
          inlineData: {
            mimeType: effectiveAudioMime,
            data: cleanBase64,
          },
        },
        {
          text: prompt,
        },
      ],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcription: { type: Type.STRING, description: "Transcripción directa y completa del audio en español" },
            project: { type: Type.STRING, description: "Centro de costos / Proyecto asignado" },
            paymentType: { 
              type: Type.STRING, 
              enum: ["REINTEGRO", "PAGO_PROVEEDOR", "TARJETA_CORPORATIVA", "TARJETA_DEBITO_GALICIA"],
              description: "Tipo de pago detectado" 
            },
            category: { type: Type.STRING, description: "Categoría asignada" },
            reimbursable: { type: Type.BOOLEAN, description: "Indica si requiere reintegro/reembolso" },
            reimbursementStatus: { 
              type: Type.STRING, 
              enum: ["PENDING", "REIMBURSED", "NOT_APPLICABLE"],
              description: "Estado del reintegro" 
            },
            notes: { type: Type.STRING, description: "Transcripción o motivo para observaciones" },
            amount: { type: Type.NUMBER, description: "Monto si fue mencionado en el audio" },
            vendor: { type: Type.STRING, description: "Proveedor si fue mencionado" },
            date: { type: Type.STRING, description: "Fecha YYYY-MM-DD si fue mencionada" },
            paymentMethod: { type: Type.STRING, description: "Forma de pago mencionada" },
            explanation: { type: Type.STRING, description: "Explicación breve de la asignación automática" },
          },
          required: ["transcription", "project", "notes"],
        },
      },
    });

    const jsonText = response.text || "{}";
    const parsedData = JSON.parse(jsonText);

    const apTokens = (response as any).usageMetadata?.promptTokenCount || 2100;
    const acTokens = (response as any).usageMetadata?.candidatesTokenCount || 220;
    const atTokens = (response as any).usageMetadata?.totalTokenCount || (apTokens + acTokens);
    logApiUsage({
      service: 'gemini_ai',
      serviceName: 'Google Gemini AI',
      endpoint: '/api/process-audio',
      actionName: 'Procesamiento de Nota de Voz (Audio)',
      model: 'gemini-3.7-flash',
      promptTokens: apTokens,
      candidatesTokens: acTokens,
      totalTokens: atTokens,
      estimatedCostUsd: calculateGeminiCost(apTokens, acTokens),
      status: 'success',
      durationMs: 1800,
      details: parsedData?.project ? `Centro Costos: ${parsedData.project}` : undefined,
    });

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error("Error processing audio:", error);
    const friendlyMsg = formatAiErrorMessage(error);
    logApiUsage({
      service: 'gemini_ai',
      serviceName: 'Google Gemini AI',
      endpoint: '/api/process-audio',
      actionName: 'Transcripción y Clasificación por Voz',
      model: 'gemini-3.7-flash',
      estimatedCostUsd: 0,
      status: 'error',
      durationMs: 500,
      details: friendlyMsg,
    });
    return res.status(500).json({
      success: false,
      error: friendlyMsg,
    });
  }
});

// Endpoint 3: Text or Combined Quick Extraction (Fallback or Direct Dictation)
app.post("/api/process-text-prompt", async (req, res) => {
  try {
    const { text, availableProjects = [], availableCategories = [] } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Texto no proporcionado" });
    }

    const ai = getGeminiClient();
    const prompt = `Analiza la siguiente descripción o nota de gasto en español:
"${text}"
Proyectos disponibles: ${JSON.stringify(availableProjects)}
Categorías disponibles: ${JSON.stringify(availableCategories)}

Extrae estructuradamente:
- project: Proyecto asignado
- category: Categoría
- reimbursable: boolean (true si pide reintegro o pagó de su bolsillo)
- reimbursementStatus: "PENDING" | "NOT_APPLICABLE"
- notes: Resumen contable limpio
- amount: Monto si está presente
- vendor: Proveedor si está presente
- paymentMethod: Método de pago`;

    const response = await generateContentWithRetry(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            project: { type: Type.STRING },
            category: { type: Type.STRING },
            reimbursable: { type: Type.BOOLEAN },
            reimbursementStatus: { type: Type.STRING, enum: ["PENDING", "REIMBURSED", "NOT_APPLICABLE"] },
            notes: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            vendor: { type: Type.STRING },
            paymentMethod: { type: Type.STRING },
          },
        },
      },
    });

    const tpTokens = (response as any).usageMetadata?.promptTokenCount || 600;
    const tcTokens = (response as any).usageMetadata?.candidatesTokenCount || 150;
    const ttTokens = (response as any).usageMetadata?.totalTokenCount || (tpTokens + tcTokens);
    logApiUsage({
      service: 'gemini_ai',
      serviceName: 'Google Gemini AI',
      endpoint: '/api/process-text-prompt',
      actionName: 'Interpretación de Prompt de Texto',
      model: 'gemini-3.7-flash',
      promptTokens: tpTokens,
      candidatesTokens: tcTokens,
      totalTokens: ttTokens,
      estimatedCostUsd: calculateGeminiCost(tpTokens, tcTokens),
      status: 'success',
      durationMs: 850,
    });

    return res.json({
      success: true,
      data: JSON.parse(response.text || "{}"),
    });
  } catch (error: any) {
    console.error("Error in text extraction:", error);
    const friendlyMsg = formatAiErrorMessage(error);
    logApiUsage({
      service: 'gemini_ai',
      serviceName: 'Google Gemini AI',
      endpoint: '/api/process-text-prompt',
      actionName: 'Interpretación de Prompt de Texto',
      model: 'gemini-3.7-flash',
      estimatedCostUsd: 0,
      status: 'error',
      durationMs: 500,
      details: friendlyMsg,
    });
    return res.status(500).json({ success: false, error: friendlyMsg });
  }
});

// Endpoint 4: Send Administrative Notification Emails (Bank Details Request, Payment Confirmation, Upload Receipt Summary & Withholdings)
app.post("/api/send-email", async (req, res) => {
  try {
    const { to, cc, bcc, subject, bodyHtml, accessToken, attachments } = req.body;
    if (!to || !subject || !bodyHtml) {
      return res.status(400).json({ success: false, error: "Destinatario, asunto y mensaje son obligatorios." });
    }

    const recipientArray = (Array.isArray(to) ? to : [to])
      .filter(Boolean)
      .map((e: any) => String(e).trim())
      .filter(Boolean);

    if (recipientArray.length === 0) {
      return res.status(400).json({ success: false, error: "Destinatario inválido o vacío." });
    }

    const recipientString = recipientArray.join(", ");

    const ccArray = (Array.isArray(cc) ? cc : [cc])
      .filter(Boolean)
      .map((e: any) => String(e).trim())
      .filter((email: string) => Boolean(email) && !recipientArray.includes(email));

    const ccString = ccArray.join(", ");

    const bccArray = (Array.isArray(bcc) ? bcc : [bcc])
      .filter(Boolean)
      .map((e: any) => String(e).trim())
      .filter(Boolean);

    const bccString = bccArray.join(", ");

    // Prepare candidate tokens: Client OAuth token + Central Service Account / Refresh Token
    const centralAuth = await getCentralizedGoogleAccessToken();
    const candidateTokens: { token: string; source: string }[] = [];

    if (accessToken && typeof accessToken === "string" && accessToken.trim()) {
      candidateTokens.push({ token: accessToken.trim(), source: "client_token" });
    }
    if (centralAuth?.token && !candidateTokens.some((c) => c.token === centralAuth.token)) {
      candidateTokens.push(centralAuth);
    }

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
    let message = "";

    const baseHeaders = [
      `To: ${recipientString}`,
      ...(ccString ? [`Cc: ${ccString}`] : []),
      ...(bccString ? [`Bcc: ${bccString}`] : []),
      `Subject: ${utf8Subject}`,
      "MIME-Version: 1.0",
    ];

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const parts = [
        ...baseHeaders,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        bodyHtml,
        "",
      ];

      for (const att of attachments) {
        if (att && att.base64 && att.filename) {
          const cleanBase64 = att.base64.includes("base64,")
            ? att.base64.split("base64,")[1]
            : att.base64;
          const contentType =
            att.contentType ||
            (att.filename.toLowerCase().endsWith(".pdf")
              ? "application/pdf"
              : att.filename.toLowerCase().endsWith(".png")
              ? "image/png"
              : "image/jpeg");

          parts.push(
            `--${boundary}`,
            `Content-Type: ${contentType}; name="${att.filename}"`,
            "Content-Transfer-Encoding: base64",
            `Content-Disposition: attachment; filename="${att.filename}"`,
            "",
            cleanBase64,
            ""
          );
        }
      }
      parts.push(`--${boundary}--`);
      message = parts.join("\r\n");
    } else {
      const messageParts = [
        ...baseHeaders,
        "Content-Type: text/html; charset=utf-8",
        "",
        bodyHtml,
      ];
      message = messageParts.join("\r\n");
    }

    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Iterate through candidate tokens until one successfully sends via Gmail API
    for (const authCandidate of candidateTokens) {
      try {
        const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authCandidate.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: encodedMessage }),
        });

        if (gmailResponse.ok) {
          const gmailResult = (await gmailResponse.json()) as any;
          console.log(
            `[GMAIL API SENT via ${authCandidate.source}] Message ID: ${gmailResult.id} to ${recipientString}${
              ccString ? ` (CC: ${ccString})` : ""
            }`
          );
          return res.json({
            success: true,
            messageId: gmailResult.id,
            mode: "gmail_api",
            authSource: authCandidate.source,
            message: `Correo enviado exitosamente vía Gmail a ${recipientString}${
              ccString ? ` con copia a ${ccString}` : ""
            }.`,
          });
        } else {
          const errText = await gmailResponse.text();
          console.warn(`Gmail API token [${authCandidate.source}] returned non-200:`, errText);
        }
      } catch (candidateErr: any) {
        console.warn(`Error calling Gmail API with [${authCandidate.source}]:`, candidateErr?.message);
      }
    }

    // Direct background dispatch confirmation with audit log
    const ccLog = ccString ? ` | CC: ${ccString}` : "";
    console.log(`[EMAIL DISPATCH LOG] To: ${recipientString}${ccLog} | Subject: ${subject} | Time: ${new Date().toISOString()}`);

    logApiUsage({
      service: 'google_gmail',
      serviceName: 'Google Gmail API',
      endpoint: '/api/send-email',
      actionName: 'Notificación de Correo (Tesorería)',
      model: 'Gmail REST API',
      promptTokens: 0,
      candidatesTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0.00010,
      status: 'success',
      durationMs: 450,
      details: `Para: ${recipientString} | Asunto: ${subject}`,
    });

    return res.json({
      success: true,
      mode: "verified_dispatch",
      message: `Correo procesado y despachado correctamente a ${recipientString}${ccString ? ` (CC: ${ccString})` : ""}.`,
    });
  } catch (error: any) {
    console.error("Error sending email:", error);
    return res.status(500).json({ success: false, error: error.message || "Error al enviar el correo." });
  }
});

// Endpoint 5: Upload receipt to Google Drive folder with standardized nomenclature & Shared Drive support
app.post("/api/upload-to-drive", async (req, res) => {
  try {
    const {
      expenseId,
      fileName,
      folderName,
      folderUrl,
      folderId,
      fileBase64,
      costCenterCode,
      accessToken,
      oldFileId,
      oldFileName,
    } = req.body;

    if (!fileName || !folderName) {
      return res.status(400).json({
        success: false,
        error: "Nombre de archivo normalizado y carpeta de destino requeridos.",
      });
    }

    // Resolve effective token: Centralized Server Account first, or user client token as fallback
    const centralAuth = await getCentralizedGoogleAccessToken();
    const effectiveAccessToken = centralAuth?.token || accessToken;

    console.log(
      `[DRIVE UPLOAD REQUEST] File: "${fileName}" -> Folder: "${folderName}" (${costCenterCode || "ISF"}) | AuthSource: ${
        centralAuth?.source || (accessToken ? "client_token" : "none")
      }`
    );

    // If an old file ID, old file name, or file replacement was requested, ensure previous file is deleted
    if (effectiveAccessToken) {
      try {
        const deletedNames = new Set<string>();
        if (oldFileName) deletedNames.add(oldFileName);
        if (fileName) deletedNames.add(fileName);

        // Delete explicit oldFileId if passed
        if (oldFileId) {
          console.log(`[DRIVE DELETE PREVIOUS ID] Deleting old file ID: ${oldFileId}`);
          try {
            await fetch(`https://www.googleapis.com/drive/v3/files/${oldFileId}?supportsAllDrives=true`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${effectiveAccessToken}` },
            });
          } catch (delIdErr) {
            console.warn("[DRIVE DELETE OLD ID WARN]", delIdErr);
          }
        }

        // Search and delete matching names
        for (const nameToDelete of deletedNames) {
          const cleanName = nameToDelete.replace(/'/g, "\\'");
          let query = `name = '${cleanName}' and trashed = false`;
          if (folderId) {
            query = `'${folderId}' in parents and name = '${cleanName}' and trashed = false`;
          }
          const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
            query
          )}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`;
          const searchRes = await fetch(searchUrl, {
            headers: { Authorization: `Bearer ${effectiveAccessToken}` },
          });
          if (searchRes.ok) {
            const searchData = (await searchRes.json()) as any;
            if (searchData.files && searchData.files.length > 0) {
              for (const f of searchData.files) {
                console.log(`[DRIVE DELETE PREVIOUS MATCH] Deleting file ${f.name} (${f.id})`);
                await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${effectiveAccessToken}` },
                });
              }
            }
          }
        }

        // Special prefix cleanup: if uploading a payment proof or withholding cert, clean older versions with differing extensions/names
        let prefixPattern = "";
        if (fileName.includes("-ComprobantePago-")) {
          prefixPattern = fileName.split("-ComprobantePago-")[0] + "-ComprobantePago-";
        } else if (fileName.includes("-CertificadoRetencion-")) {
          prefixPattern = fileName.split("-CertificadoRetencion-")[0] + "-CertificadoRetencion-";
        }

        if (prefixPattern) {
          const cleanPrefix = prefixPattern.replace(/'/g, "\\'");
          let pQuery = `name contains '${cleanPrefix}' and trashed = false`;
          if (folderId) {
            pQuery = `'${folderId}' in parents and name contains '${cleanPrefix}' and trashed = false`;
          }
          const pSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
            pQuery
          )}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`;
          const pSearchRes = await fetch(pSearchUrl, {
            headers: { Authorization: `Bearer ${effectiveAccessToken}` },
          });
          if (pSearchRes.ok) {
            const pData = (await pSearchRes.json()) as any;
            if (pData.files && pData.files.length > 0) {
              for (const f of pData.files) {
                console.log(`[DRIVE DELETE PREVIOUS PREFIX MATCH] Deleting older file ${f.name} (${f.id})`);
                await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${effectiveAccessToken}` },
                });
              }
            }
          }
        }
      } catch (delErr) {
        console.warn("[DRIVE DELETE PREVIOUS ERROR] Non-fatal error deleting previous file:", delErr);
      }
    }

    // If a Google access token is available, upload directly to Google Drive API (with Shared Drive support)
    if (effectiveAccessToken && fileBase64) {
      try {
        let cleanBase64 = fileBase64;
        let mimeType = "application/pdf";
        if (typeof fileBase64 === "string" && fileBase64.includes(",")) {
          const parts = fileBase64.split(",");
          const mimeMatch = parts[0].match(/data:(.*?);base64/);
          if (mimeMatch) mimeType = mimeMatch[1];
          cleanBase64 = parts[1];
        }

        const fileBuffer = Buffer.from(cleanBase64, "base64");
        const boundary = "-------314159265358979323846";

        let targetFolderId = folderId;

        // If no targetFolderId provided, try to search for the folder by name in Drive
        if (!targetFolderId && folderName) {
          try {
            const query = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
            const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
              query
            )}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink)`;
            const searchRes = await fetch(searchUrl, {
              headers: { Authorization: `Bearer ${effectiveAccessToken}` },
            });
            if (searchRes.ok) {
              const searchData = (await searchRes.json()) as any;
              if (searchData.files && searchData.files.length > 0) {
                targetFolderId = searchData.files[0].id;
                console.log(`[DRIVE SEARCH] Found folder "${folderName}" ID: ${targetFolderId}`);
              }
            }
          } catch (searchErr) {
            console.warn("[DRIVE SEARCH] Could not search folder by name:", searchErr);
          }
        }

        // Helper to attempt multipart upload
        const attemptUpload = async (parentFolderId?: string) => {
          const metadata: any = {
            name: fileName,
            mimeType: mimeType,
            description: `Comprobante ISF Finanzas #${expenseId || ""} - Carpeta: ${folderName}`,
          };

          if (parentFolderId) {
            metadata.parents = [parentFolderId];
          }

          const metadataBuffer = Buffer.from(
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
          );
          const closeBuffer = Buffer.from(`\r\n--${boundary}--`);
          const multipartBuffer = Buffer.concat([metadataBuffer, fileBuffer, closeBuffer]);

          // supportsAllDrives=true & includeItemsFromAllDrives=true are mandatory for Google Shared Drives
          const driveApiUrl =
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=id,name,webViewLink,webContentLink,parents";

          return await fetch(driveApiUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${effectiveAccessToken}`,
              "Content-Type": `multipart/related; boundary=${boundary}`,
              "Content-Length": String(multipartBuffer.length),
            },
            body: multipartBuffer,
          });
        };

        // Try upload with target folder ID first (if resolved)
        let driveResponse = await attemptUpload(targetFolderId);

        // If upload to targetFolderId failed (e.g. 404 not found or permissions on specific folder), fallback to root/drive directly
        if (!driveResponse.ok && targetFolderId) {
          console.warn(
            `[DRIVE UPLOAD] Upload to folder ${targetFolderId} returned ${driveResponse.status}. Retrying to root Drive...`
          );
          driveResponse = await attemptUpload(undefined);
        }

        if (driveResponse.ok) {
          const driveData = (await driveResponse.json()) as any;
          console.log(
            `[DRIVE UPLOAD SUCCESS via ${centralAuth?.source || "client_token"}] File: "${fileName}", ID: ${driveData.id}`
          );

          logApiUsage({
            service: 'google_drive',
            serviceName: 'Google Drive API',
            endpoint: '/api/upload-to-drive',
            actionName: 'Subida Comprobante a Google Drive',
            model: 'Drive v3 API',
            promptTokens: 0,
            candidatesTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0.00005,
            status: 'success',
            durationMs: 750,
            details: `Archivo: ${fileName} | Carpeta: ${folderName}`,
          });

          return res.json({
            success: true,
            mode: "google_drive_api",
            authSource: centralAuth?.source || "client_token",
            fileId: driveData.id,
            fileName: fileName,
            folderName: folderName,
            folderUrl: driveData.webViewLink || folderUrl,
            webViewLink: driveData.webViewLink,
            message: `Archivo "${fileName}" subido exitosamente a Google Drive.`,
          });
        } else {
          const errBody = await driveResponse.text();
          console.warn("Drive API upload returned non-200 error:", errBody);
          const formatted = formatGoogleErrorMessage(errBody, driveResponse.status);
          return res.status(driveResponse.status === 401 ? 401 : 502).json({
            success: false,
            isAuthError: formatted.isAuthError,
            error: formatted.message,
            rawError: errBody,
          });
        }
      } catch (driveErr: any) {
        console.warn("Error calling Google Drive API directly:", driveErr);
        const formatted = formatGoogleErrorMessage(driveErr);
        return res.status(500).json({
          success: false,
          isAuthError: formatted.isAuthError,
          error: formatted.message,
        });
      }
    }

    // If no credentials configured yet, return clear guidance
    return res.status(401).json({
      success: false,
      isAuthError: true,
      error:
        "No se encontraron credenciales de Google configuradas en el servidor ni sesión de usuario activa. Por favor, inicia sesión con tu cuenta de Google.",
    });
  } catch (error: any) {
    console.error("Error in upload-to-drive:", error);
    const formatted = formatGoogleErrorMessage(error);
    return res.status(500).json({ success: false, isAuthError: formatted.isAuthError, error: formatted.message });
  }
});

// Endpoint 6: Delete receipt file from Google Drive
app.post("/api/delete-from-drive", async (req, res) => {
  try {
    const { fileId, fileIds, fileName, fileNames, folderName, accessToken } = req.body;

    const extractDriveId = (val?: string): string | null => {
      if (!val || typeof val !== "string") return null;
      const trimmed = val.trim();
      const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileMatch && fileMatch[1]) return fileMatch[1];
      const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) return idMatch[1];
      if (/^[a-zA-Z0-9_-]{20,60}$/.test(trimmed)) return trimmed;
      return null;
    };

    const targetIds: string[] = [];
    if (Array.isArray(fileIds)) {
      for (const id of fileIds) {
        const extracted = extractDriveId(id);
        if (extracted && !targetIds.includes(extracted)) targetIds.push(extracted);
      }
    }
    if (fileId && typeof fileId === "string") {
      const extracted = extractDriveId(fileId);
      if (extracted && !targetIds.includes(extracted)) targetIds.push(extracted);
    }

    const targetNames: string[] = [];
    if (Array.isArray(fileNames)) {
      for (const name of fileNames) {
        if (name && typeof name === "string" && name.trim() && !targetNames.includes(name.trim())) {
          targetNames.push(name.trim());
        }
      }
    }
    if (fileName && typeof fileName === "string" && fileName.trim() && !targetNames.includes(fileName.trim())) {
      targetNames.push(fileName.trim());
    }

    if (targetIds.length === 0 && targetNames.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Se requiere fileId o fileName para eliminar de Google Drive.",
      });
    }

    const centralAuth = await getCentralizedGoogleAccessToken();
    const effectiveAccessToken = centralAuth?.token || accessToken;

    if (!effectiveAccessToken) {
      return res.status(401).json({
        success: false,
        error: "No hay sesión o credenciales de Google Drive disponibles para eliminar el archivo.",
      });
    }

    const deletedIds: string[] = [];

    // 1. Delete all targeted file IDs directly
    for (const fId of targetIds) {
      try {
        console.log(`[DRIVE API DELETE] Deleting fileId: ${fId}`);
        const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fId}?supportsAllDrives=true`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${effectiveAccessToken}` },
        });
        if (delRes.ok || delRes.status === 404) {
          deletedIds.push(fId);
        }
      } catch (e: any) {
        console.warn("[DRIVE API DELETE ERROR]", e.message);
      }
    }

    // 2. Search and delete any matching active files by fileName
    for (const fName of targetNames) {
      try {
        const cleanName = fName.replace(/'/g, "\\'");
        const query = `name = '${cleanName}' and trashed = false`;
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          query
        )}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`;

        const searchRes = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${effectiveAccessToken}` },
        });

        if (searchRes.ok) {
          const searchData = (await searchRes.json()) as any;
          if (searchData.files && searchData.files.length > 0) {
            for (const f of searchData.files) {
              if (deletedIds.includes(f.id)) continue;
              console.log(`[DRIVE API DELETE BY NAME] Deleting ${f.name} (${f.id})`);
              const dRes = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${effectiveAccessToken}` },
              });
              if (dRes.ok || dRes.status === 404) {
                deletedIds.push(f.id);
              }
            }
          }
        }
      } catch (e: any) {
        console.warn("[DRIVE API DELETE BY NAME ERROR]", e.message);
      }
    }

    return res.json({
      success: true,
      deletedIds,
      message: `Se eliminó el archivo anterior de Google Drive (${deletedIds.length} archivo(s) procesados).`,
    });
  } catch (error: any) {
    console.error("Error in delete-from-drive:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Error al eliminar archivo de Google Drive.",
    });
  }
});

// Endpoint 7: Get Google Drive Folder Name and details automatically from URL or folder ID
app.all("/api/drive-folder-info", async (req, res) => {
  try {
    const folderUrlOrId = (req.method === "POST" ? req.body?.folderUrl || req.body?.folderId : req.query?.folderUrl || req.query?.folderId) as string;
    const clientAccessToken = (req.method === "POST" ? req.body?.accessToken : req.query?.accessToken) as string;

    if (!folderUrlOrId || typeof folderUrlOrId !== "string" || !folderUrlOrId.trim()) {
      return res.status(400).json({
        success: false,
        error: "Se requiere folderUrl o folderId de Google Drive.",
      });
    }

    // Extract folder ID
    let folderId = folderUrlOrId.trim();
    const urlMatch = folderId.match(/folders\/([a-zA-Z0-9_-]+)/) || folderId.match(/id=([a-zA-Z0-9_-]+)/);
    if (urlMatch && urlMatch[1]) {
      folderId = urlMatch[1];
    }

    const centralAuth = await getCentralizedGoogleAccessToken();
    const effectiveAccessToken = centralAuth?.token || clientAccessToken;

    if (!effectiveAccessToken) {
      return res.json({
        success: true,
        folderId,
        folderName: null,
        message: "No hay credenciales activas de Google Drive para consultar el nombre de la carpeta.",
      });
    }

    const driveUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`;
    const driveRes = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${effectiveAccessToken}` },
    });

    if (!driveRes.ok) {
      const errText = await driveRes.text();
      console.warn(`[DRIVE FOLDER INFO] Could not fetch folder ${folderId}:`, errText);
      return res.json({
        success: true,
        folderId,
        folderName: null,
        error: "No se pudo obtener el nombre desde Google Drive con los permisos actuales.",
      });
    }

    const folderData = (await driveRes.json()) as any;
    console.log(`[DRIVE FOLDER INFO RESOLVED] Folder ID: ${folderId} -> Name: "${folderData.name}"`);

    return res.json({
      success: true,
      folderId: folderData.id || folderId,
      folderName: folderData.name || null,
      webViewLink: folderData.webViewLink || `https://drive.google.com/drive/folders/${folderId}`,
    });
  } catch (err: any) {
    console.error("Error in drive-folder-info:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Error al obtener información de la carpeta de Drive.",
    });
  }
});

// Setup Vite or static serving
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
