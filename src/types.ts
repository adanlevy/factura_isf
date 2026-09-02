export type ReimbursementStatus = 'PENDING' | 'REIMBURSED' | 'NOT_APPLICABLE';

export type ExpensePaymentType = 
  | 'REINTEGRO' 
  | 'PAGO_PROVEEDOR' 
  | 'TARJETA_CORPORATIVA' 
  | 'TARJETA_DEBITO_GALICIA';

export type PaymentMethod = 
  | 'Efectivo' 
  | 'Tarjeta de Débito' 
  | 'Tarjeta de Crédito' 
  | 'Transferencia Bancaria' 
  | 'Mercado Pago / Billetera Virtual' 
  | 'Cuenta Corriente' 
  | 'Reintegro'
  | 'Pago a Proveedor'
  | 'Tarjeta Corporativa'
  | 'Tarjeta Débito Galicia'
  | 'Otro';

export interface CostCenter {
  id: string;
  name: string;
  code: string; // Siglas en mayúsculas (ej: GADM, ALSE, GPA, SEAP)
  driveFolder?: string; // Nombre o identificador de carpeta de Drive
  driveFolderId?: string; // ID único de la carpeta de Google Drive
  driveUrl?: string; // Enlace a la carpeta de Google Drive
  notifyEmails?: string; // Emails en copia (separados por coma) para notificaciones de este Centro de Costos
  ccEmails?: string; // Alias de compatibilidad
  notes?: string;
  active?: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  cuit?: string;
  category?: string;
  contactEmail?: string;
  phone?: string;
  address?: string;
  bankDetails?: UserBankDetails;
  notes?: string;
  createdAt: string;
}

export interface UserProfile {
  email: string;
  name: string;
  picture?: string;
  role: 'admin' | 'user';
  bankDetails?: UserBankDetails;
}

export interface AppUserRecord {
  email: string;
  name: string;
  picture?: string;
  role: 'admin' | 'user';
  ccAllOutgoingEmails?: boolean; // Poner en copia en todo email saliente de la plataforma
  createdAt?: string;
  updatedAt?: string;
  addedBy?: string;
  notes?: string;
}

export interface UserBankDetails {
  bankName: string;
  accountType: 'Indefinido' | 'Billetera' | 'Caja de Ahorro' | 'Cuenta Corriente' | string;
  currency?: '$Ar' | 'u$' | string;
  cbuCvu: string; // 22 digits
  alias: string;
  cuitCuil: string;
  accountHolder: string;
}

export interface ExpenseItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
}

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO string
  vendor: string; // Comercio / Proveedor
  cuit?: string; // CUIT fiscal del emisor
  amount: number; // Monto total
  currency: string; // ARS, USD, EUR, etc.
  invoiceNumber?: string; // N° Factura / Ticket
  
  // Categorization & Accounting
  category: string;
  project: string;
  
  // Submitter tracking & Bank recipient details
  submittedByEmail?: string;
  submittedByName?: string;
  submittedByPicture?: string;
  bankDetails?: UserBankDetails;
  
  // Reintegro (Reembolso)
  reimbursable: boolean; // ¿Aplica reintegro? Sí / No (por defecto false)
  reimbursementStatus: ReimbursementStatus; // Pendiente, Reintegrado, No aplica
  reimbursedAt?: string;
  reimbursementNotes?: string;
  
  // Administrative email notifications tracking
  bankDetailsRequestedAt?: string;
  paymentConfirmedAt?: string;
  
  // Google Drive upload tracking
  driveFileId?: string;
  driveUploadedFileName?: string;
  driveFolderTarget?: string;
  driveFolderUrl?: string;
  driveUploadedUrl?: string;
  driveUploadStatus?: 'SUCCESS' | 'PENDING' | 'ERROR';
  driveUploadedAt?: string;
  
  // Method & Notes
  paymentType?: ExpensePaymentType;
  paymentMethod: PaymentMethod | string;
  transferDetails?: string; // Datos transferencia para conservar adónde se transfirió
  notes?: string;
  accountingNotes?: string; // Notas contables
  items?: ExpenseItem[];
  
  // Attachments
  receiptImage?: string; // Data URL or base64
  receiptFileName?: string;
  paymentProofImage?: string; // Comprobante de transferencia / pago
  paymentProofFileName?: string;
  paymentProofAt?: string;
  paymentProofDriveUrl?: string;
  
  // Certificado de Retenciones
  appliesWithholdings?: boolean; // ¿Aplica retenciones impositivas?
  withholdingCertificateImage?: string; // Data URL or base64 del certificado
  withholdingCertificateFileName?: string;
  withholdingCertificateUploadedAt?: string;
  withholdingCertificateDriveUrl?: string;
  withholdingCertificateSentAt?: string;

  audioRecordingUrl?: string; // Data URL or base64 audio
  voiceTranscription?: string;
  
  // AI extraction metadata
  aiConfidenceSummary?: string;
  isAiExtracted?: boolean;
  updatedAt?: string; // Timestamp ISO de la última modificación para resolución de conflictos
}

