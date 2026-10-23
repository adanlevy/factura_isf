import { Vendor, VendorChangeRequest, VendorEditableData, UserBankDetails } from '../types';

/**
 * Pedidos de cambio de proveedores: qué se puede cambiar, cómo se compara y cómo se aplica.
 * Los campos se nombran con su ruta ("name", "bankDetails.cbuCvu") para mostrar el "antes → después".
 */

const BANK_FIELDS = ['cbuCvu', 'alias', 'bankName', 'accountType', 'accountHolder', 'cuitCuil'] as const;
type BankField = (typeof BANK_FIELDS)[number];

export const VENDOR_FIELD_LABELS: Record<string, string> = {
  name: 'Nombre / Razón social',
  cuit: 'CUIT',
  notes: 'Observaciones',
  'bankDetails.cbuCvu': 'CBU / CVU',
  'bankDetails.alias': 'Alias',
  'bankDetails.bankName': 'Banco',
  'bankDetails.accountType': 'Tipo de cuenta',
  'bankDetails.accountHolder': 'Titular de la cuenta',
  'bankDetails.cuitCuil': 'CUIT del titular',
};

/** Cambios de cuenta bancaria (lo delicado: a dónde se transfiere) */
export const SENSITIVE_VENDOR_FIELDS = ['bankDetails.cbuCvu', 'bankDetails.alias'];

const clean = (value?: string | null) => String(value ?? '').trim();

/** Datos editables de un proveedor, normalizados (sin espacios sobrantes ni valores vacíos de relleno) */
export function vendorEditableSnapshot(vendor?: Partial<Vendor> | VendorEditableData | null): VendorEditableData {
  if (!vendor) return {};
  const bank = vendor.bankDetails;
  const snapshot: VendorEditableData = {
    name: clean(vendor.name),
    cuit: clean(vendor.cuit),
    notes: clean(vendor.notes),
  };
  if (bank) {
    snapshot.bankDetails = {
      cbuCvu: clean(bank.cbuCvu),
      alias: clean(bank.alias),
      bankName: clean(bank.bankName),
      accountType: clean(bank.accountType) || 'Indefinido',
      accountHolder: clean(bank.accountHolder),
      cuitCuil: clean(bank.cuitCuil),
    } as UserBankDetails;
  }
  return snapshot;
}

export function getVendorFieldValue(data: VendorEditableData | undefined, field: string): string {
  if (!data) return '';
  if (field.startsWith('bankDetails.')) {
    const key = field.slice('bankDetails.'.length) as BankField;
    const value = clean((data.bankDetails as unknown as Record<string, string> | undefined)?.[key]);
    // "Indefinido" es el valor por defecto del tipo de cuenta: equivale a no tenerlo
    return key === 'accountType' && value === 'Indefinido' ? '' : value;
  }
  return clean((data as Record<string, string | undefined>)[field]);
}

const ALL_FIELDS = ['name', 'cuit', 'notes', ...BANK_FIELDS.map((f) => `bankDetails.${f}`)];

/** Campos que cambian entre dos versiones de un proveedor (el alias se compara sin mayúsculas) */
export function diffVendorData(before: VendorEditableData | undefined, after: VendorEditableData): string[] {
  return ALL_FIELDS.filter((field) => {
    const a = getVendorFieldValue(before, field);
    const b = getVendorFieldValue(after, field);
    return field === 'bankDetails.alias' ? a.toLowerCase() !== b.toLowerCase() : a !== b;
  });
}

export function touchesBankAccount(changedFields: string[]): boolean {
  return changedFields.some((f) => SENSITIVE_VENDOR_FIELDS.includes(f));
}

/**
 * Aplica sobre la versión actual del proveedor SOLO los campos que pidió cambiar el pedido,
 * para no pisar otros cambios que se hayan hecho mientras tanto.
 */
export function applyVendorChangeRequest(current: Vendor, request: VendorChangeRequest): Vendor {
  const next: Vendor = { ...current, bankDetails: current.bankDetails ? { ...current.bankDetails } : undefined };
  for (const field of request.changedFields) {
    const value = getVendorFieldValue(request.proposed, field);
    if (field.startsWith('bankDetails.')) {
      const key = field.slice('bankDetails.'.length) as BankField;
      next.bankDetails = {
        bankName: '',
        accountType: 'Indefinido',
        cbuCvu: '',
        alias: '',
        cuitCuil: '',
        accountHolder: '',
        ...(next.bankDetails || {}),
        [key]: key === 'accountType' ? value || 'Indefinido' : value,
      } as UserBankDetails;
    } else {
      (next as unknown as Record<string, string | undefined>)[field] = value || undefined;
    }
  }
  return next;
}

/** El proveedor cambió (en los campos del pedido) después de que se hizo el pedido */
export function vendorChangedSinceRequest(current: Vendor | undefined, request: VendorChangeRequest): boolean {
  if (!current || request.type !== 'UPDATE') return false;
  const now = vendorEditableSnapshot(current);
  return request.changedFields.some((field) => getVendorFieldValue(now, field) !== getVendorFieldValue(request.before, field));
}
