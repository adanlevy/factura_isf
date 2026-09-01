import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Check,
  Trash2,
  Tag,
  Folder,
  Calendar,
  DollarSign,
  FileText,
  User,
  CreditCard,
  Building,
  Shield,
  Clock,
  Sparkles,
  Zap,
  Copy,
  Building2,
  BookmarkCheck,
  Edit2,
  Plus,
} from 'lucide-react';
import { Expense, ReimbursementStatus, PaymentMethod, UserBankDetails, UserProfile, Vendor, ExpensePaymentType, CostCenter } from '../types';
import { getStoredUserBankDetails } from '../utils/auth';
import {
  getSmartSortedCostCenters,
  recordCategoryCostCenterUsage,
} from '../utils/sorting';
import { generateDriveFileName } from '../utils/helpers';
import { notifyBankDetailsChange } from '../utils/googleWorkspace';
import { PaymentTypeSelector } from './PaymentTypeSelector';
import { GoogleDriveLinkButton } from './GoogleDriveIcon';
import { VendorFormModal } from './VendorFormModal';

interface EditExpenseModalProps {
  expense: Expense | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedExpense: Expense) => void;
  onProcessPayment?: (expense: Expense) => void;
  allowStatusChange?: boolean;
  availableProjects: string[];
  availableCategories?: string[];
  currentUser?: UserProfile | null;
  existingExpenses?: Expense[];
  vendors?: Vendor[];
  costCenters?: CostCenter[];
  onAddVendor?: (vendor: Omit<Vendor, 'id' | 'createdAt'>) => void;
  onUpdateVendor?: (vendor: Vendor) => void;
}

