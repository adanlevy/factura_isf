import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Receipt,
  Eye,
  Edit2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Lock,
  HardDrive,
  CreditCard,
  Search,
  Filter,
  Check,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
} from 'lucide-react';
import { Expense, CostCenter, UserProfile, Vendor } from '../types';
import { formatCurrency, formatDate, formatUploadDateTime, matchesSearch } from '../utils/helpers';
import { sortExpenses, ExpenseSortField, ExpenseSortConfig, SortDirection } from '../utils/sorting';
import { GoogleDriveLinkButton } from './GoogleDriveIcon';
import { AccountDetailsDisplay } from './AccountDetailsDisplay';

interface ExpenseListProps {
  expenses: Expense[];
  costCenters?: CostCenter[];
  vendors?: Vendor[];
  currentUser?: UserProfile | null;
  onEditExpense: (expense: Expense) => void;
  onViewReceipt: (expense: Expense) => void;
  onOpenNewModal: () => void;
  onDeleteExpense?: (id: string) => void;
  onReplaceReceipt?: (expense: Expense) => void;
}

export function ExpenseList({
  expenses,
  costCenters = [],
  vendors = [],
  currentUser,
  onEditExpense,
  onViewReceipt,
  onOpenNewModal,
  onDeleteExpense,
  onReplaceReceipt,
}: ExpenseListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'all' | '30days' | 'currentYear'>('all');
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [sortConfig, setSortConfig] = useState<ExpenseSortConfig>({ field: 'createdAt', direction: 'desc' });

  const handleSort = (field: ExpenseSortField) => {
    setSortConfig((prev) => {
      if (prev.field === field) {
        return { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return {
        field,
        direction: field === 'createdAt' || field === 'date' || field === 'amount' ? 'desc' : 'asc',
      };
    });
  };

  // 1. Filter only expenses submitted/uploaded by the current logged-in user
  const userExpenses = useMemo(() => {
    if (!currentUser?.email) return expenses;
    const userEmail = currentUser.email.toLowerCase().trim();
    const userName = (currentUser.name || '').toLowerCase().trim();

    return expenses.filter((e) => {
      const expEmail = (e.submittedByEmail || '').toLowerCase().trim();
      const expName = (e.submittedByName || '').toLowerCase().trim();

      if (expEmail) {
        return expEmail === userEmail;
      }
      if (expName && userName) {
        return expName === userName;
      }
      return false;
    });
  }, [expenses, currentUser]);

  // Filtered and sorted expenses for current user
  const filteredExpenses = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    const matching = [...userExpenses].filter((e) => {
      // Period filter
      if (periodFilter === '30days') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const minDateStr = thirtyDaysAgo.toISOString().slice(0, 10);
        if (e.date && e.date < minDateStr) return false;
      } else if (periodFilter === 'currentYear') {
        const currentYear = new Date().getFullYear().toString();
        if (e.date && !e.date.startsWith(currentYear)) return false;
      }

      // Search term filter
      if (!searchTerm.trim()) return true;
      return matchesSearch(
        [
          e.vendor,
          e.cuit,
          e.project,
          e.accountingNotes,
          e.notes,
          e.invoiceNumber,
          e.amount ? String(e.amount) : '',
          e.category,
          e.paymentMethod,
          e.bankDetails?.alias,
          e.bankDetails?.cbuCvu,
          e.bankDetails?.cuitCuil,
          e.bankDetails?.bankName,
          e.bankDetails?.accountHolder,
        ],
        searchTerm
      );
    });

    return sortExpenses(matching, sortConfig);
  }, [userExpenses, searchTerm, periodFilter, sortConfig]);

  const totalAmount = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  }, [filteredExpenses]);

  // Helper for rendering interactive table header with sort arrows
  const renderSortTh = (
    field: ExpenseSortField,
    label: string,
    align: 'left' | 'right' | 'center' = 'left',
    extraClass: string = ''
  ) => {
    const isActive = sortConfig.field === field;
    const isAsc = sortConfig.direction === 'asc';

    return (
      <th
        onClick={() => handleSort(field)}
        className={`px-3 py-3 select-none cursor-pointer group transition ${
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
        } ${isActive ? 'text-indigo-900 bg-indigo-50/60 font-bold' : 'hover:text-slate-800 hover:bg-slate-100/60'} ${extraClass}`}
        title={`Ordenar por ${label} (${isActive ? (isAsc ? 'Descendente' : 'Ascendente') : 'Hacer clic para ordenar'})`}
      >
        <div
          className={`inline-flex items-center gap-1.5 ${
            align === 'right' ? 'justify-end w-full' : align === 'center' ? 'justify-center w-full' : 'justify-start'
          }`}
        >
          <span>{label}</span>
          {isActive ? (
            isAsc ? (
              <ArrowUp className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500 shrink-0 transition" />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Receipt className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Mis Gastos</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Comprobantes de <strong className="text-slate-800">{currentUser?.name || currentUser?.email || 'tu usuario'}</strong>: <strong className="text-slate-800">{filteredExpenses.length}</strong> • Monto acumulado: <strong className="text-slate-800">{formatCurrency(totalAmount, 'ARS')}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search bar */}
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar proveedor, centro de costos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none w-full sm:w-56"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-slate-400 hover:text-slate-600 text-xs absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          <button
            onClick={onOpenNewModal}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-xs transition active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            <span>Cargar Comprobante</span>
          </button>
        </div>
      </div>

      {/* Desktop / Tablet Table View (hidden on small mobile, visible md+) */}
      <div className="hidden md:block bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-250px)] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50/95 text-slate-500 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200/80 sticky top-0 z-10 backdrop-blur-xs shadow-2xs">
              <tr>
                {renderSortTh('createdAt', 'Fecha Carga', 'left', 'whitespace-nowrap')}
                {renderSortTh('date', 'Fecha Doc.', 'left', 'whitespace-nowrap')}
                {renderSortTh('vendor', 'Nombre / Factura', 'left')}
                {renderSortTh('project', 'Centro de Costos', 'left')}
                {renderSortTh('amount', 'Monto', 'right', 'whitespace-nowrap')}
                {renderSortTh('status', 'Estado', 'center', 'whitespace-nowrap')}
                {renderSortTh('bankDetails', 'Datos de Cuenta', 'left')}
                {renderSortTh('notes', 'Notas Contables', 'left')}
                <th className="px-2.5 py-2.5 text-right whitespace-nowrap w-20 text-slate-500 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700 text-sm">
                      {searchTerm ? 'No se encontraron comprobantes con ese criterio' : 'No hay comprobantes cargados'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Utiliza el botón superior para subir una factura o ticket.</p>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => {
                  const isPendingPaymentType =
                    expense.reimbursable ||
                    expense.paymentType === 'PAGO_PROVEEDOR' ||
                    expense.paymentType === 'REINTEGRO' ||
                    expense.paymentMethod === 'Pago a Proveedor' ||
                    expense.paymentMethod === 'Reintegro' ||
                    expense.reimbursementStatus === 'PENDING';
                  const isPaid = isPendingPaymentType && expense.reimbursementStatus === 'REIMBURSED';
                  const isPending = isPendingPaymentType && expense.reimbursementStatus !== 'REIMBURSED';
                  const uploadDt = formatUploadDateTime(expense.createdAt, expense.date);
                  const paymentDateRaw = expense.reimbursedAt || expense.paymentConfirmedAt || expense.paymentProofAt;
                  const paymentDateFormatted = paymentDateRaw ? formatDate(paymentDateRaw) : null;

                  const matchedCc = costCenters.find(
                    (c) => (c.name || '').toLowerCase() === (expense.project || '').toLowerCase()
                  );

                  const appliesWithholdings = Boolean(expense.appliesWithholdings);
                  const hasWithholdingCert = Boolean(
                    expense.withholdingCertificateImage ||
                    expense.withholdingCertificateFileName ||
                    expense.withholdingCertificateDriveUrl
                  );
                  const isPendingWithholding = isPaid && appliesWithholdings && !hasWithholdingCert;

                  return (
                    <tr key={expense.id} className="hover:bg-slate-50/70 transition">
                      {/* 1. Fecha de Carga */}
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-xs">
                          {uploadDt.date}
                        </div>
                        {uploadDt.time && (
                          <div className="text-[9.5px] text-slate-500 font-medium flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5 text-slate-400" />
                            {uploadDt.time}
                          </div>
                        )}
                      </td>

                      {/* 2. Fecha Factura / Comprobante */}
                      <td className="px-2.5 py-2 whitespace-nowrap text-slate-600 font-medium text-xs">
                        {formatDate(expense.date)}
                      </td>

                      {/* 3. Nombre / Factura (2 renglones) */}
                      <td className="px-2.5 py-2 max-w-[160px]" title={expense.vendor || 'Sin nombre / factura'}>
                        <div className="font-bold text-slate-900 text-xs truncate">
                          {expense.vendor?.trim() ? (
                            expense.vendor
                          ) : (
                            <span className="text-slate-400 font-normal italic">Sin nombre</span>
                          )}
                        </div>
                        {expense.invoiceNumber ? (
                          <div className="text-[9.5px] text-slate-500 font-mono truncate">
                            {expense.invoiceNumber}
                          </div>
                        ) : expense.cuit ? (
                          <div className="text-[9.5px] text-slate-400 truncate">
                            CUIT: {expense.cuit}
                          </div>
                        ) : null}
                      </td>

                      {/* 4. Centro de Costos con logo de Google Drive chico sin botón externo */}
                      <td className="px-2.5 py-2 max-w-[140px]" title={expense.project}>
                        <div className="flex items-center space-x-1">
                          <span className="truncate font-bold text-slate-800 text-xs">
                            {expense.project}
                          </span>
                          <GoogleDriveLinkButton
                            driveUrl={expense.driveUploadedUrl || matchedCc?.driveUrl}
                            driveFolder={expense.driveFolderTarget || matchedCc?.driveFolder || expense.project}
                            size="xs"
                            iconOnly={true}
                            title={`Abrir carpeta de ${expense.project} en Google Drive`}
                          />
                        </div>
                        {expense.receiptImage && (
                          <div className="mt-0.5">
                            {expense.driveUploadStatus === 'ERROR' ? (
                              <span className="inline-flex items-center text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1 py-0.2 rounded">
                                <AlertCircle className="w-2.5 h-2.5 mr-0.5 text-rose-600 shrink-0" />
                                Fallo Drive
                              </span>
                            ) : expense.driveUploadStatus === 'PENDING' ? (
                              <span className="inline-flex items-center text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded">
                                <Clock className="w-2.5 h-2.5 mr-0.5 text-amber-600 animate-spin shrink-0" />
                                Subiendo...
                              </span>
                            ) : expense.driveUploadStatus === 'SUCCESS' ? (
                              <span className="inline-flex items-center text-[9px] text-emerald-700">
                                <Check className="w-2.5 h-2.5 mr-0.5 text-emerald-600 shrink-0" />
                                En Drive
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>

                      {/* 5. Monto */}
                      <td className="px-2.5 py-2 text-right font-extrabold text-slate-900 whitespace-nowrap text-xs">
                        {formatCurrency(expense.amount, expense.currency)}
                      </td>

                      {/* 6. Estado */}
                      <td className="px-2.5 py-2 text-center whitespace-nowrap">
                        {isPendingWithholding ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                              <Clock className="w-3 h-3 mr-1 text-amber-700" />
                              Pagado - Pend. Retención
                            </span>
                            {paymentDateFormatted && (
                              <span className="text-[9.5px] text-slate-500 font-medium whitespace-nowrap mt-0.5" title="Fecha de pago">
                                {paymentDateFormatted}
                              </span>
                            )}
                          </div>
                        ) : isPaid ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                              Pagado
                            </span>
                            {paymentDateFormatted && (
                              <span className="text-[9.5px] text-slate-500 font-medium whitespace-nowrap mt-0.5" title="Fecha de pago">
                                {paymentDateFormatted}
                              </span>
                            )}
                          </div>
                        ) : isPending ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-2.5 h-2.5 mr-1 text-amber-600" />
                            Pendiente
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Directo
                          </span>
                        )}
                      </td>

                      {/* 7. Datos de Cuenta */}
                      <td className="px-2.5 py-2 min-w-[125px] max-w-[150px]">
                        <AccountDetailsDisplay expense={expense} vendors={vendors} />
                      </td>

                      {/* 8. Notas Contables */}
                      <td className="px-2.5 py-2 max-w-[140px]" title={expense.accountingNotes || expense.notes || ''}>
                        {expense.accountingNotes || expense.notes ? (
                          <div className="text-[11px] text-slate-700 font-normal line-clamp-2" title={expense.accountingNotes || expense.notes}>
                            {expense.accountingNotes || expense.notes}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* 9. Acciones */}
                      <td className="px-2.5 py-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* Botón Ver Comprobante */}
                          <button
                            onClick={() => onViewReceipt(expense)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                            title="Ver / abrir comprobante"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Botón Editar */}
                          {!isPaid ? (
                            <button
                              onClick={() => onEditExpense(expense)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                              title="Editar comprobante"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span
                              className="inline-block p-1.5 text-slate-300 cursor-not-allowed"
                              title="Comprobante ya pagado (Bloqueado para edición)"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          )}

                          {/* Botón Eliminar */}
                          {onDeleteExpense && (
                            <button
                              onClick={() => setExpenseToDelete(expense)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title="Eliminar comprobante"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards View (displayed on mobile screens < md) */}
      <div className="block md:hidden space-y-3">
        {filteredExpenses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400">
            <Receipt className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700 text-sm">
              {searchTerm ? 'No se encontraron comprobantes' : 'No hay comprobantes cargados'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Utiliza el botón superior para subir una factura o ticket.</p>
          </div>
        ) : (
          filteredExpenses.map((expense) => {
            const isPendingPaymentType =
              expense.reimbursable ||
              expense.paymentType === 'PAGO_PROVEEDOR' ||
              expense.paymentType === 'REINTEGRO' ||
              expense.paymentMethod === 'Pago a Proveedor' ||
              expense.paymentMethod === 'Reintegro' ||
              expense.reimbursementStatus === 'PENDING';
            const isPaid = isPendingPaymentType && expense.reimbursementStatus === 'REIMBURSED';
            const isPending = isPendingPaymentType && expense.reimbursementStatus !== 'REIMBURSED';
            const uploadDt = formatUploadDateTime(expense.createdAt, expense.date);
            const paymentDateRaw = expense.reimbursedAt || expense.paymentConfirmedAt || expense.paymentProofAt;
            const paymentDateFormatted = paymentDateRaw ? formatDate(paymentDateRaw) : null;

            const appliesWithholdings = Boolean(expense.appliesWithholdings);
            const hasWithholdingCert = Boolean(
              expense.withholdingCertificateImage ||
              expense.withholdingCertificateFileName ||
              expense.withholdingCertificateDriveUrl
            );
            const isPendingWithholding = isPaid && appliesWithholdings && !hasWithholdingCert;

            const matchedCc = costCenters.find(
              (c) => (c.name || '').toLowerCase() === (expense.project || '').toLowerCase()
            );

            return (
              <div
                key={`card-${expense.id}`}
                className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3 transition active:border-indigo-300"
              >
                {/* Header row: Fecha de Carga & Estado & Actions */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="font-bold text-slate-800">Cargado:</span>
                    <span>{uploadDt.date} {uploadDt.time ? `• ${uploadDt.time}` : ''}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isPendingWithholding ? (
                      <div className="flex flex-col items-end">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                          <Clock className="w-3 h-3 mr-1 text-amber-700" />
                          Pagado - Pend. Retención
                        </span>
                        {paymentDateFormatted && (
                          <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap mt-0.5" title="Fecha de pago">
                            {paymentDateFormatted}
                          </span>
                        )}
                      </div>
                    ) : isPaid ? (
                      <div className="flex flex-col items-end">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                          Pagado
                        </span>
                        {paymentDateFormatted && (
                          <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap mt-0.5" title="Fecha de pago">
                            {paymentDateFormatted}
                          </span>
                        )}
                      </div>
                    ) : isPending ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <Clock className="w-3 h-3 mr-1 text-amber-600" />
                        Pendiente
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                        Directo
                      </span>
                    )}

                    {/* Acciones */}
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        onClick={() => onViewReceipt(expense)}
                        className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200 bg-white cursor-pointer"
                        title="Ver / abrir comprobante"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {!isPaid ? (
                        <button
                          onClick={() => onEditExpense(expense)}
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200 bg-white"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="p-1.5 text-slate-300">
                          <Lock className="w-3.5 h-3.5" />
                        </span>
                      )}

                      {onDeleteExpense && (
                        <button
                          onClick={() => setExpenseToDelete(expense)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 bg-white"
                          title="Eliminar comprobante"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Main info row: Vendor and Amount */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-900 truncate" title={expense.vendor || 'Sin nombre / factura'}>
                      {expense.vendor?.trim() ? (
                        expense.vendor
                      ) : (
                        <span className="text-slate-400 font-normal italic">Sin nombre</span>
                      )}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        Doc: {formatDate(expense.date)}
                      </span>
                      {expense.invoiceNumber && (
                        <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                          {expense.invoiceNumber}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-base font-extrabold text-slate-900 tracking-tight">
                      {formatCurrency(expense.amount, expense.currency)}
                    </span>
                  </div>
                </div>

                {/* Meta details: Centro de Costos & Notas Contables */}
                <div className="space-y-1.5 text-xs pt-1 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Centro de Costos</span>
                    <div className="flex items-center gap-1 mt-0.5 truncate">
                      <span className="font-bold text-slate-800 truncate text-[11px]">{expense.project}</span>
                      <GoogleDriveLinkButton
                        driveUrl={expense.driveUploadedUrl || matchedCc?.driveUrl}
                        driveFolder={expense.driveFolderTarget || matchedCc?.driveFolder || expense.project}
                        size="xs"
                        iconOnly={true}
                        title={`Abrir carpeta de ${expense.project} en Google Drive`}
                      />
                    </div>
                  </div>
                  {(expense.accountingNotes || expense.notes) && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Notas Contables</span>
                      <span className="font-medium text-slate-700 text-[11px] block mt-0.5">{expense.accountingNotes || expense.notes}</span>
                    </div>
                  )}
                </div>

                {/* Bank details */}
                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Datos de Cuenta</span>
                  <AccountDetailsDisplay expense={expense} vendors={vendors} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de confirmación de eliminación individual */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">¿Eliminar Comprobante?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Se eliminará el gasto de <strong className="text-slate-700">{expenseToDelete.vendor}</strong> por{' '}
                <strong className="text-slate-900">{formatCurrency(expenseToDelete.amount, expenseToDelete.currency)}</strong> tanto de Mis Gastos como de Gestión de Pagos.
              </p>
            </div>
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setExpenseToDelete(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-2xl cursor-pointer transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteExpense && expenseToDelete) {
                    onDeleteExpense(expenseToDelete.id);
                  }
                  setExpenseToDelete(null);
                }}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-2xl cursor-pointer shadow-md transition"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

