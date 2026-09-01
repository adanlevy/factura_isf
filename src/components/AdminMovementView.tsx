import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Mail,
  Send,
  CheckCircle2,
  Clock,
  Building,
  CreditCard,
  User,
  Search,
  DollarSign,
  Calendar,
  AlertCircle,
  Receipt,
  Edit2,
  CheckSquare,
  Square,
  Download,
  AlertTriangle,
  RotateCcw,
  Eye,
  Check,
  Building2,
  Trash2,
  HardDrive,
  ExternalLink,
  X,
  Cloud,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  FileCheck,
} from 'lucide-react';
import { Expense, CostCenter, Vendor } from '../types';
import {
  formatCurrency,
  formatDate,
  formatUploadDateTime,
  exportToCSV,
  generateDriveFileName,
} from '../utils/helpers';
import { getSmartSortedOptions, sortExpenses, ExpenseSortField, ExpenseSortConfig, SortDirection } from '../utils/sorting';
import { GoogleDriveLinkButton } from './GoogleDriveIcon';
import { AccountDetailsDisplay } from './AccountDetailsDisplay';

interface AdminMovementViewProps {
  expenses?: Expense[];
  costCenters?: CostCenter[];
  vendors?: Vendor[];
  onToggleReimbursementStatus: (id: string) => void;
  onDirectPayExpense?: (expense: Expense) => Promise<void> | void;
  onProcessPayment?: (expense: Expense) => void;
  onRequestBankDetails?: (expense: Expense) => Promise<void> | void;
  onViewReceipt: (expense: Expense) => void;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense?: (id: string) => void;
  onBatchDeleteExpenses?: (ids: string[]) => void;
  onBatchSettleReimbursements: (ids: string[]) => void;
  onRetryDriveUpload?: (expense: Expense) => void;
  onAddVendor?: (vendor: Omit<Vendor, 'id' | 'createdAt'>) => void;
  onUpdateVendor?: (vendor: Vendor) => void;
  onReplaceReceipt?: (expense: Expense) => void;
  onOpenWithholdingModal?: (expense: Expense) => void;
  initialFilterVendor?: string;
}