export interface ProjectSummary {
  name: string;
  totalSpent: number;
  reimbursablePending: number;
  count: number;
}

export interface ExtractionResult {
  amount?: number;
  currency?: string;
  date?: string;
  vendor?: string;
  cuit?: string;
  invoiceNumber?: string;
  taxAmount?: number;
  category?: string;
  items?: ExpenseItem[];
  paymentMethod?: string;
  confidenceSummary?: string;
}

export interface AudioProcessingResult {
  transcription: string;
  project?: string;
  category?: string;
  reimbursable?: boolean;
  reimbursementStatus?: ReimbursementStatus;
  notes?: string;
  amount?: number;
  vendor?: string;
  date?: string;
  paymentMethod?: string;
  explanation?: string;
}

export interface FirestoreCollectionMetric {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  estimatedBytes: number;
  estimatedKb: number;
  estimatedMb: number;
  percentage: number;
}

export interface FirestoreStorageMetrics {
  totalEstimatedBytes: number;
  totalEstimatedKb: number;
  totalEstimatedMb: number;
  totalDocuments: number;
  tierLimitBytes: number;
  percentUsed: number;
  collections: FirestoreCollectionMetric[];
  lastCalculatedAt: string;
}

export interface ServiceUsageSummary {
  service: 'gemini_ai' | 'google_drive' | 'google_gmail' | 'firestore';
  serviceName: string;
  calls: number;
  tokens: number;
  costUsd: number;
  costArs: number;
}

export interface MonthApiUsage {
  monthKey: string;
  monthLabel: string;
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  totalCostArs: number;
  byService: Record<string, ServiceUsageSummary>;
}

export interface ApiUsageLogEntry {
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

export interface SystemMetricsReport {
  firestore: FirestoreStorageMetrics;
  apiUsage: {
    currentMonth: MonthApiUsage;
    previousMonth: MonthApiUsage;
    comparison: {
      percentageChange: number;
      diffCostUsd: number;
      diffCostArs: number;
      isHigher: boolean;
    };
    exchangeRateArs: number;
    recentLogs: ApiUsageLogEntry[];
    totalHistoricalCalls: number;
    totalHistoricalCostUsd: number;
  };
  servicesHealth: {
    gemini: { status: 'healthy' | 'degraded' | 'unconfigured'; latencyMs?: number; label: string };
    drive: { status: 'healthy' | 'degraded' | 'unconfigured'; label: string };
    gmail: { status: 'healthy' | 'degraded' | 'unconfigured'; label: string };
    firestore: { status: 'healthy' | 'degraded' | 'unconfigured'; label: string };
  };
  serverTimestamp: string;
}

export interface AuditLogChange {
  field: string;
  fieldLabel?: string;
  label?: string;
  oldValue: any;
  newValue: any;
}

export type AuditLogEntityType =
  | 'cost_center'
  | 'vendor'
  | 'expense'
  | 'category'
  | 'user'
  | 'system';

export type AuditLogAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'BATCH_CREATE'
  | 'BATCH_UPDATE'
  | 'BATCH_DELETE'
  | 'SETTLE_PAYMENT'
  | 'REVERT_PAYMENT'
  | 'REPLACE_RECEIPT'
  | 'WITHHOLDING_CERT'
  | 'SYSTEM_CLEAR_LOGS'
  | 'VENDOR_CREATE'
  | 'VENDOR_UPDATE'
  | 'VENDOR_DELETE'
  | 'EXPENSE_CREATE'
  | 'EXPENSE_UPDATE'
  | 'EXPENSE_DELETE'
  | 'EXPENSE_STATUS_CHANGE'
  | 'COST_CENTER_CREATE'
  | 'COST_CENTER_UPDATE'
  | 'COST_CENTER_DELETE'
  | 'CATEGORY_CREATE'
  | 'CATEGORY_UPDATE'
  | 'CATEGORY_DELETE'
  | 'USER_ROLE_CHANGE';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO string
  userEmail: string;
  userName: string;
  action: AuditLogAction;
  actionLabel: string; // e.g. "Edición de Proveedor", "Eliminación de Centro de Costos", "Creación de Gasto"
  entityType: AuditLogEntityType;
  entityId: string;
  entityName: string; // e.g. "ALSE - Alimentos y Servicios", "La Serenísima S.A.", "Factura A-0001-00001234"
  summary: string; // e.g. "Se eliminó el email 'copia@isf.org' de los emails en copia (CC)"
  changes?: AuditLogChange[];
  metadata?: Record<string, any>;
}

