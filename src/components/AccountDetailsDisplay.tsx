import React from 'react';
import { Expense } from '../types';
import { formatCuit } from '../utils/helpers';

interface AccountDetailsDisplayProps {
  expense: Expense;
  className?: string;
}

/**
 * Componente estándar para la columna "Datos de cuenta" en las tablas de gastos y pagos.
 * Formato requerido:
 * 1. Nombre
 * 2. CUIT
 * 3. alias
 * 4. CBU
 *
 * En caso de estar vacío alguno de los campos, directamente no se muestra y se saltea el renglón.
 */
export function AccountDetailsDisplay({ expense, className = '' }: AccountDetailsDisplayProps) {
  const bank = expense.bankDetails;

  // 1. Nombre: Titular de la cuenta bancaria, o solicitante de reintegro / proveedor
  const rawName =
    bank?.accountHolder?.trim() ||
    expense.submittedByName?.trim() ||
    (expense.paymentType === 'PAGO_PROVEEDOR' || expense.paymentMethod === 'Pago a Proveedor'
      ? expense.vendor?.trim()
      : '') ||
    '';
  const name =
    rawName &&
    rawName.toLowerCase() !== 'null' &&
    rawName.toLowerCase() !== 'undefined' &&
    rawName !== '—' &&
    rawName !== '-'
      ? rawName
      : null;

  // 2. CUIT: CUIT de los datos bancarios o CUIT del comprobante
  const rawCuit = bank?.cuitCuil?.trim() || expense.cuit?.trim() || '';
  const cuit =
    rawCuit &&
    rawCuit.toLowerCase() !== 'null' &&
    rawCuit.toLowerCase() !== 'undefined' &&
    rawCuit !== '—' &&
    rawCuit !== '-'
      ? formatCuit(rawCuit) || rawCuit
      : null;

  // 3. Alias
  const rawAlias = bank?.alias?.trim() || '';
  const alias =
    rawAlias &&
    rawAlias.toLowerCase() !== 'null' &&
    rawAlias.toLowerCase() !== 'undefined' &&
    rawAlias !== '—' &&
    rawAlias !== '-'
      ? rawAlias
      : null;

  // 4. CBU
  const rawCbu = bank?.cbuCvu?.trim() || '';
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
        <div className="truncate font-semibold text-slate-800" title={`Nombre: ${name}`}>
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
        <div className="truncate font-mono text-[10px] text-indigo-700 font-medium" title={`Alias: ${alias}`}>
          {alias}
        </div>
      )}

      {/* 4. CBU */}
      {cbu && (
        <div className="truncate font-mono text-[9.5px] text-slate-500" title={`CBU: ${cbu}`}>
          {cbu}
        </div>
      )}
    </div>
  );
}