export function AdminMovementView({
  expenses = [],
  costCenters = [],
  vendors = [],
  onToggleReimbursementStatus,
  onDirectPayExpense,
  onProcessPayment,
  onRequestBankDetails,
  onViewReceipt,
  onEditExpense,
  onDeleteExpense,
  onBatchDeleteExpenses,
  onBatchSettleReimbursements,
  onRetryDriveUpload,
  onAddVendor,
  onUpdateVendor,
  onReplaceReceipt,
  onOpenWithholdingModal,
  initialFilterVendor = '',
}: AdminMovementViewProps) {
  const [searchTerm, setSearchTerm] = useState(initialFilterVendor);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'REIMBURSED' | 'PENDING_WITHHOLDING' | 'NOT_APPLICABLE' | 'MISSING_BANK'>('ALL');
  const [filterCostCenter, setFilterCostCenter] = useState<string>('ALL');
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [vendorSavedToast, setVendorSavedToast] = useState<string | null>(null);
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

  const handleSaveVendorFromExpense = (expense: Expense) => {
    if (!expense.vendor?.trim() || !onAddVendor) return;
    const existing = vendors.find(
      (v) => (v.name || '').toLowerCase() === expense.vendor.trim().toLowerCase() ||
             (expense.cuit && v.cuit && v.cuit === expense.cuit)
    );
    if (existing && onUpdateVendor) {
      onUpdateVendor({
        ...existing,
        name: expense.vendor.trim(),
        cuit: expense.cuit || existing.cuit,
        bankDetails: {
          ...existing.bankDetails,
          ...expense.bankDetails,
        },
      });
      setVendorSavedToast(`Proveedor "${expense.vendor}" actualizado.`);
    } else {
      onAddVendor({
        name: expense.vendor.trim(),
        cuit: expense.cuit || '',
        bankDetails: expense.bankDetails || {
          bankName: '',
          accountType: 'Indefinido',
          cbuCvu: '',
          alias: '',
          cuitCuil: expense.cuit || '',
          accountHolder: expense.vendor.trim(),
        },
        notes: `Guardado desde comprobante ${expense.invoiceNumber || expense.date}`,
      });
      setVendorSavedToast(`Proveedor "${expense.vendor}" guardado en el catálogo.`);
    }
    setTimeout(() => setVendorSavedToast(null), 3500);
  };

  // Selected Row IDs
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // In-app deletion and batch modals (prevents iframe confirm() blockage)
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [showBatchSettleModal, setShowBatchSettleModal] = useState(false);
  const [batchSettleWarning, setBatchSettleWarning] = useState<string | null>(null);

  // Unique cost centers for dropdowns with smart sorting
  const rawCostCenters = useMemo(() => {
    return Array.from(new Set((expenses || []).map((e) => e?.project).filter(Boolean))) as string[];
  }, [expenses]);

  const sortedCostCenters = useMemo(() => {
    const history = (expenses || []).map((e) => e?.project).filter(Boolean) as string[];
    return getSmartSortedOptions(rawCostCenters, history, 3);
  }, [rawCostCenters, expenses]);

  const filteredExpenses = useMemo(() => {
    const matching = (expenses || []).filter((e) => {
      if (!e) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchVendor = (e.vendor || '').toLowerCase().includes(term);
        const matchSubmitter = (e.submittedByName || e.submittedByEmail || '').toLowerCase().includes(term);
        const matchInvoice = (e.invoiceNumber || '').toLowerCase().includes(term);
        const matchNotes = (e.accountingNotes || e.notes || '').toLowerCase().includes(term);
        const matchCostCenter = (e.project || '').toLowerCase().includes(term);
        const matchAlias = (e.bankDetails?.alias || '').toLowerCase().includes(term);
        const matchCbu = (e.bankDetails?.cbuCvu || '').toLowerCase().includes(term);
        const matchAccountHolder = (e.bankDetails?.accountHolder || '').toLowerCase().includes(term);
        const matchPaymentMethod = (e.paymentMethod || '').toLowerCase().includes(term);
        if (!matchVendor && !matchSubmitter && !matchInvoice && !matchNotes && !matchCostCenter && !matchAlias && !matchCbu && !matchAccountHolder && !matchPaymentMethod) {
          return false;
        }
      }

      if (filterStatus !== 'ALL') {
        const isPendingItem =
          (e.reimbursable ||
            e.paymentType === 'PAGO_PROVEEDOR' ||
            e.paymentType === 'REINTEGRO' ||
            e.paymentMethod === 'Pago a Proveedor' ||
            e.paymentMethod === 'Reintegro') &&
          e.reimbursementStatus !== 'REIMBURSED';
        const isPaidItem =
          (e.reimbursable ||
            e.paymentType === 'PAGO_PROVEEDOR' ||
            e.paymentType === 'REINTEGRO' ||
            e.paymentMethod === 'Pago a Proveedor' ||
            e.paymentMethod === 'Reintegro') &&
          e.reimbursementStatus === 'REIMBURSED';
        const hasWithholdingCert = Boolean(
          e.withholdingCertificateImage ||
          e.withholdingCertificateFileName ||
          e.withholdingCertificateDriveUrl
        );
        const isPendingWithholdingItem = isPaidItem && Boolean(e.appliesWithholdings) && !hasWithholdingCert;

        if (filterStatus === 'PENDING' && !isPendingItem) return false;
        if (filterStatus === 'PENDING_WITHHOLDING' && !isPendingWithholdingItem) return false;
        if (filterStatus === 'REIMBURSED' && !isPaidItem) return false;
        if (filterStatus === 'NOT_APPLICABLE' && (isPendingItem || isPaidItem)) return false;
        if (filterStatus === 'MISSING_BANK') {
          if (!isPendingItem) return false;
          if (e.bankDetails?.cbuCvu || e.bankDetails?.alias) return false;
        }
      }

      if (filterCostCenter !== 'ALL' && (e.project || '') !== filterCostCenter) {
        return false;
      }

      return true;
    });

    return sortExpenses(matching, sortConfig);
  }, [expenses, searchTerm, filterStatus, filterCostCenter, sortConfig]);

  // Selection calculations
  const allFilteredSelected =
    filteredExpenses.length > 0 && filteredExpenses.every((e) => selectedIds.includes(e.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredExpenses.map((e) => e.id));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectedExpenses = useMemo(() => {
    return expenses.filter((e) => selectedIds.includes(e.id));
  }, [expenses, selectedIds]);

  const selectedTotalAmount = useMemo(() => {
    return selectedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [selectedExpenses]);

  // Mass actions
  const handleOpenBatchSettleModal = () => {
    const pendingSelectedIds = selectedExpenses
      .filter((e) => e.reimbursable && e.reimbursementStatus === 'PENDING')
      .map((e) => e.id);
    if (pendingSelectedIds.length === 0) {
      setBatchSettleWarning('Ninguno de los comprobantes seleccionados está en estado Pendiente de Reintegro.');
      return;
    }
    setBatchSettleWarning(null);
    setShowBatchSettleModal(true);
  };

  const handleConfirmBatchSettle = () => {
    const pendingSelectedIds = selectedExpenses
      .filter((e) => e.reimbursable && e.reimbursementStatus === 'PENDING')
      .map((e) => e.id);
    if (pendingSelectedIds.length > 0) {
      onBatchSettleReimbursements(pendingSelectedIds);
      setSelectedIds([]);
    }
    setShowBatchSettleModal(false);
  };

  const handleConfirmBatchDelete = () => {
    if (selectedIds.length === 0) return;
    if (onBatchDeleteExpenses) {
      onBatchDeleteExpenses(selectedIds);
    } else if (onDeleteExpense) {
      selectedIds.forEach((id) => onDeleteExpense(id));
    }
    setSelectedIds([]);
    setShowBatchDeleteModal(false);
  };

  const handleConfirmSingleDelete = () => {
    if (!expenseToDelete) return;
    if (onDeleteExpense) {
      onDeleteExpense(expenseToDelete.id);
    }
    setSelectedIds((prev) => prev.filter((id) => id !== expenseToDelete.id));
    setExpenseToDelete(null);
  };

  const handleExportSelectedCSV = () => {
    const toExport = selectedExpenses.length > 0 ? selectedExpenses : filteredExpenses;
    exportToCSV(toExport);
  };

  // Payment flow execution (triggers upload modal & confirmation)
  const handleDirectPay = async (expense: Expense) => {
    if (onProcessPayment) {
      onProcessPayment(expense);
      return;
    }
    if (onDirectPayExpense) {
      setSendingEmailId(`${expense.id}-PAYMENT_CONFIRMATION`);
      try {
        await onDirectPayExpense(expense);
      } finally {
        setSendingEmailId(null);
      }
    } else {
      onToggleReimbursementStatus(expense.id);
    }
  };

  const handleRequestBank = async (expense: Expense) => {
    setSendingEmailId(`${expense.id}-REQUEST_BANK_DETAILS`);
    try {
      if (onRequestBankDetails) {
        await onRequestBankDetails(expense);
      }
    } finally {
      setSendingEmailId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <CreditCard className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Gestión de Pagos</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Panel administrativo contable para liquidación de reintegros, exportación y aviso por email.
          </p>
        </div>

        {/* Action Controls & Batch Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center bg-indigo-50 border border-indigo-200 rounded-2xl px-3 py-1.5 text-xs text-indigo-900 font-semibold gap-2">
              <span>{selectedIds.length} seleccionado(s) ({formatCurrency(selectedTotalAmount)})</span>
              <button
                onClick={handleOpenBatchSettleModal}
                className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition cursor-pointer"
                title="Pagar comprobantes seleccionados"
              >
                Pagar
              </button>
              <button
                onClick={() => setShowBatchDeleteModal(true)}
                className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold transition cursor-pointer flex items-center space-x-1"
                title="Eliminar comprobantes seleccionados"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-600" />
                <span>Eliminar</span>
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="px-2 py-1 text-slate-500 hover:text-slate-700 text-[11px] font-medium cursor-pointer"
              >
                Limpiar
              </button>
            </div>
          )}

          <button
            onClick={handleExportSelectedCSV}
            className="inline-flex items-center px-3.5 py-2 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition cursor-pointer"
            title="Exportar registros filtrados o seleccionados a CSV"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por proveedor, solicitante, alias, CBU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9.5 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
          />
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="ALL">Todos los Estados</option>
          <option value="PENDING">Pendientes de Reintegro / Pago</option>
          <option value="PENDING_WITHHOLDING">Pagado - Pendiente Retención</option>
          <option value="MISSING_BANK">Pendientes Sin Datos Bancarios</option>
          <option value="REIMBURSED">Ya Reintegrados / Pagados</option>
          <option value="NOT_APPLICABLE">Pago Institucional Directo</option>
        </select>

        {/* Cost center filter */}
        <select
          value={filterCostCenter}
          onChange={(e) => setFilterCostCenter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 max-w-[220px]"
        >
          <option value="ALL">Todos los Centros de Costos</option>
          {sortedCostCenters.frequent && sortedCostCenters.frequent.length > 0 && (
            <optgroup label="Más Utilizados">
              {sortedCostCenters.frequent.map((cc) => (
                <option key={`freq-opt-${cc}`} value={cc}>
                  ★ {cc}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Todos los Centros de Costos">
            {(sortedCostCenters.alphabetical || []).map((cc) => (
              <option key={`all-opt-${cc}`} value={cc}>
                {cc}
              </option>
            ))}
          </optgroup>
        </select>

        <span className="text-xs text-slate-400 ml-auto font-medium">
          {filteredExpenses.length} registro{filteredExpenses.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Vendor Saved Toast Banner */}
      {vendorSavedToast && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{vendorSavedToast}</span>
          </div>
          <button
            onClick={() => setVendorSavedToast(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Desktop / Tablet Table View (hidden on mobile, visible md+) */}
      <div className="hidden md:block bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-250px)] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50/95 text-slate-500 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200/80 sticky top-0 z-10 backdrop-blur-xs shadow-2xs">
              <tr>
                <th className="px-2 py-2.5 text-center w-7">
                  <button
                    onClick={toggleSelectAll}
                    className="text-slate-400 hover:text-slate-700 transition cursor-pointer"
                    title={allFilteredSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>
                </th>
                {(() => {
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
                        className={`px-2 py-2.5 select-none cursor-pointer group transition ${
                          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                        } ${isActive ? 'text-indigo-900 bg-indigo-50/60 font-bold' : 'hover:text-slate-800 hover:bg-slate-100/60'} ${extraClass}`}
                        title={`Ordenar por ${label} (${isActive ? (isAsc ? 'Descendente' : 'Ascendente') : 'Hacer clic para ordenar'})`}
                      >
                        <div
                          className={`inline-flex items-center gap-1 ${
                            align === 'right' ? 'justify-end w-full' : align === 'center' ? 'justify-center w-full' : 'justify-start'
                          }`}
                        >
                          <span>{label}</span>
                          {isActive ? (
                            isAsc ? (
                              <ArrowUp className="w-3 h-3 text-indigo-600 shrink-0" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-indigo-600 shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-2.5 h-2.5 text-slate-300 group-hover:text-slate-500 shrink-0 transition" />
                          )}
                        </div>
                      </th>
                    );
                  };

                  return (
                    <>
                      {renderSortTh('createdAt', 'Fecha Carga', 'left', 'whitespace-nowrap')}
                      {renderSortTh('date', 'Fecha Doc.', 'left', 'whitespace-nowrap')}
                      {renderSortTh('submittedByName', 'Enviado por', 'left')}
                      {renderSortTh('vendor', 'Proveedor / Factura', 'left')}
                      {renderSortTh('project', 'Centro de Costos', 'left')}
                      {renderSortTh('amount', 'Monto', 'right', 'whitespace-nowrap')}
                      {renderSortTh('status', 'Estado', 'center', 'whitespace-nowrap')}
                      {renderSortTh('bankDetails', 'Datos de Cuenta', 'left')}
                      {renderSortTh('notes', 'Notas Contables', 'left')}
                    </>
                  );
                })()}
                <th className="px-2 py-2.5 text-right whitespace-nowrap w-20 text-slate-500 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-slate-400">
                    No se encontraron comprobantes con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => {
                  const isSelected = selectedIds.includes(expense.id);
                  const isPendingPaymentType =
                    expense.reimbursable ||
                    expense.paymentType === 'PAGO_PROVEEDOR' ||
                    expense.paymentType === 'REINTEGRO' ||
                    expense.paymentMethod === 'Pago a Proveedor' ||
                    expense.paymentMethod === 'Reintegro';
                  const isPaid = isPendingPaymentType && expense.reimbursementStatus === 'REIMBURSED';
                  const isPending = isPendingPaymentType && expense.reimbursementStatus !== 'REIMBURSED';
                  const hasBankData = Boolean(expense.bankDetails?.cbuCvu || expense.bankDetails?.alias);
                  const isVendorInCatalog = Boolean(
                    expense.vendor?.trim() &&
                    vendors.some(
                      (v) => (v.name || '').toLowerCase() === expense.vendor.trim().toLowerCase() ||
                             (expense.cuit && v.cuit && v.cuit === expense.cuit)
                    )
                  );
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
                    <tr
                      key={expense.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isSelected ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => toggleSelectRow(expense.id)}
                          className="text-slate-400 hover:text-slate-700 transition cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>

                      {/* 1. Fecha de Carga */}
                      <td className="px-2 py-2 whitespace-nowrap">
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

                      {/* 2. Fecha Factura / Doc */}
                      <td className="px-2 py-2 whitespace-nowrap text-slate-600 font-medium text-xs">
                        {formatDate(expense.date)}
                      </td>

                      {/* 3. Enviado por (Nombre y abajo email) */}
                      <td className="px-2 py-2 max-w-[130px]" title={expense.submittedByEmail || expense.submittedByName || 'Sin remitente'}>
                        <div className="font-bold text-slate-900 text-xs truncate flex items-center gap-1">
                          <User className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {expense.submittedByName || expense.submittedByEmail?.split('@')[0] || 'No especificado'}
                          </span>
                        </div>
                        {expense.submittedByEmail && (
                          <div className="text-[10px] text-slate-500 font-normal truncate pl-3.5">
                            {expense.submittedByEmail}
                          </div>
                        )}
                      </td>

                      {/* 4. Proveedor / Comprobante (2 renglones) */}
                      <td className="px-2 py-2 max-w-[145px]" title={expense.vendor}>
                        <div className="font-bold text-slate-900 text-xs truncate flex items-center gap-1">
                          <span className="truncate">{expense.vendor || 'Comercio'}</span>
                          {isVendorInCatalog && (
                            <span className="inline-flex items-center text-sky-700 bg-sky-50 border border-sky-200 px-1 py-0.2 rounded text-[8.5px]" title="Proveedor registrado en el catálogo">
                              <Cloud className="w-2.5 h-2.5 text-sky-600" />
                            </span>
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

                      {/* 5. Centro de Costos y Enlace a Google Drive */}
                      <td className="px-2 py-2 max-w-[130px]" title={expense.project}>
                        <div className="flex items-center space-x-1">
                          <span className="text-xs font-bold text-slate-800 truncate">
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

                        {/* Indicador de Estado de Subida a Google Drive */}
                        {expense.receiptImage && (
                          <div className="mt-0.5">
                            {expense.driveUploadStatus === 'ERROR' ? (
                              <div className="flex items-center gap-1">
                                <span className="inline-flex items-center text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1 py-0.2 rounded">
                                  <AlertCircle className="w-2.5 h-2.5 mr-0.5 text-rose-600 shrink-0" />
                                  Fallo Drive
                                </span>
                                {onRetryDriveUpload && (
                                  <button
                                    type="button"
                                    onClick={() => onRetryDriveUpload(expense)}
                                    className="text-[9px] font-bold text-rose-700 hover:text-rose-900 underline cursor-pointer inline-flex items-center gap-0.5"
                                    title="Reintentar subida a Google Drive"
                                  >
                                    <RotateCcw className="w-2 h-2" />
                                    Reintentar
                                  </button>
                                )}
                              </div>
                            ) : expense.driveUploadStatus === 'PENDING' ? (
                              <span className="inline-flex items-center text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded">
                                <Clock className="w-2.5 h-2.5 mr-0.5 text-amber-600 animate-spin shrink-0" />
                                Subiendo...
                              </span>
                            ) : expense.driveUploadStatus === 'SUCCESS' ? (
                              <span
                                className="inline-flex items-center text-[9px] text-emerald-700"
                                title={`Guardado en Drive: ${expense.driveUploadedFileName || expense.driveFolderTarget || ''}`}
                              >
                                <Check className="w-2.5 h-2.5 mr-0.5 text-emerald-600 shrink-0" />
                                En Drive
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>

                      {/* 6. Monto */}
                      <td className="px-2 py-2 text-right font-extrabold text-slate-900 whitespace-nowrap text-xs">
                        {formatCurrency(expense.amount, expense.currency)}
                      </td>

                      {/* 7. Columna Reintegro / Pago */}
                      <td className="px-2 py-2 text-center whitespace-nowrap">
                        {isPaid ? (
                          <div className="flex flex-col items-center gap-1">
                            <div className="inline-flex items-center space-x-1">
                              {isPendingWithholding ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onOpenWithholdingModal) {
                                      onOpenWithholdingModal(expense);
                                    } else if (confirm(`¿Deseas revertir el pago de "${expense.vendor}" a estado Pendiente?`)) {
                                      onToggleReimbursementStatus(expense.id);
                                    }
                                  }}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition cursor-pointer shadow-2xs"
                                  title="Pagado - Pendiente de Certificado de Retención. Clic para gestionar certificado."
                                >
                                  <Clock className="w-3 h-3 mr-1 text-amber-700" />
                                  <span>Pagado - Pend. Retención</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`¿Deseas revertir el pago de "${expense.vendor}" a estado Pendiente?`)) {
                                      onToggleReimbursementStatus(expense.id);
                                    }
                                  }}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 hover:bg-amber-50 text-emerald-700 hover:text-amber-800 border border-emerald-200 hover:border-amber-300 transition cursor-pointer group"
                                  title="Pagado. Clic para revertir a estado Pendiente"
                                >
                                  <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600 group-hover:hidden" />
                                  <RotateCcw className="w-3 h-3 mr-1 text-amber-600 hidden group-hover:inline" />
                                  <span>Pagado</span>
                                </button>
                              )}

                              {expense.paymentConfirmedAt && (
                                <span className="inline-flex items-center text-[9.5px] font-medium text-emerald-600" title="Aviso enviado por email">
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                </span>
                              )}
                            </div>

                            {/* Acceso rápido a subir retención si está pendiente */}
                            {isPendingWithholding && onOpenWithholdingModal && (
                              <button
                                type="button"
                                onClick={() => onOpenWithholdingModal(expense)}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs transition cursor-pointer"
                                title="Subir Certificado de Retenciones"
                              >
                                <FileCheck className="w-2.5 h-2.5 mr-0.5" />
                                <span>Subir Retención</span>
                              </button>
                            )}

                            {paymentDateFormatted && (
                              <span className="text-[9.5px] text-slate-500 font-medium whitespace-nowrap mt-0.5" title="Fecha de pago">
                                {paymentDateFormatted}
                              </span>
                            )}
                          </div>
                        ) : isPending ? (
                          <button
                            onClick={() => handleDirectPay(expense)}
                            disabled={sendingEmailId === `${expense.id}-PAYMENT_CONFIRMATION`}
                            className="inline-flex items-center px-2 py-0.5 rounded-xl text-[10.5px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                            title="Pagar: Envía confirmación por email y guarda en Google Drive"
                          >
                            <CreditCard className="w-2.5 h-2.5 mr-1" />
                            {sendingEmailId === `${expense.id}-PAYMENT_CONFIRMATION` ? 'Pagando...' : 'Pagar'}
                          </button>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                            Directo
                          </span>
                        )}
                      </td>

                      {/* 8. Datos de Cuenta / Beneficiario */}
                      <td className="px-2 py-2 min-w-[125px] max-w-[155px]">
                        <div className="space-y-1">
                          <AccountDetailsDisplay expense={expense} />
                          {expense.reimbursable && !expense.bankDetails?.alias && !expense.bankDetails?.cbuCvu && isPending && (
                            <div className="pt-0.5">
                              <button
                                onClick={() => handleRequestBank(expense)}
                                disabled={sendingEmailId === `${expense.id}-REQUEST_BANK_DETAILS`}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition active:scale-95 cursor-pointer disabled:opacity-50"
                                title={`Enviar correo a ${expense.submittedByEmail || 'solicitante'} solicitando CBU/Alias`}
                              >
                                <Mail className="w-2.5 h-2.5 mr-0.5 text-amber-700" />
                                {sendingEmailId === `${expense.id}-REQUEST_BANK_DETAILS`
                                  ? '...'
                                  : expense.bankDetailsRequestedAt
                                  ? 'Re-pedir'
                                  : 'Pedir Datos'}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 9. Notas Contables */}
                      <td className="px-2 py-2 max-w-[130px]" title={expense.accountingNotes || expense.notes || ''}>
                        {expense.accountingNotes || expense.notes ? (
                          <div className="text-[11px] text-slate-700 font-normal line-clamp-2" title={expense.accountingNotes || expense.notes}>
                            {expense.accountingNotes || expense.notes}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* 10. Acciones (Ver comprobante, Editar, Eliminar) */}
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onViewReceipt(expense)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                            title="Ver / abrir comprobante"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onEditExpense(expense)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

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
            <p className="font-semibold text-slate-700 text-sm">No se encontraron comprobantes</p>
            <p className="text-xs text-slate-400 mt-1">Prueba cambiando los filtros o el término de búsqueda.</p>
          </div>
        ) : (
          filteredExpenses.map((expense) => {
            const isSelected = selectedIds.includes(expense.id);
            const isPendingPaymentType =
              expense.reimbursable ||
              expense.paymentType === 'PAGO_PROVEEDOR' ||
              expense.paymentType === 'REINTEGRO' ||
              expense.paymentMethod === 'Pago a Proveedor' ||
              expense.paymentMethod === 'Reintegro';
            const isPaid = isPendingPaymentType && expense.reimbursementStatus === 'REIMBURSED';
            const isPending = isPendingPaymentType && expense.reimbursementStatus !== 'REIMBURSED';
            const hasBankData = Boolean(expense.bankDetails?.cbuCvu || expense.bankDetails?.alias);
            const isVendorInCatalog = Boolean(
              expense.vendor &&
                vendors.some(
                  (v) =>
                    (v.name && v.name.toLowerCase().trim() === expense.vendor.toLowerCase().trim()) ||
                    (expense.cuit && v.cuit && v.cuit === expense.cuit)
                )
            );
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
                key={`admin-card-${expense.id}`}
                className={`bg-white rounded-2xl border p-4 shadow-xs space-y-3 transition ${
                  isSelected ? 'border-indigo-500 bg-indigo-50/20' : 'border-slate-200/90'
                }`}
              >
                {/* Header row: Checkbox + Fecha de Carga & Reintegro Status & Direct Pay */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSelectRow(expense.id)}
                      className="text-slate-400 hover:text-slate-700 transition cursor-pointer p-0.5"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="font-bold text-slate-800">Cargado:</span>
                      <span>{uploadDt.date} {uploadDt.time ? `• ${uploadDt.time}` : ''}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isPaid ? (
                      <div className="flex flex-col items-end gap-1">
                        {isPendingWithholding ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (onOpenWithholdingModal) {
                                onOpenWithholdingModal(expense);
                              } else if (confirm(`¿Deseas revertir el pago de "${expense.vendor}" a estado Pendiente?`)) {
                                onToggleReimbursementStatus(expense.id);
                              }
                            }}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition cursor-pointer shadow-2xs"
                            title="Pagado - Pendiente de Certificado de Retención. Clic para gestionar."
                          >
                            <Clock className="w-3 h-3 mr-1 text-amber-700" />
                            <span>Pagado - Pend. Retención</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`¿Deseas revertir el pago de "${expense.vendor}" a estado Pendiente?`)) {
                                onToggleReimbursementStatus(expense.id);
                              }
                            }}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 hover:bg-amber-50 text-emerald-700 hover:text-amber-800 border border-emerald-200 hover:border-amber-300 transition cursor-pointer"
                            title="Pagado. Clic para revertir a estado Pendiente"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                            <span>Pagado</span>
                          </button>
                        )}
                        {paymentDateFormatted && (
                          <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap mt-0.5" title="Fecha de pago">
                            {paymentDateFormatted}
                          </span>
                        )}
                      </div>
                    ) : isPending ? (
                      <button
                        onClick={() => handleDirectPay(expense)}
                        disabled={sendingEmailId === `${expense.id}-PAYMENT_CONFIRMATION`}
                        className="inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                        title="Pagar ahora"
                      >
                        <CreditCard className="w-3 h-3 mr-1" />
                        {sendingEmailId === `${expense.id}-PAYMENT_CONFIRMATION` ? '...' : 'Pagar'}
                      </button>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                        Directo
                      </span>
                    )}
                  </div>
                </div>

                {/* Main info row: Vendor and Amount */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5" title={expense.vendor}>
                        <span>{expense.vendor || 'Comercio / Proveedor'}</span>
                        {isVendorInCatalog && (
                          <span className="inline-flex items-center text-sky-700 bg-sky-50 border border-sky-200 px-1 py-0.2 rounded text-[9.5px]" title="Proveedor registrado en el catálogo">
                            <Cloud className="w-2.5 h-2.5 text-sky-600" />
                          </span>
                        )}
                      </h3>
                    </div>
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
                      {expense.submittedByName && (
                        <span className="text-[11px] text-slate-500">
                          Por: <strong className="text-slate-700">{expense.submittedByName}</strong>
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

                {/* Bank details or Pedir datos */}
                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Datos de Cuenta</span>
                    {expense.reimbursable && !expense.bankDetails?.alias && !expense.bankDetails?.cbuCvu && isPending && (
                      <button
                        onClick={() => handleRequestBank(expense)}
                        disabled={sendingEmailId === `${expense.id}-REQUEST_BANK_DETAILS`}
                        className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        <Mail className="w-3 h-3 mr-1 text-amber-700" />
                        {sendingEmailId === `${expense.id}-REQUEST_BANK_DETAILS` ? 'Enviando...' : expense.bankDetailsRequestedAt ? 'Re-pedir Datos' : 'Pedir Datos'}
                      </button>
                    )}
                  </div>
                  <AccountDetailsDisplay expense={expense} />
                </div>

                {/* Bottom Actions Row */}
                <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-100 flex-wrap">
                  <button
                    onClick={() => onViewReceipt(expense)}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 text-xs font-semibold inline-flex items-center gap-1 bg-white cursor-pointer"
                    title="Ver / abrir comprobante"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ver Doc</span>
                  </button>

                  <button
                    onClick={() => onEditExpense(expense)}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 text-xs font-semibold inline-flex items-center gap-1 bg-white"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>

                  {onDeleteExpense && (
                    <button
                      onClick={() => setExpenseToDelete(expense)}
                      className="p-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 bg-white"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Confirmación de Eliminación Individual */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <button
                onClick={() => setExpenseToDelete(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-extrabold text-slate-900">¿Eliminar comprobante?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Esta acción eliminará el registro contable de forma definitiva del sistema.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Proveedor:</span>
                <strong className="text-slate-800 font-semibold">{expenseToDelete.vendor}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Monto:</span>
                <strong className="text-slate-900 font-bold">
                  {formatCurrency(expenseToDelete.amount, expenseToDelete.currency)}
                </strong>
              </div>
              {expenseToDelete.date && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Fecha:</span>
                  <span className="text-slate-700">{formatDate(expenseToDelete.date)}</span>
                </div>
              )}
              {expenseToDelete.project && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Centro de costos:</span>
                  <span className="text-indigo-600 font-medium">{expenseToDelete.project}</span>
                </div>
              )}
              {(expenseToDelete.submittedByName || expenseToDelete.submittedByEmail) && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Solicitante:</span>
                  <span className="text-slate-700">
                    {expenseToDelete.submittedByName || expenseToDelete.submittedByEmail}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setExpenseToDelete(null)}
                className="px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSingleDelete}
                className="px-4.5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
              >
                Eliminar Comprobante
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmación de Eliminación por Lote */}
      {showBatchDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <button
                onClick={() => setShowBatchDeleteModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                ¿Eliminar {selectedIds.length} comprobante(s)?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Se eliminarán de forma permanente todos los comprobantes seleccionados por un monto acumulado de{' '}
                <strong className="text-slate-900 font-bold">{formatCurrency(selectedTotalAmount)}</strong>.
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowBatchDeleteModal(false)}
                className="px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmBatchDelete}
                className="px-4.5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
              >
                Eliminar {selectedIds.length} Registros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmación de Pago / Liquidación por Lote */}
      {showBatchSettleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <button
                onClick={() => setShowBatchSettleModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                ¿Liquidar comprobantes seleccionados?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Se marcarán como <strong>Reintegrados / Liquidados</strong> los comprobantes pendientes seleccionados por un total de{' '}
                <strong className="text-emerald-700 font-bold">
                  {formatCurrency(
                    selectedExpenses
                      .filter((e) => e.reimbursable && e.reimbursementStatus === 'PENDING')
                      .reduce((sum, e) => sum + e.amount, 0)
                  )}
                </strong>.
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowBatchSettleModal(false)}
                className="px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmBatchSettle}
                className="px-4.5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
              >
                Confirmar Liquidación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Aviso de Liquidación por Lote (cuando no hay pendientes) */}
      {batchSettleWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Aviso</h3>
            </div>
            <p className="text-xs text-slate-600">{batchSettleWarning}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setBatchSettleWarning(null)}
                className="px-4 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
