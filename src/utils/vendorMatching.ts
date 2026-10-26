import { Expense, Vendor } from '../types';
import { normalizeSearchText } from './helpers';

/**
 * Qué comprobantes corresponden a un proveedor. Lo usan el resumen de cada tarjeta de Proveedores
 * (cantidad y monto) y el botón "Gastos", para que los dos muestren exactamente lo mismo.
 *
 * Un comprobante es de un proveedor si coincide cualquiera de estos datos:
 * - el nombre del proveedor del comprobante (sin importar mayúsculas ni tildes);
 * - la cuenta a la que se paga: CBU/CVU, alias o titular (por ejemplo, un reintegro a una persona);
 * - el CUIT (del comprobante o de la cuenta), solo si ningún otro proveedor del listado tiene ese CUIT.
 */

interface ExpenseKeys {
  vendorName: string;
  cbu: string;
  alias: string;
  holder: string;
  cuits: string[];
}

const normName = (value?: string | null) => normalizeSearchText(value).replace(/\s+/g, ' ');
const normAlias = (value?: string | null) => (value || '').replace(/\s+/g, '').toLowerCase();
const digits = (value?: string | null) => (value || '').replace(/\D/g, '');
const validCuit = (value?: string | null) => {
  const d = digits(value);
  return d.length === 11 ? d : '';
};

const expenseKeysCache = new WeakMap<Expense, ExpenseKeys>();
function getExpenseKeys(expense: Expense): ExpenseKeys {
  let keys = expenseKeysCache.get(expense);
  if (!keys) {
    const bank = expense.bankDetails;
    keys = {
      vendorName: normName(expense.vendor),
      cbu: digits(bank?.cbuCvu),
      alias: normAlias(bank?.alias),
      holder: normName(bank?.accountHolder),
      cuits: [validCuit(expense.cuit), validCuit(bank?.cuitCuil)].filter(Boolean),
    };
    expenseKeysCache.set(expense, keys);
  }
  return keys;
}

/**
 * Prepara el criterio para un listado de proveedores (necesario para saber qué CUIT son únicos).
 * Devuelve una función que, para un proveedor, da el filtro de sus comprobantes.
 */
export function createVendorExpenseMatcher(vendors: Vendor[]): (vendor: Vendor) => (expense: Expense) => boolean {
  const vendorsByCuit = new Map<string, number>();
  for (const v of vendors) {
    const own = new Set([validCuit(v.cuit), validCuit(v.bankDetails?.cuitCuil)].filter(Boolean));
    own.forEach((c) => vendorsByCuit.set(c, (vendorsByCuit.get(c) || 0) + 1));
  }

  return (vendor: Vendor) => {
    const name = normName(vendor.name);
    const holder = normName(vendor.bankDetails?.accountHolder);
    const cbu = digits(vendor.bankDetails?.cbuCvu);
    const alias = normAlias(vendor.bankDetails?.alias);
    const cuits = new Set(
      [validCuit(vendor.cuit), validCuit(vendor.bankDetails?.cuitCuil)].filter(
        (c) => c && (vendorsByCuit.get(c) || 0) <= 1
      )
    );

    return (expense: Expense) => {
      if (!expense) return false;
      const keys = getExpenseKeys(expense);
      if (name && keys.vendorName === name) return true;
      if (cbu.length >= 8 && keys.cbu === cbu) return true;
      if (alias && keys.alias === alias) return true;
      if (keys.holder && ((name && keys.holder === name) || (holder && keys.holder === holder))) return true;
      return keys.cuits.some((c) => cuits.has(c));
    };
  };
}

export interface VendorExpenseStats {
  count: number;
  totalAmount: number;
}

/** Cantidad de comprobantes y monto total de cada proveedor (por id) */
export function computeVendorExpenseStats(vendors: Vendor[], expenses: Expense[]): Map<string, VendorExpenseStats> {
  const matcherFor = createVendorExpenseMatcher(vendors);
  const stats = new Map<string, VendorExpenseStats>();
  for (const vendor of vendors) {
    const matches = matcherFor(vendor);
    let count = 0;
    let totalAmount = 0;
    for (const expense of expenses) {
      if (matches(expense)) {
        count += 1;
        totalAmount += Number(expense.amount) || 0;
      }
    }
    stats.set(vendor.id, { count, totalAmount });
  }
  return stats;
}
