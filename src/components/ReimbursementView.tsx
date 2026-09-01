import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  ShieldAlert,
  DollarSign,
  Calendar,
  Folder,
  FileSpreadsheet,
  Check,
  CreditCard,
  Eye,
} from 'lucide-react';
import { Expense } from '../types';
import { formatCurrency, formatDate, formatUploadDateTime, exportToCSV } from '../utils/helpers';
import {
  sortExpenses,
  ExpenseSortField,
  ExpenseSortConfig,
  SortDirection,
} from '../utils/sorting';
import { MobileSortSelector } from './SortableHeader';

interface ReimbursementViewProps {
  expenses: Expense[];
  onToggleReimbursementStatus: (id: string) => void;
  onBatchSettleReimbursements: (ids: string[]) => void;
  onViewReceipt: (expense: Expense) => void;
  onProcessPayment?: (expense: Expense) => void;
}

export function ReimbursementView({
  expenses,
  onToggleReimbursementStatus,
  onBatchSettleReimbursements,
  onViewReceipt,
  onProcessPayment,
}: ReimbursementViewProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'settled'>('pending');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Sorting state - Defaults to 'createdAt' descending (Fecha de Carga)
  const [sortConfig, setSortConfig] = useState<ExpenseSortConfig>({
    field: 'createdAt',
    direction: 'desc',
  });

  const handleSortChange = (field: ExpenseSortField, direction: SortDirection) => {
    setSortConfig({ field, direction });
  };

  // Helper to check if expense requires pending payment execution (Reintegro o Pago a Proveedor)
  const isPendingPaymentType = (e: Expense) =>
    e.reimbursable ||
    e.paymentType === 'PAGO_PROVEEDOR' ||
    e.paymentType === 'REINTEGRO' ||
    e.paymentMethod === 'Pago a Proveedor' ||
    e.paymentMethod === 'Reintegro';

  // Filter pending vs settled
  const pendingExpenses = useMemo(() => {
    return expenses.filter((e) => isPendingPaymentType(e) && e.reimbursementStatus !== 'REIMBURSED');
  }, [expenses]);

  const settledExpenses = useMemo(() => {
    return expenses.filter((e) => isPendingPaymentType(e) && e.reimbursementStatus === 'REIMBURSED');
  }, [expenses]);

  const totalPendingAmount = useMemo(() => {
    return pendingExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [pendingExpenses]);

  const totalSettledAmount = useMemo(() => {
    return settledExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [settledExpenses]);

  const currentList = useMemo(() => {
    const list = activeTab === 'pending' ? pendingExpenses : settledExpenses;
    return sortExpenses(list, sortConfig);
  }, [activeTab, pendingExpenses, settledExpenses, sortConfig]);

  const handleSelectAll = () => {
    if (selectedIds.length === pendingExpenses.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendingExpenses.map((e) => e.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBatchMarkSettled = () => {
    if (selectedIds.length === 0) return;
    if (confirm(`¿Marcar ${selectedIds.length} gasto(s) como Reintegrados / Liquidados?`)) {
      onBatchSettleReimbursements(selectedIds);
      setSelectedIds([]);
    }
  };

  return (
    <div className="space-y-4">
      
      {/* Top Banner KPI Summary (Bento Tiles) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        
        <div className="bg-white border border-amber-200/90 rounded-3xl p-6 shadow-xs flex items-center justify-between bg-gradient-to-br from-amber-50/40 via-white to-white">
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center">
              <Clock className="w-4 h-4 mr-1.5 text-amber-600" />
              Total Pendiente de Reintegro
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-950 tracking-tight">
              {formatCurrency(totalPendingAmount)}
            </div>
            <p className="text-xs text-amber-700/80">
              {pendingExpenses.length} comprobante(s) a reembolsar a colaboradores
            </p>
          </div>
        </div>

        <div className="bg-white border border-emerald-200/90 rounded-3xl p-6 shadow-xs flex items-center justify-between bg-gradient-to-br from-emerald-50/30 via-white to-white">
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center">
              <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600" />
              Total Reintegrado / Liquidado
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-950 tracking-tight">
              {formatCurrency(totalSettledAmount)}
            </div>
            <p className="text-xs text-emerald-700/80">
              {settledExpenses.length} comprobante(s) ya liquidados y pagados
            </p>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        
        {/* Tab switcher header */}
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          <div className="flex space-x-2">
            <button
              onClick={() => {
                setActiveTab('pending');
                setSelectedIds([]);
              }}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'pending'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pendientes ({pendingExpenses.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('settled');
                setSelectedIds([]);
              }}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'settled'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Historial Liquidados ({settledExpenses.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Sort selector for Reimbursements */}
            <MobileSortSelector
              currentField={sortConfig.field}
              currentDirection={sortConfig.direction}
              onSortChange={handleSortChange}
              options={[
                { field: 'createdAt', label: 'Fecha Carga' },
                { field: 'date', label: 'Fecha Doc.' },
                { field: 'vendor', label: 'Proveedor' },
                { field: 'amount', label: 'Monto' },
                { field: 'project', label: 'Centro de Costos' },
                { field: 'category', label: 'Categoría' },
              ]}
            />

            {/* Batch Actions for Pending Tab */}
            {activeTab === 'pending' && pendingExpenses.length > 0 && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                >
                  {selectedIds.length === pendingExpenses.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>

                {selectedIds.length > 0 && (
                  <button
                    onClick={handleBatchMarkSettled}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-2xl shadow-xs flex items-center space-x-1.5 cursor-pointer transition active:scale-95"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Marcar {selectedIds.length} como Reintegrados</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* List of items */}
        {currentList.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold">
              {activeTab === 'pending'
                ? '¡Excelente! No hay reintegros pendientes de pago.'
                : 'Aún no hay reintegros liquidados en el historial.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {currentList.map((exp) => {
              const isSelected = selectedIds.includes(exp.id);
              const uploadDt = formatUploadDateTime(exp.createdAt, exp.date);

              return (
                <div
                  key={exp.id}
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                    isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-start space-x-3.5">
                    {/* Checkbox for batch selection on pending tab */}
                    {activeTab === 'pending' && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(exp.id)}
                        className="mt-1 w-4 h-4 text-indigo-600 rounded-sm border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      />
                    )}

                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-900 text-sm sm:text-base">
                          {exp.vendor}
                        </span>
                        {exp.invoiceNumber && (
                          <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
                            {exp.invoiceNumber}
                          </span>
                        )}
                      </div>

                      {exp.notes && (
                        <p className="text-xs text-slate-600">{exp.notes}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-0.5">
                        <span className="inline-flex items-center font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100/80 text-[10.5px]">
                          <Clock className="w-3 h-3 mr-1 text-indigo-600" />
                          Carga: {uploadDt.date} {uploadDt.time ? `• ${uploadDt.time}` : ''}
                        </span>
                        <span className="flex items-center">
                          <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                          Doc: {formatDate(exp.date)}
                        </span>
                        <span>•</span>
                        <span className="flex items-center font-medium text-slate-700">
                          <Folder className="w-3.5 h-3.5 mr-1 text-slate-400" />
                          {exp.project}
                        </span>
                        <span>•</span>
                        <span>{exp.category}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right side amount and button */}
                  <div className="flex items-center justify-between sm:justify-end space-x-3">
                    <button
                      onClick={() => onViewReceipt(exp)}
                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 hover:text-indigo-600 text-slate-600 transition cursor-pointer"
                      title="Ver / abrir comprobante"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    <div className="text-right">
                      <div className="text-base font-extrabold text-slate-900">
                        {formatCurrency(exp.amount, exp.currency)}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Pago original: {exp.paymentMethod}
                      </span>
                    </div>

                    {exp.reimbursementStatus === 'PENDING' ? (
                      <button
                        onClick={() => (onProcessPayment ? onProcessPayment(exp) : onToggleReimbursementStatus(exp.id))}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-xs active:scale-95"
                        title="Liquidar pago (Notificar por email y guardar en Google Drive)"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Pagar Reintegro</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onToggleReimbursementStatus(exp.id)}
                        className="px-3.5 py-2 rounded-2xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer shadow-xs"
                      >
                        Reabrir Pendiente
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

