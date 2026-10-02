import React from 'react';
import { Expense, Vendor } from '../types';
import { formatCuit, findVendorByCuitOrName, vendorBankMismatch } from '../utils/helpers';

interface AccountDetailsDisplayProps {
  expense: Expense;
  vendors?: Vendor[];
  className?: string;
}

/**
 * Componente estándar para la columna "Datos de cuenta" en las tablas de gastos y pagos.
 * Muestra SIEMPRE la cuenta guardada en el comprobante, que es la que se usa al pagar y en el
 * correo (antes mostraba la del catálogo y al pagar aparecía otra). Si la cuenta del catálogo de
 * proveedores es distinta, lo marca para que Administración lo revise.
 *
 * Formato requerido:
 * 1. Nombre
 * 2. CUIT
 * 3. alias
 * 4. CBU
 *
 * En caso de estar vacío alguno de los campos, directamente no se muestra y se saltea el renglón.
 */
export function AccountDetailsDisplay({ expense, vendors = [], className = '' }: AccountDetailsDisplayProps) {
  // 1. Check if expense is a personal reimbursement
  const isPersonalReimbursement = Boolean(
    (expense.paymentType === 'REINTEGRO' || expense.paymentMethod === 'Reintegro') &&
    expense.submittedByName?.trim()
  );

  // 2. Check if this expense explicitly has bank details assigned
  const hasDirectBankDetails = Boolean(
    expense.bankDetails &&
    (expense.bankDetails.cbuCvu?.trim() ||
      expense.bankDetails.alias?.trim() ||
      expense.bankDetails.bankName?.trim() ||
      expense.bankDetails.accountHolder?.trim() ||
      expense.bankDetails.cuitCuil?.trim())
  );

  // If no bank details are linked to this expense
  if (!hasDirectBankDetails) {
    // For reimbursements without formal bank details, show submittedByName if available
    if (isPersonalReimbursement) {
      return (
        <div className={`text-[10.5px] leading-tight space-y-0.5 select-text ${className}`}>
          <div className="truncate font-semibold text-slate-700" title={`Solicitante: ${expense.submittedByName}`}>
            {expense.submittedByName}
          </div>
          <div className="text-[9.5px] text-amber-600 font-medium italic">
            Sin CBU / Alias
          </div>
        </div>
      );
    }
    return <span className="text-slate-300 text-xs">—</span>;
  }

  // 3. Resolve matching vendor from vendors catalog to sync live updates if linked
  let matchedVendor: Vendor | null = null;
  if (vendors.length > 0 && !isPersonalReimbursement) {
    matchedVendor = findVendorByCuitOrName(
      vendors,
      expense.cuit || expense.bankDetails?.cuitCuil,
      expense.vendor,
      expense.bankDetails
    ) || null;
  }

  // La cuenta que se paga es la del comprobante
  const effectiveBank = expense.bankDetails!;
  const catalogMismatch = vendorBankMismatch(expense.bankDetails, matchedVendor?.bankDetails);

  // 1. Nombre / Titular de la cuenta
  const rawName =
    effectiveBank.accountHolder?.trim() ||
    matchedVendor?.name?.trim() ||
    expense.vendor?.trim() ||
    '';
  const name =
    rawName &&
    rawName.toLowerCase() !== 'null' &&
    rawName.toLowerCase() !== 'undefined' &&
    rawName !== '—' &&
    rawName !== '-'
      ? rawName
      : null;

  // 2. CUIT bancario / fiscal del titular
  const rawCuit =
    effectiveBank.cuitCuil?.trim() ||
    expense.cuit?.trim() ||
    matchedVendor?.cuit?.trim() ||
    '';
  const cuit =
    rawCuit &&
    rawCuit.toLowerCase() !== 'null' &&
    rawCuit.toLowerCase() !== 'undefined' &&
    rawCuit !== '—' &&
    rawCuit !== '-'
      ? formatCuit(rawCuit) || rawCuit
      : null;

  // 3. Alias (prioritized from live vendor)
  const rawAlias = effectiveBank.alias?.trim() || '';
  const alias =
    rawAlias &&
    rawAlias.toLowerCase() !== 'null' &&
    rawAlias.toLowerCase() !== 'undefined' &&
    rawAlias !== '—' &&
    rawAlias !== '-'
      ? rawAlias
      : null;

  // 4. CBU (prioritized from live vendor)
  const rawCbu = effectiveBank.cbuCvu?.trim() || '';
  const cbu =
    rawCbu &&
    rawCbu.toLowerCase() !== 'null' &&
    rawCbu.toLowerCase() !== 'undefined' &&
    rawCbu !== '—' &&
    rawCbu !== '-'
      ? rawCbu
      : null;

  const hasAnyData = Boolean(name || cuit || alias || cbu);

  if (!hasAnyData) {
    return <span className="text-slate-300 text-xs">—</span>;
  }

  return (
    <div className={`text-[10.5px] leading-tight space-y-0.5 select-text ${className}`}>
      {/* 1. Nombre */}
      {name && (
        <div className="truncate font-semibold text-slate-800" title={`Titular: ${name}`}>
          {name}
        </div>
      )}

      {/* 2. CUIT */}
      {cuit && (
        <div className="truncate font-mono text-[10px] text-slate-600" title={`CUIT: ${cuit}`}>
          {cuit}
        </div>
      )}

      {/* 3. Alias */}
      {alias && (
        <div className="truncate font-mono text-[10px] text-indigo-700 font-bold" title={`Alias: ${alias}`}>
          {alias}
        </div>
      )}

      {/* 4. CBU */}
      {cbu && (
        <div className="truncate font-mono text-[9.5px] text-slate-500" title={`CBU: ${cbu}`}>
          {cbu}
        </div>
      )}

      {catalogMismatch && (
        <div
          className="text-[9.5px] text-amber-700 font-semibold"
          title={`El catálogo de proveedores tiene otra cuenta: ${catalogMismatch.alias || ''} ${catalogMismatch.cbuCvu || ''}`.trim()}
        >
          ⚠️ Distinta al catálogo
        </div>
      )}
    </div>
  );
}
