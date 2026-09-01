import {
  Expense,
  Vendor,
  CostCenter,
  AppUserRecord,
  FirestoreStorageMetrics,
  FirestoreCollectionMetric,
} from '../types';

/**
 * Calculates accurate Firestore document size in bytes based on official Firestore documentation:
 * https://firebase.google.com/docs/firestore/storage-size
 */
export function estimateDocumentSize(docPath: string, data: any): number {
  let size = 32; // Document path and base overhead (32 bytes)
  size += encodeUtf8(docPath).length + 16;

  function calculateValueSize(val: any): number {
    if (val === null || val === undefined) return 1;
    if (typeof val === 'boolean') return 1;
    if (typeof val === 'number') return 8;
    if (typeof val === 'string') return encodeUtf8(val).length + 1;
    if (val instanceof Date) return 8;
    if (Array.isArray(val)) {
      return val.reduce((acc, item) => acc + calculateValueSize(item), 0);
    }
    if (typeof val === 'object') {
      let objSize = 0;
      for (const key of Object.keys(val)) {
        objSize += encodeUtf8(key).length + 1 + calculateValueSize(val[key]);
      }
      return objSize;
    }
    return 0;
  }

  if (data && typeof data === 'object') {
    for (const key of Object.keys(data)) {
      size += encodeUtf8(key).length + 1 + calculateValueSize(data[key]);
    }
  }

  return size;
}

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Computes comprehensive Firestore storage metrics across all known collections
 */
export function computeFirestoreStorage(
  expenses: Expense[] = [],
  vendors: Vendor[] = [],
  costCenters: CostCenter[] = [],
  categories: string[] = [],
  appUsers: AppUserRecord[] = []
): FirestoreStorageMetrics {
  // 1. Expenses collection
  let expensesBytes = 0;
  expenses.forEach((e) => {
    expensesBytes += estimateDocumentSize(`expenses/${e.id}`, e);
  });

  // 2. Vendors collection
  let vendorsBytes = 0;
  vendors.forEach((v) => {
    vendorsBytes += estimateDocumentSize(`vendors/${v.id}`, v);
  });

  // 3. Cost Centers collection
  let costCentersBytes = 0;
  costCenters.forEach((c) => {
    costCentersBytes += estimateDocumentSize(`cost_centers/${c.id}`, c);
  });

  // 4. Categories collection
  let categoriesBytes = 0;
  categories.forEach((cat, index) => {
    categoriesBytes += estimateDocumentSize(`categories/cat_${index}`, { name: cat, index });
  });

  // 5. App Users collection
  let appUsersBytes = 0;
  appUsers.forEach((u) => {
    appUsersBytes += estimateDocumentSize(`app_users/${encodeURIComponent(u.email)}`, u);
  });

  // 6. User Preferences & System Health estimated overhead
  const preferencesBytes = appUsers.length * 280; // Estimated preference documents per user
  const systemHealthBytes = 1024; // System ping documents

  const totalEstimatedBytes =
    expensesBytes +
    vendorsBytes +
    costCentersBytes +
    categoriesBytes +
    appUsersBytes +
    preferencesBytes +
    systemHealthBytes;

  const totalDocuments =
    expenses.length +
    vendors.length +
    costCenters.length +
    (categories.length > 0 ? categories.length : 1) +
    appUsers.length +
    appUsers.length + // preferences
    1; // health

  const tierLimitBytes = 1024 * 1024 * 1024; // 1 GiB (1,073,741,824 bytes) Free Spark Tier
  const percentUsed = (totalEstimatedBytes / tierLimitBytes) * 100;

  const collections: FirestoreCollectionMetric[] = [
    {
      id: 'expenses',
      name: 'expenses (Comprobantes)',
      description: 'Facturas, comprobantes, metadatos OCR e imágenes de transferencias',
      documentCount: expenses.length,
      estimatedBytes: expensesBytes,
      estimatedKb: Number((expensesBytes / 1024).toFixed(2)),
      estimatedMb: Number((expensesBytes / (1024 * 1024)).toFixed(3)),
      percentage: totalEstimatedBytes > 0 ? Number(((expensesBytes / totalEstimatedBytes) * 100).toFixed(1)) : 0,
    },
    {
      id: 'vendors',
      name: 'vendors (Proveedores)',
      description: 'Catálogo de proveedores, datos bancarios (CBU/Alias) y notas',
      documentCount: vendors.length,
      estimatedBytes: vendorsBytes,
      estimatedKb: Number((vendorsBytes / 1024).toFixed(2)),
      estimatedMb: Number((vendorsBytes / (1024 * 1024)).toFixed(3)),
      percentage: totalEstimatedBytes > 0 ? Number(((vendorsBytes / totalEstimatedBytes) * 100).toFixed(1)) : 0,
    },
    {
      id: 'cost_centers',
      name: 'cost_centers (Centros de Costo)',
      description: 'Proyectos contables, carpetas de Google Drive y correos en copia',
      documentCount: costCenters.length,
      estimatedBytes: costCentersBytes,
      estimatedKb: Number((costCentersBytes / 1024).toFixed(2)),
      estimatedMb: Number((costCentersBytes / (1024 * 1024)).toFixed(3)),
      percentage: totalEstimatedBytes > 0 ? Number(((costCentersBytes / totalEstimatedBytes) * 100).toFixed(1)) : 0,
    },
    {
      id: 'app_users',
      name: 'app_users (Usuarios y Roles)',
      description: 'Perfiles de usuarios autorizados, roles admin/user y preferencias',
      documentCount: appUsers.length,
      estimatedBytes: appUsersBytes,
      estimatedKb: Number((appUsersBytes / 1024).toFixed(2)),
      estimatedMb: Number((appUsersBytes / (1024 * 1024)).toFixed(3)),
      percentage: totalEstimatedBytes > 0 ? Number(((appUsersBytes / totalEstimatedBytes) * 100).toFixed(1)) : 0,
    },
    {
      id: 'categories',
      name: 'categories (Categorías)',
      description: 'Nomenclador de categorías de gastos operativos',
      documentCount: categories.length,
      estimatedBytes: categoriesBytes,
      estimatedKb: Number((categoriesBytes / 1024).toFixed(2)),
      estimatedMb: Number((categoriesBytes / (1024 * 1024)).toFixed(3)),
      percentage: totalEstimatedBytes > 0 ? Number(((categoriesBytes / totalEstimatedBytes) * 100).toFixed(1)) : 0,
    },
    {
      id: 'user_preferences',
      name: 'user_preferences (Configuraciones)',
      description: 'Centros de costos favoritos y patrones de selección',
      documentCount: appUsers.length,
      estimatedBytes: preferencesBytes,
      estimatedKb: Number((preferencesBytes / 1024).toFixed(2)),
      estimatedMb: Number((preferencesBytes / (1024 * 1024)).toFixed(3)),
      percentage: totalEstimatedBytes > 0 ? Number(((preferencesBytes / totalEstimatedBytes) * 100).toFixed(1)) : 0,
    },
  ];

  return {
    totalEstimatedBytes,
    totalEstimatedKb: Number((totalEstimatedBytes / 1024).toFixed(2)),
    totalEstimatedMb: Number((totalEstimatedBytes / (1024 * 1024)).toFixed(3)),
    totalDocuments,
    tierLimitBytes,
    percentUsed: Number(percentUsed.toFixed(4)),
    collections,
    lastCalculatedAt: new Date().toISOString(),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatCurrencyUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USD`;
}

export function formatCurrencyArs(amount: number): string {
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS`;
}