export function EditExpenseModal({
  expense,
  isOpen,
  onClose,
  onUpdate,
  onProcessPayment,
  allowStatusChange = false,
  availableProjects,
  currentUser,
  existingExpenses = [],
  vendors = [],
  costCenters = [],
  onAddVendor,
  onUpdateVendor,
}: EditExpenseModalProps) {
  const [formData, setFormData] = useState<Expense | null>(() => {
    if (!expense) return null;
    const determined: ExpensePaymentType = expense.paymentType || (
      expense.reimbursable || expense.paymentMethod === 'Reintegro'
        ? 'REINTEGRO'
        : expense.paymentMethod === 'Pago a Proveedor' || expense.paymentMethod?.toLowerCase().includes('proveedor')
        ? 'PAGO_PROVEEDOR'
        : expense.paymentMethod === 'Tarjeta Débito Galicia' || expense.paymentMethod?.toLowerCase().includes('galicia')
        ? 'TARJETA_DEBITO_GALICIA'
        : 'TARJETA_CORPORATIVA'
    );
    const isPendingType = determined === 'REINTEGRO' || determined === 'PAGO_PROVEEDOR';
    const initialStatus = isPendingType
      ? (expense.reimbursementStatus === 'REIMBURSED' ? 'REIMBURSED' : 'PENDING')
      : 'NOT_APPLICABLE';
    return {
      ...expense,
      paymentType: determined,
      reimbursable: isPendingType,
      reimbursementStatus: initialStatus,
    };
  });
  const [vendorSavedToast, setVendorSavedToast] = useState<string | null>(null);
  const [vendorNotes, setVendorNotes] = useState<string>('');
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [vendorModalInitialData, setVendorModalInitialData] = useState<Vendor | undefined>(undefined);

  const matchedCatalogVendor = useMemo(() => {
    if (!formData?.vendor?.trim()) return null;
    const vName = formData.vendor.trim().toLowerCase();
    const vCuit = (formData.cuit || '').trim();
    return (
      vendors.find((v) => {
        const nameMatch = (v.name || '').trim().toLowerCase() === vName;
        const cuitMatch = Boolean(vCuit && v.cuit && v.cuit.trim() === vCuit);
        return nameMatch || cuitMatch;
      }) || null
    );
  }, [vendors, formData?.vendor, formData?.cuit]);

  const [paymentType, setPaymentType] = useState<ExpensePaymentType>(() => {
    if (expense?.paymentType) return expense.paymentType;
    if (expense?.reimbursable || expense?.paymentMethod === 'Reintegro') return 'REINTEGRO';
    if (expense?.paymentMethod === 'Pago a Proveedor' || expense?.paymentMethod?.toLowerCase().includes('proveedor')) return 'PAGO_PROVEEDOR';
    if (expense?.paymentMethod === 'Tarjeta Débito Galicia' || expense?.paymentMethod?.toLowerCase().includes('galicia')) return 'TARJETA_DEBITO_GALICIA';
    return 'TARJETA_CORPORATIVA';
  });

  const [bankData, setBankData] = useState<UserBankDetails>({
    bankName: '',
    accountType: 'Indefinido',
    cbuCvu: '',
    alias: '',
    cuitCuil: '',
    accountHolder: '',
  });

  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [reanalyzeMessage, setReanalyzeMessage] = useState<string | null>(null);

  const handleReanalyzeWithAi = async () => {
    if (!formData?.receiptImage) {
      alert('Este comprobante no tiene una imagen adjunta para analizar.');
      return;
    }

    setIsReanalyzing(true);
    setReanalyzeMessage(null);

    try {
      let mimeType = 'image/jpeg';
      if (formData.receiptFileName?.endsWith('.png')) mimeType = 'image/png';
      else if (formData.receiptFileName?.endsWith('.pdf')) mimeType = 'application/pdf';

      const response = await fetch('/api/extract-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: formData.receiptImage,
          mimeType,
        }),
      });

      const result = await response.json();
      if (result.success && result.data) {
        const data = result.data;
        const amountNum = typeof data.amount === 'number' ? data.amount : formData.amount;

        setFormData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            vendor: data.vendor || prev.vendor,
            amount: amountNum > 0 ? amountNum : prev.amount,
            currency: data.currency || prev.currency || 'ARS',
            date: data.date || prev.date,
            invoiceNumber: data.invoiceNumber || prev.invoiceNumber,
            cuit: data.cuit || prev.cuit,
            paymentMethod: data.paymentMethod || prev.paymentMethod,
            aiConfidenceSummary: data.confidenceSummary || 'Comprobante reanalizado con IA.',
          };
        });
        setReanalyzeMessage(`✅ Datos actualizados por IA: ${data.vendor || ''} ($${amountNum})`);
      } else {
        setReanalyzeMessage('⚠️ La IA no detectó nuevos campos.');
      }
    } catch (err) {
      console.error('Error reanalyzing with AI:', err);
      setReanalyzeMessage('❌ Error al reanalizar con IA.');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const prevExpenseIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (expense) {
      if (prevExpenseIdRef.current === expense.id) {
        // Same expense is already open, do not overwrite user's edits
        return;
      }
      prevExpenseIdRef.current = expense.id;

      const determined: ExpensePaymentType = expense.paymentType || (
        expense.reimbursable || expense.paymentMethod === 'Reintegro'
          ? 'REINTEGRO'
          : expense.paymentMethod === 'Pago a Proveedor' || expense.paymentMethod?.toLowerCase().includes('proveedor')
          ? 'PAGO_PROVEEDOR'
          : expense.paymentMethod === 'Tarjeta Débito Galicia' || expense.paymentMethod?.toLowerCase().includes('galicia')
          ? 'TARJETA_DEBITO_GALICIA'
          : 'TARJETA_CORPORATIVA'
      );
      setPaymentType(determined);

      const isPendingType = determined === 'REINTEGRO' || determined === 'PAGO_PROVEEDOR';
      const initialReimbursementStatus = isPendingType
        ? (expense.reimbursementStatus === 'REIMBURSED' ? 'REIMBURSED' : 'PENDING')
        : 'NOT_APPLICABLE';

      setFormData({
        ...expense,
        paymentType: determined,
        reimbursable: isPendingType,
        reimbursementStatus: initialReimbursementStatus,
      });

      const matchedVendor = vendors.find(
        (v) =>
          (v.name || '').trim().toLowerCase() === (expense.vendor || '').trim().toLowerCase() ||
          (expense.cuit && v.cuit && v.cuit === expense.cuit)
      );
      setVendorNotes(matchedVendor?.notes || '');

      if (expense.bankDetails && (expense.bankDetails.cbuCvu || expense.bankDetails.alias || expense.bankDetails.bankName || expense.bankDetails.accountHolder)) {
        setBankData(expense.bankDetails);
      } else {
        setBankData({
          bankName: '',
          accountType: 'Indefinido',
          cbuCvu: '',
          alias: '',
          cuitCuil: '',
          accountHolder: '',
        });
      }
    } else {
      prevExpenseIdRef.current = null;
      setFormData(null);
      setVendorNotes('');
    }
  }, [expense?.id]);

  // Unique, alphabetically sorted vendor list strictly derived from vendors catalog
  const sortedUniqueVendors = useMemo(() => {
    const map = new Map<string, Vendor>();
    vendors.forEach((v) => {
      const key = (v.name || '').trim().toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, v);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
    );
  }, [vendors]);

  const handlePaymentTypeChange = (type: ExpensePaymentType) => {
    setPaymentType(type);
    if (type === 'REINTEGRO') {
      setFormData((prev) =>
        prev
          ? {
              ...prev,
              paymentType: 'REINTEGRO',
              reimbursable: true,
              reimbursementStatus: prev.reimbursementStatus === 'REIMBURSED' ? 'REIMBURSED' : 'PENDING',
              paymentMethod: 'Reintegro',
            }
          : prev
      );
    } else if (type === 'PAGO_PROVEEDOR') {
      setFormData((prev) =>
        prev
          ? {
              ...prev,
              paymentType: 'PAGO_PROVEEDOR',
              reimbursable: true,
              reimbursementStatus: prev.reimbursementStatus === 'REIMBURSED' ? 'REIMBURSED' : 'PENDING',
              paymentMethod: 'Pago a Proveedor',
            }
          : prev
      );
    } else if (type === 'TARJETA_CORPORATIVA') {
      setFormData((prev) =>
        prev
          ? {
              ...prev,
              paymentType: 'TARJETA_CORPORATIVA',
              reimbursable: false,
              reimbursementStatus: 'NOT_APPLICABLE',
              paymentMethod: 'Tarjeta Corporativa',
            }
          : prev
      );
    } else if (type === 'TARJETA_DEBITO_GALICIA') {
      setFormData((prev) =>
        prev
          ? {
              ...prev,
              paymentType: 'TARJETA_DEBITO_GALICIA',
              reimbursable: false,
              reimbursementStatus: 'NOT_APPLICABLE',
              paymentMethod: 'Tarjeta Débito Galicia',
            }
          : prev
      );
    }
  };

  const handleReimbursementStatusChange = (newStatus: ReimbursementStatus) => {
    if (!formData) return;

    if (newStatus === 'REIMBURSED') {
      const isPendingType = paymentType === 'REINTEGRO' || paymentType === 'PAGO_PROVEEDOR';
      const hasBank = Boolean(
        isPendingType &&
        (bankData.cbuCvu?.trim() || bankData.alias?.trim() || bankData.bankName?.trim() || bankData.accountHolder?.trim() || bankData.cuitCuil?.trim())
      );

      const updatedExpense: Expense = {
        ...formData,
        amount: Number(formData.amount),
        project: (formData.project || '').trim(),
        paymentType: paymentType,
        reimbursable: isPendingType,
        reimbursementStatus: 'REIMBURSED',
        paymentMethod:
          paymentType === 'REINTEGRO'
            ? 'Reintegro'
            : paymentType === 'PAGO_PROVEEDOR'
            ? 'Pago a Proveedor'
            : paymentType === 'TARJETA_CORPORATIVA'
            ? 'Tarjeta Corporativa'
            : 'Tarjeta Débito Galicia',
        bankDetails: hasBank ? bankData : undefined,
        reimbursedAt: formData.reimbursedAt || new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString(),
      };

      onUpdate(updatedExpense);
      onClose();

      if (onProcessPayment) {
        onProcessPayment(updatedExpense);
      }
    } else {
      setFormData((prev) => (prev ? { ...prev, reimbursementStatus: newStatus } : prev));
    }
  };

  if (!isOpen || !formData) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || formData.amount <= 0) {
      alert('El Monto Total es obligatorio y debe ser mayor a 0.');
      return;
    }
    if (!formData.project?.trim()) {
      alert('El Centro de Costos es obligatorio.');
      return;
    }
    if (!formData.vendor?.trim()) {
      alert('Ingresa el nombre del proveedor.');
      return;
    }

    const hasBank = Boolean(
      (paymentType === 'REINTEGRO' || paymentType === 'PAGO_PROVEEDOR') &&
      (bankData.cbuCvu?.trim() || bankData.alias?.trim() || bankData.bankName?.trim() || bankData.accountHolder?.trim() || bankData.cuitCuil?.trim())
    );

    if (hasBank && (bankData.cbuCvu || bankData.alias || bankData.bankName)) {
      notifyBankDetailsChange({
        updatedBy: { email: currentUser?.email || 'admin@isf-argentina.org', name: currentUser?.name || 'Administrador' },
        targetType: paymentType === 'PAGO_PROVEEDOR' ? 'vendor' : 'user',
        targetName: paymentType === 'PAGO_PROVEEDOR' ? `Proveedor: ${formData.vendor}` : `Colaborador: ${formData.submittedByName || currentUser?.name || 'Usuario'}`,
        bankDetails: bankData,
      }).catch((err) => console.warn('Bank details notification error:', err));
    }

    const existingVendor = vendors.find(
      (v) =>
        (v.name || '').trim().toLowerCase() === (formData.vendor || '').trim().toLowerCase() ||
        (formData.cuit && v.cuit && v.cuit === formData.cuit)
    );

    if (hasBank && existingVendor && onUpdateVendor) {
      const nameDiff = existingVendor.name.trim() !== (formData.vendor || '').trim();
      const cuitDiff = (existingVendor.cuit || '').trim() !== (formData.cuit || '').trim();
      const notesDiff = (existingVendor.notes || '').trim() !== vendorNotes.trim();

      const curBank = bankData || { bankName: '', accountType: 'Indefinido', cbuCvu: '', alias: '', accountHolder: '' };
      const prevBank = existingVendor.bankDetails || { bankName: '', accountType: 'Indefinido', cbuCvu: '', alias: '', accountHolder: '' };

      const bankDiff =
        (curBank.bankName || '').trim() !== (prevBank.bankName || '').trim() ||
        (curBank.accountType || '') !== (prevBank.accountType || '') ||
        (curBank.cbuCvu || '').trim() !== (prevBank.cbuCvu || '').trim() ||
        (curBank.alias || '').trim() !== (prevBank.alias || '').trim() ||
        (curBank.accountHolder || '').trim() !== (prevBank.accountHolder || '').trim();

      if (nameDiff || cuitDiff || notesDiff || bankDiff) {
        onUpdateVendor({
          ...existingVendor,
          name: (formData.vendor || '').trim(),
          cuit: (formData.cuit || '').trim() || existingVendor.cuit,
          notes: vendorNotes.trim(),
          bankDetails: {
            ...existingVendor.bankDetails,
            ...bankData,
            accountHolder: bankData.accountHolder || (formData.vendor || '').trim(),
          },
        });
      }
    }

    const isPendingType = paymentType === 'REINTEGRO' || paymentType === 'PAGO_PROVEEDOR';
    const computedStatus: ReimbursementStatus = allowStatusChange
      ? (isPendingType
          ? (formData.reimbursementStatus === 'NOT_APPLICABLE' ? 'PENDING' : (formData.reimbursementStatus || 'PENDING'))
          : 'NOT_APPLICABLE')
      : (isPendingType
          ? (expense?.reimbursementStatus === 'REIMBURSED' ? 'REIMBURSED' : 'PENDING')
          : 'NOT_APPLICABLE');

    onUpdate({
      ...formData,
      amount: Number(formData.amount),
      project: formData.project.trim(),
      paymentType: paymentType,
      reimbursable: isPendingType,
      reimbursementStatus: computedStatus,
      paymentMethod:
        paymentType === 'REINTEGRO'
          ? 'Reintegro'
          : paymentType === 'PAGO_PROVEEDOR'
          ? 'Pago a Proveedor'
          : paymentType === 'TARJETA_CORPORATIVA'
          ? 'Tarjeta Corporativa'
          : 'Tarjeta Débito Galicia',
      bankDetails: hasBank ? bankData : undefined,
      accountingNotes: formData.accountingNotes || formData.notes || '',
      reimbursedAt:
        computedStatus === 'REIMBURSED'
          ? (formData.reimbursedAt || expense?.reimbursedAt || new Date().toISOString().slice(0, 10))
          : undefined,
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  const modalContent = (
    <div
      id="edit-expense-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="edit-expense-container"
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Edición Administrativa de Comprobante</h3>
              <p className="text-xs text-indigo-300">Permiso total para modificar cualquier dato del comprobante</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* AI Re-analyze banner if image exists */}
          {formData.receiptImage && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-indigo-900 font-medium truncate">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="truncate">
                  {reanalyzeMessage || '¿Deseas volver a extraer los datos de la factura con la IA?'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleReanalyzeWithAi}
                disabled={isReanalyzing}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer shrink-0 flex items-center gap-1.5 disabled:opacity-50"
              >
                {isReanalyzing ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>Analizando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Reanalizar con IA</span>
                  </>
                )}
              </button>
            </div>
          )}
          {/* Submitter info */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-indigo-900 mb-1 flex items-center">
                <User className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                Cargó Comprobante (Nombre Colaborador)
              </label>
              <input
                type="text"
                value={formData.submittedByName || ''}
                onChange={(e) => setFormData({ ...formData, submittedByName: e.target.value })}
                placeholder="Ej: Adán Levy"
                className="w-full px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-hidden bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                Email del Colaborador (para notificaciones)
              </label>
              <input
                type="email"
                value={formData.submittedByEmail || ''}
                onChange={(e) => setFormData({ ...formData, submittedByEmail: e.target.value })}
                placeholder="colaborador@isf-argentina.org"
                className="w-full px-3 py-1.5 rounded-xl border border-indigo-200 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden bg-white"
              />
            </div>
          </div>

          {/* Invoice Number, Vendor, Amount, Currency & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nombre / Factura <span className="text-rose-500 font-bold">*</span>
              </label>
              <input
                type="text"
                value={formData.vendor || ''}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                placeholder="Ej: Coto, Fibertel, Juan Pérez..."
                className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                N° Comprobante / Factura
              </label>
              <input
                type="text"
                value={formData.invoiceNumber || ''}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                placeholder="A-0001-00012345"
                className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Monto Total *</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 font-bold text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white transition"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Moneda</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-3 py-2 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white cursor-pointer"
              >
                <option value="ARS">ARS ($)</option>
                <option value="USD">USD (US$)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Fecha Comprobante</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white"
              />
            </div>
          </div>

          {/* Centro de Costos */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Centro de Costos <span className="text-rose-500 font-bold">*</span>
            </label>
            <select
              value={formData.project}
              onChange={(e) => {
                setFormData({ ...formData, project: e.target.value });
              }}
              className="w-full px-3 py-2 rounded-2xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white cursor-pointer"
            >
              {(() => {
                const ranking = getSmartSortedCostCenters(
                  availableProjects,
                  existingExpenses,
                  currentUser?.email
                );
                return (
                  <>
                    {ranking.frequent.length > 0 && (
                      <optgroup label="⭐ Frecuentes">
                        {ranking.frequent.map((p) => (
                          <option key={`edit-freq-proj-${p}`} value={p} className="font-normal text-xs">
                            {p}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="📁 Otros A-Z">
                      {ranking.remaining.map((p) => (
                        <option key={`edit-az-proj-${p}`} value={p} className="font-normal text-xs">
                          {p}
                        </option>
                      ))}
                    </optgroup>
                  </>
                );
              })()}
            </select>

            {/* Destination Google Drive Folder Card */}
            {(() => {
              const matchedCc = costCenters.find(
                (c) => (c.name || '').toLowerCase() === (formData.project || '').toLowerCase()
              );
              const code = matchedCc?.code || formData.project?.slice(0, 4).toUpperCase() || 'ISF';
              const folderName = matchedCc?.driveFolder || `${formData.project || 'General'} 2026`;
              const ext = (formData.receiptUrl || '').split('.').pop()?.split('?')[0] || 'pdf';
              const standardFileName = generateDriveFileName(
                {
                  ...formData,
                  submittedByName: currentUser?.name || formData.submittedByName,
                  submittedByEmail: currentUser?.email || formData.submittedByEmail,
                },
                costCenters,
                ext
              );

              return (
                <div className="mt-2 p-2.5 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-1.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <span className="text-[9px] font-extrabold px-1 py-0.5 rounded bg-indigo-600 text-white shrink-0">
                        {code}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-800 truncate" title={folderName}>
                        {folderName}
                      </span>
                    </div>
                    <GoogleDriveLinkButton
                      driveUrl={matchedCc?.driveUrl}
                      driveFolder={folderName}
                      size="sm"
                      title="Abrir carpeta en Google Drive"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[10px] pt-1 border-t border-indigo-100/70">
                    <code className="font-mono text-indigo-900 truncate bg-white px-1 py-0.5 rounded border border-indigo-200/50">
                      {standardFileName}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(standardFileName);
                        alert(`Copiado al portapapeles: ${standardFileName}`);
                      }}
                      className="text-indigo-700 hover:text-indigo-900 bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-[10px] font-semibold shrink-0 cursor-pointer"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Mutually Exclusive Payment Definition (Reintegro / Pago Proveedor / Tarjeta Corp / Tarjeta Galicia) */}
          <PaymentTypeSelector
            paymentType={paymentType}
            onChangePaymentType={handlePaymentTypeChange}
            bankDetails={bankData}
            onChangeBankDetails={setBankData}
            currentUser={currentUser as any}
            vendors={vendors}
            onAddVendor={onAddVendor}
            onUpdateVendor={onUpdateVendor}
            vendorName={formData.vendor}
            cuit={formData.cuit}
            existingExpenses={existingExpenses}
            reimbursementStatus={formData.reimbursementStatus}
            onChangeReimbursementStatus={allowStatusChange ? handleReimbursementStatusChange : undefined}
            isVendorLocked={Boolean(matchedCatalogVendor)}
            onOpenVendorEditModal={() => {
              setVendorModalInitialData(matchedCatalogVendor || undefined);
              setIsVendorModalOpen(true);
            }}
            vendorNotes={vendorNotes}
            onChangeVendorNotes={setVendorNotes}
          />

          {/* Accounting Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Motivo / Notas Contables
            </label>
            <textarea
              rows={2}
              value={formData.accountingNotes ?? formData.notes ?? ''}
              onChange={(e) => setFormData({ ...formData, accountingNotes: e.target.value, notes: e.target.value })}
              className="w-full px-4 py-2 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white transition"
              placeholder="Detalle contable o justificación de gasto..."
            />
          </div>

          {/* Withholding Tax Settings */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <label className="flex items-center space-x-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={Boolean(formData.appliesWithholdings)}
                onChange={(e) => setFormData({ ...formData, appliesWithholdings: e.target.checked })}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer accent-amber-600"
              />
              <span className="text-xs font-bold text-slate-800">
                Aplica Retenciones Impositivas (AFIP / ARCA)
              </span>
            </label>
            {formData.appliesWithholdings && (
              <div className="pl-6 text-[11px] text-slate-500 space-y-1">
                <p>
                  Estado actual del certificado:{' '}
                  {formData.withholdingCertificateImage || formData.withholdingCertificateFileName ? (
                    <strong className="text-emerald-700 font-bold">
                      ✓ Certificado cargado ({formData.withholdingCertificateFileName || 'Archivo'})
                    </strong>
                  ) : (
                    <strong className="text-amber-700 font-bold">
                      ⏳ Pendiente de subir certificado
                    </strong>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4.5 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-md cursor-pointer transition active:scale-95"
            >
              Guardar Todos los Cambios
            </button>
          </div>
        </form>
      </div>

      {/* Unified Vendor Modal for Creating/Editing Vendors from the Expense Form */}
      <VendorFormModal
        isOpen={isVendorModalOpen}
        initialData={vendorModalInitialData}
        suggestedName={!vendorModalInitialData?.id ? formData.vendor : undefined}
        suggestedCuit={!vendorModalInitialData?.id ? formData.cuit : undefined}
        existingVendors={vendors}
        onClose={() => {
          setIsVendorModalOpen(false);
          setVendorModalInitialData(undefined);
        }}
        onSave={(savedData) => {
          if (vendorModalInitialData && vendorModalInitialData.id) {
            const updatedVendor: Vendor = {
              ...vendorModalInitialData,
              ...savedData,
              id: vendorModalInitialData.id,
            };
            onUpdateVendor?.(updatedVendor);
            setFormData((prev) => (prev ? { ...prev, vendor: updatedVendor.name, cuit: updatedVendor.cuit || prev.cuit } : prev));
            if (updatedVendor.bankDetails) {
              setBankData(updatedVendor.bankDetails);
            }
            if (updatedVendor.notes !== undefined) {
              setVendorNotes(updatedVendor.notes);
            }
            setVendorSavedToast(`Proveedor "${updatedVendor.name}" actualizado.`);
          } else {
            onAddVendor?.(savedData);
            setFormData((prev) => (prev ? { ...prev, vendor: savedData.name, cuit: savedData.cuit || prev.cuit } : prev));
            if (savedData.bankDetails) {
              setBankData(savedData.bankDetails);
            }
            if (savedData.notes !== undefined) {
              setVendorNotes(savedData.notes);
            }
            setVendorSavedToast(`Proveedor "${savedData.name}" guardado en el catálogo.`);
          }
          setTimeout(() => setVendorSavedToast(null), 3500);
          setIsVendorModalOpen(false);
          setVendorModalInitialData(undefined);
        }}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
