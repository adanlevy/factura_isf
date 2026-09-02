import React, { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  CreditCard,
  FileSpreadsheet,
  Edit2,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  ArrowUpDown,
  Clock,
  Receipt,
  Loader2,
} from 'lucide-react';
import { Vendor, Expense } from '../types';
import { formatCurrency, formatDate, formatTransferDetails, matchesSearch, cleanCuit } from '../utils/helpers';
import { normalizeVendorBankDetails } from '../utils/cloudSync';
import { VendorFormModal } from './VendorFormModal';

export type VendorSortOption =
  | 'name-asc'
  | 'name-desc'
  | 'createdAt-desc'
  | 'createdAt-asc'
  | 'totalAmount-desc'
  | 'count-desc';

interface VendorsViewProps {
  vendors: Vendor[];
  expenses: Expense[];
  availableCategories?: string[];
  onAddVendor: (vendor: Omit<Vendor, 'id' | 'createdAt'>) => Promise<void> | void;
  onBatchAddVendors?: (vendors: Omit<Vendor, 'id' | 'createdAt'>[]) => Promise<void> | void;
  onUpdateVendor: (vendor: Vendor) => Promise<void> | void;
  onDeleteVendor: (id: string) => Promise<void> | void;
  onViewVendorExpenses: (vendorName: string) => void;
}

export function VendorsView({
  vendors,
  expenses,
  onAddVendor,
  onBatchAddVendors,
  onUpdateVendor,
  onDeleteVendor,
  onViewVendorExpenses,
}: VendorsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<VendorSortOption>('createdAt-desc');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Stats calculation per vendor
  const vendorStats = useMemo(() => {
    const map = new Map<string, { count: number; totalAmount: number }>();
    expenses.forEach((e) => {
      const vName = e.vendor?.trim().toLowerCase();
      if (vName) {
        const current = map.get(vName) || { count: 0, totalAmount: 0 };
        map.set(vName, {
          count: current.count + 1,
          totalAmount: current.totalAmount + (e.amount || 0),
        });
      }
    });
    return map;
  }, [expenses]);

  // Filtered vendors
  const filteredVendors = useMemo(() => {
    if (!searchTerm.trim()) return vendors;
    return vendors.filter((v) =>
      matchesSearch(
        [
          v.name,
          v.cuit,
          v.contactEmail,
          v.notes,
          v.bankDetails?.alias,
          v.bankDetails?.cbuCvu,
          v.bankDetails?.cuitCuil,
          v.bankDetails?.bankName,
          v.bankDetails?.accountHolder,
        ],
        searchTerm
      )
    );
  }, [vendors, searchTerm]);

  // Sorted vendors
  const sortedVendors = useMemo(() => {
    const list = [...filteredVendors];
    return list.sort((a, b) => {
      if (sortOption === 'name-asc') {
        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      }
      if (sortOption === 'name-desc') {
        return b.name.localeCompare(a.name, 'es', { sensitivity: 'base' });
      }
      if (sortOption === 'createdAt-desc') {
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      }
      if (sortOption === 'createdAt-asc') {
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      }
      if (sortOption === 'totalAmount-desc') {
        const amountA = vendorStats.get(a.name.trim().toLowerCase())?.totalAmount || 0;
        const amountB = vendorStats.get(b.name.trim().toLowerCase())?.totalAmount || 0;
        return amountB - amountA;
      }
      if (sortOption === 'count-desc') {
        const countA = vendorStats.get(a.name.trim().toLowerCase())?.count || 0;
        const countB = vendorStats.get(b.name.trim().toLowerCase())?.count || 0;
        return countB - countA;
      }
      return 0;
    });
  }, [filteredVendors, sortOption, vendorStats]);

  // Total summary calculation
  const totalBilled = useMemo(() => {
    return expenses.reduce((acc, exp) => acc + (exp.amount || 0), 0);
  }, [expenses]);

  // Check matching expenses whose bank details are linked to the vendor to delete
  const matchingExpensesForDelete = useMemo(() => {
    if (!vendorToDelete) return [];
    const vName = (vendorToDelete.name || '').trim().toLowerCase();
    const vCuitDigits = cleanCuit(vendorToDelete.cuit || vendorToDelete.bankDetails?.cuitCuil);
    const vCbu = (vendorToDelete.bankDetails?.cbuCvu || '').trim();
    const vAlias = (vendorToDelete.bankDetails?.alias || '').trim().toLowerCase();
    const vHolder = (vendorToDelete.bankDetails?.accountHolder || '').trim().toLowerCase();

    const otherVendorsWithSameCuit = vendors.filter(
      (v) => v.id !== vendorToDelete.id && cleanCuit(v.cuit || v.bankDetails?.cuitCuil) === vCuitDigits
    );
    const otherVendorNames = new Set(
      otherVendorsWithSameCuit.map((v) => (v.name || '').trim().toLowerCase()).filter(Boolean)
    );

    return expenses.filter((e) => {
      if (!e.bankDetails) return false;
      const expVendor = (e.vendor || '').trim().toLowerCase();
      if (otherVendorNames.has(expVendor)) return false;

      const expCuitDigits = cleanCuit(e.cuit || e.bankDetails?.cuitCuil);
      const expCbu = (e.bankDetails?.cbuCvu || '').trim();
      const expAlias = (e.bankDetails?.alias || '').trim().toLowerCase();
      const expHolder = (e.bankDetails?.accountHolder || '').trim().toLowerCase();

      return Boolean(
        (vName && expVendor === vName) ||
        (vName && expHolder && expHolder === vName) ||
        (vCbu && expCbu && vCbu === expCbu) ||
        (vAlias && expAlias && vAlias === expAlias) ||
        (vHolder && expHolder && vHolder === expHolder) ||
        (otherVendorNames.size === 0 && vCuitDigits && expCuitDigits && vCuitDigits === expCuitDigits)
      );
    });
  }, [vendorToDelete, expenses, vendors]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold backdrop-blur-md border border-indigo-400/20">
            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Catálogo Oficial de Proveedores</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Proveedores y Cuentas Bancarias
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Administra los datos fiscales, CUIT, CBU y Alias bancarios para liquidaciones directas y rendición de comprobantes.
          </p>
        </div>

        {/* Global Stats */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 shrink-0">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-white/10 text-left">
            <span className="text-[11px] font-semibold text-slate-300 block mb-1">Proveedores en Catálogo</span>
            <div className="text-xl sm:text-2xl font-black text-white">{vendors.length}</div>
            <p className="text-xs text-slate-300">{filteredVendors.length} visibles</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-white/10 text-left">
            <span className="text-[11px] font-semibold text-slate-300 block mb-1">Facturación Total Registrada</span>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
              {formatCurrency(totalBilled)}
            </div>
            <p className="text-xs text-slate-300">Total en comprobantes</p>
          </div>
        </div>
      </div>

      {/* Control Bar: Search, Sorting and Actions */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-xs">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              id="vendor-search-input"
              type="text"
              placeholder="Buscar proveedor por nombre, CUIT, email, alias bancario o CBU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-2xl border border-slate-200 bg-slate-50/70 text-xs sm:text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sort Selector Dropdown */}
            <div className="relative flex items-center">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700">
                <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="text-slate-500 hidden sm:inline">Ordenar:</span>
                <select
                  id="vendor-sort-select"
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as VendorSortOption)}
                  aria-label="Ordenar proveedores por fecha de carga o alfabéticamente"
                  className="bg-transparent font-bold text-slate-900 focus:outline-hidden cursor-pointer text-xs"
                >
                  <option value="name-asc">Alfabético: A → Z</option>
                  <option value="name-desc">Alfabético: Z → A</option>
                  <option value="createdAt-desc">Fecha de Carga: Más recientes</option>
                  <option value="createdAt-asc">Fecha de Carga: Más antiguos</option>
                  <option value="totalAmount-desc">Mayor Facturación</option>
                  <option value="count-desc">Más Comprobantes</option>
                </select>
              </div>
            </div>

            <button
              id="vendor-import-btn"
              onClick={() => setIsImportModalOpen(true)}
              className="px-3.5 py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs flex items-center space-x-1.5 cursor-pointer transition active:scale-95 whitespace-nowrap"
              title="Importar proveedores masivamente desde Google Sheets, Excel o CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Importar CSV</span>
            </button>

            <button
              id="vendor-new-btn"
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm flex items-center space-x-1.5 cursor-pointer transition active:scale-95 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Proveedor</span>
            </button>
          </div>
        </div>
      </div>

      {/* Vendors Grid */}
      {sortedVendors.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center text-slate-500 space-y-2">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold">No se encontraron proveedores con los filtros actuales.</p>
          <button
            onClick={() => {
              setSearchTerm('');
            }}
            className="text-xs text-indigo-600 hover:underline font-medium cursor-pointer"
          >
            Restablecer búsqueda
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sortedVendors.map((vendor) => {
            const stats = vendorStats.get(vendor.name.trim().toLowerCase()) || { count: 0, totalAmount: 0 };
            const bank = vendor.bankDetails;

            return (
              <div
                key={vendor.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md transition p-3.5 flex flex-col justify-between space-y-2.5"
              >
                {/* Top: Name, CUIT, CreatedAt */}
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm leading-snug truncate" title={vendor.name}>
                      {vendor.name}
                    </h3>
                    {vendor.createdAt && (
                      <span
                        className="text-[10px] font-medium text-slate-400 shrink-0 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-md flex items-center gap-0.5"
                        title={`Cargado el ${vendor.createdAt}`}
                      >
                        <Clock className="w-2.5 h-2.5 text-slate-400" />
                        <span>{formatDate(vendor.createdAt.split('T')[0])}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                    <span className="text-slate-400 font-semibold font-sans text-[10px] uppercase tracking-wider">CUIT:</span>
                    <span className="font-bold text-slate-800 bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/60">
                      {vendor.cuit || bank?.cuitCuil || '-'}
                    </span>
                  </div>
                </div>

                {/* Main Details Box (Banco, Tipo Cta, Alias, CBU, Notas) */}
                <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-200/70 text-[11px] space-y-1.5">
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <div className="truncate">
                      <span className="text-slate-400 font-medium">Banco:</span>{' '}
                      <span className="font-bold text-slate-800">{bank?.bankName || '-'}</span>
                    </div>
                    <div className="truncate">
                      <span className="text-slate-400 font-medium">Tipo:</span>{' '}
                      <span className="font-bold text-slate-800">
                        {bank?.accountType || 'Indefinido'}
                        {bank?.currency ? (
                          <span className={`ml-1 px-1 py-0.2 rounded text-[10px] font-bold ${
                            bank.currency === 'u$' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {bank.currency}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="col-span-2 truncate">
                      <span className="text-slate-400 font-medium">Alias:</span>{' '}
                      <span className="font-mono font-bold text-indigo-950 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                        {bank?.alias || '-'}
                      </span>
                    </div>
                    <div className="col-span-2 truncate">
                      <span className="text-slate-400 font-medium">CBU:</span>{' '}
                      <span className="font-mono text-slate-700">{bank?.cbuCvu || '-'}</span>
                    </div>
                    <div className="col-span-2 pt-1 border-t border-slate-200/60">
                      <span className="text-slate-400 font-medium">Notas:</span>{' '}
                      <span className="text-slate-700 line-clamp-2 leading-relaxed" title={vendor.notes || '-'}>
                        {vendor.notes || '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Stats & Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                  <span className="text-slate-500 font-medium">
                    {stats.count} comp. ({formatCurrency(stats.totalAmount)})
                  </span>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => onViewVendorExpenses(vendor.name)}
                      className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 hover:text-indigo-700 text-[11px] font-semibold text-slate-700 transition cursor-pointer flex items-center space-x-1"
                      title="Ver todos los comprobantes de este proveedor"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Gastos</span>
                    </button>

                    <button
                      onClick={() => setEditingVendor(vendor)}
                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                      title="Editar proveedor"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setVendorToDelete(vendor)}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                      title="Eliminar proveedor"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Import Vendors */}
      {isImportModalOpen && (
        <VendorImportModal
          isOpen={isImportModalOpen}
          existingVendors={vendors}
          onClose={() => setIsImportModalOpen(false)}
          onImport={(importedVendors) => {
            if (onBatchAddVendors) {
              onBatchAddVendors(importedVendors);
            } else {
              importedVendors.forEach((v) => onAddVendor(v));
            }
            setIsImportModalOpen(false);
          }}
        />
      )}

      {/* Modal: Create Vendor (Unified VendorFormModal) */}
      {isCreateModalOpen && (
        <VendorFormModal
          isOpen={isCreateModalOpen}
          title="Registrar Nuevo Proveedor"
          subtitle="Carga los datos del proveedor y datos de transferencia bancaria"
          existingVendors={vendors}
          onClose={() => setIsCreateModalOpen(false)}
          onSave={async (data) => {
            await onAddVendor(data);
            setIsCreateModalOpen(false);
          }}
        />
      )}

      {/* Modal: Edit Vendor (Unified VendorFormModal) */}
      {editingVendor && (
        <VendorFormModal
          isOpen={Boolean(editingVendor)}
          initialData={editingVendor}
          existingVendors={vendors}
          title="Editar Datos de Proveedor"
          subtitle="Modifica datos contables o cuentas bancarias del proveedor"
          onClose={() => setEditingVendor(null)}
          onSave={async (data) => {
            await onUpdateVendor({ ...editingVendor, ...data });
            setEditingVendor(null);
          }}
        />
      )}

      {/* Enhanced Delete Vendor Confirmation Modal */}
      {vendorToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${
              matchingExpensesForDelete.length > 0 ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
            }`}>
              {matchingExpensesForDelete.length > 0 ? (
                <AlertTriangle className="w-6 h-6" />
              ) : (
                <Trash2 className="w-6 h-6" />
              )}
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                {matchingExpensesForDelete.length > 0
                  ? '¿Eliminar proveedor vinculado a pagos?'
                  : '¿Eliminar proveedor del catálogo?'}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Estás por eliminar a <strong className="text-slate-900 font-bold">&quot;{vendorToDelete.name}&quot;</strong> del catálogo oficial de proveedores.
              </p>
            </div>

            {/* Warning if vendor is used in payments */}
            {matchingExpensesForDelete.length > 0 && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-2">
                <div className="flex items-start space-x-2 text-amber-900 font-semibold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Este proveedor está asociado a <strong>{matchingExpensesForDelete.length} pago(s) / comprobante(s)</strong> registrados:
                  </span>
                </div>

                {/* List of affected expenses */}
                <div className="max-h-36 overflow-y-auto border border-amber-200/80 rounded-xl bg-white p-2 divide-y divide-slate-100 text-[11px]">
                  {matchingExpensesForDelete.slice(0, 10).map((exp) => (
                    <div key={exp.id} className="py-1.5 flex items-center justify-between gap-2">
                      <div className="truncate min-w-0">
                        <span className="font-bold text-slate-800">{exp.invoiceNumber || 'Sin N°'}</span>
                        <span className="text-slate-400 mx-1.5">•</span>
                        <span className="text-slate-600">{exp.project || 'General'}</span>
                        <span className="text-slate-400 mx-1.5">•</span>
                        <span className="text-slate-500">{formatDate(exp.date)}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-900 shrink-0">
                        {formatCurrency(exp.amount, exp.currency)}
                      </span>
                    </div>
                  ))}
                  {matchingExpensesForDelete.length > 10 && (
                    <p className="text-[10px] text-slate-400 pt-1 text-center italic">
                      + {matchingExpensesForDelete.length - 10} comprobantes más
                    </p>
                  )}
                </div>

                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Si continúas, <strong>los datos de cuenta bancaria del proveedor se desvincularán de estos {matchingExpensesForDelete.length} comprobantes</strong>, conservando intacto el <em>Nombre / Factura</em> original del comprobante.
                </p>
              </div>
            )}

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setVendorToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  if (vendorToDelete) {
                    setIsDeleting(true);
                    try {
                      await onDeleteVendor(vendorToDelete.id);
                      setVendorToDelete(null);
                    } catch (err: any) {
                      alert('Error al eliminar proveedor: ' + (err.message || err));
                    } finally {
                      setIsDeleting(false);
                    }
                  }
                }}
                className={`flex-1 py-2.5 text-white text-xs font-bold rounded-2xl transition cursor-pointer shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-1.5 ${
                  matchingExpensesForDelete.length > 0
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Eliminando de Firestore...</span>
                  </>
                ) : (
                  <span>
                    {matchingExpensesForDelete.length > 0
                      ? `Sí, Eliminar y Desvincular Cuentas (${matchingExpensesForDelete.length})`
                      : 'Sí, Eliminar Proveedor'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface VendorImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingVendors: Vendor[];
  onImport: (vendors: Omit<Vendor, 'id' | 'createdAt'>[]) => Promise<void> | void;
}

function VendorImportModal({
  isOpen,
  onClose,
  existingVendors,
  onImport,
}: VendorImportModalProps) {
  const [rawText, setRawText] = useState('');
  const [parsedItems, setParsedItems] = useState<Omit<Vendor, 'id' | 'createdAt'>[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const handleTextChange = (text: string) => {
    setRawText(text);
    if (!text.trim()) {
      setParsedItems([]);
      return;
    }

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      setParsedItems([]);
      return;
    }

    const firstLine = lines[0];
    let delimiter = '\t';
    if (firstLine.includes('\t')) {
      delimiter = '\t';
    } else if (firstLine.includes(';')) {
      delimiter = ';';
    } else if (firstLine.includes(',')) {
      delimiter = ',';
    }

    const rows = lines.map((line) =>
      line.split(delimiter).map((cell) => cell.trim().replace(/^["']|["']$/g, ''))
    );

    const header = rows[0].map((h) => h.toLowerCase());
    const hasHeader = header.some((h) =>
      ['nombre', 'razon', 'razón', 'proveedor', 'empresa', 'cuit', 'cuil', 'cbu', 'alias', 'email'].some(
        (k) => h.includes(k)
      )
    );

    const colMap = {
      name: -1,
      cuit: -1,
      contactEmail: -1,
      phone: -1,
      address: -1,
      bankName: -1,
      cbuCvu: -1,
      alias: -1,
      accountHolder: -1,
      notes: -1,
    };

    if (hasHeader) {
      header.forEach((h, idx) => {
        if (
          (h.includes('nombre') || h.includes('razon') || h.includes('razón') || h.includes('proveedor') || h.includes('empresa')) &&
          colMap.name === -1
        ) {
          colMap.name = idx;
        } else if ((h.includes('cuit') || h.includes('cuil') || h.includes('tax')) && colMap.cuit === -1) {
          colMap.cuit = idx;
        } else if ((h.includes('email') || h.includes('correo') || h.includes('mail')) && colMap.contactEmail === -1) {
          colMap.contactEmail = idx;
        } else if ((h.includes('telefono') || h.includes('teléfono') || h.includes('celular') || h.includes('movil')) && colMap.phone === -1) {
          colMap.phone = idx;
        } else if ((h.includes('direccion') || h.includes('dirección') || h.includes('domicilio')) && colMap.address === -1) {
          colMap.address = idx;
        } else if ((h.includes('banco') || h.includes('entidad')) && colMap.bankName === -1) {
          colMap.bankName = idx;
        } else if ((h.includes('cbu') || h.includes('cvu')) && colMap.cbuCvu === -1) {
          colMap.cbuCvu = idx;
        } else if (h.includes('alias') && colMap.alias === -1) {
          colMap.alias = idx;
        } else if (h.includes('titular') && colMap.accountHolder === -1) {
          colMap.accountHolder = idx;
        } else if ((h.includes('nota') || h.includes('observaci')) && colMap.notes === -1) {
          colMap.notes = idx;
        }
      });
    }

    const dataRows = hasHeader ? rows.slice(1) : rows;
    const parsed: Omit<Vendor, 'id' | 'createdAt'>[] = [];

    for (const r of dataRows) {
      if (r.length === 0 || r.every((c) => !c)) continue;

      let name = colMap.name !== -1 ? r[colMap.name] : r[0];
      let cuit = colMap.cuit !== -1 ? r[colMap.cuit] : '';
      let contactEmail = colMap.contactEmail !== -1 ? r[colMap.contactEmail] : '';
      let phone = colMap.phone !== -1 ? r[colMap.phone] : '';
      let address = colMap.address !== -1 ? r[colMap.address] : '';
      let bankName = colMap.bankName !== -1 ? r[colMap.bankName] : '';
      let cbuCvu = colMap.cbuCvu !== -1 ? r[colMap.cbuCvu] : '';
      let alias = colMap.alias !== -1 ? r[colMap.alias] : '';
      let accountHolder = colMap.accountHolder !== -1 ? r[colMap.accountHolder] : '';
      let notes = colMap.notes !== -1 ? r[colMap.notes] : '';

      if (!hasHeader) {
        r.forEach((cell) => {
          if (!cuit && /^\d{2}-?\d{8}-?\d$/.test(cell)) cuit = cell;
          else if (!contactEmail && cell.includes('@')) contactEmail = cell;
          else if (!cbuCvu && /^\d{22}$/.test(cell.replace(/\s/g, ''))) cbuCvu = cell;
          else if (!alias && cell.includes('.') && cell.length > 5 && cell.length < 35 && !cell.includes('@')) alias = cell;
        });
      }

      if (!name || !name.trim()) continue;

      const tempVendor: Vendor = {
        id: 'temp',
        name: name.trim(),
        cuit: cuit.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        bankDetails: bankName || cbuCvu || alias || accountHolder ? {
          bankName: bankName || 'BBVA',
          accountType: 'Indefinido',
          cbuCvu: cbuCvu || '',
          alias: alias || '',
          cuitCuil: cuit || '',
          accountHolder: accountHolder || name,
        } : undefined,
        notes: notes.trim() || 'Importado desde planilla',
        createdAt: new Date().toISOString(),
      };

      const norm = normalizeVendorBankDetails(tempVendor);

      parsed.push({
        name: norm.name,
        cuit: norm.cuit,
        contactEmail: norm.contactEmail,
        phone: norm.phone,
        address: norm.address,
        bankDetails: norm.bankDetails,
        notes: norm.notes,
      });
    }

    setParsedItems(parsed);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        handleTextChange(content);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (parsedItems.length === 0) return;
    setIsImporting(true);
    try {
      await onImport(parsedItems);
      onClose();
    } catch (err: any) {
      alert('Error al importar proveedores en Firestore: ' + (err.message || err));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8 space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Importar Proveedores desde Planilla / CSV</h3>
              <p className="text-xs text-slate-500">
                Copia y pega las filas directamente de Google Sheets / Excel o sube un archivo CSV.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
          {/* Text Area & File Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Pega la tabla o CSV copiado de Google Sheets / Excel:
              </label>
              <label className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer flex items-center space-x-1">
                <span>📁 O cargar archivo .csv / .tsv</span>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={`Nombre\tCUIT\tEmail\tCBU\tAlias\nLa Cabrera Norte\t30-71089945-8\tfacturacion@lacabrera.com\t0720198220000034509123\tlacabrera.norte\nEstación YPF\t30-54668997-9\tcontacto@ypf.com.ar\t\t`}
              className="w-full p-3 rounded-2xl border border-slate-200 text-xs font-mono bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-hidden"
            />
          </div>

          {/* Preview Table */}
          {parsedItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center space-x-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Se detectaron {parsedItems.length} proveedores para importar:</span>
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                    <tr>
                      <th className="p-2">Proveedor / Razón Social</th>
                      <th className="p-2">CUIT</th>
                      <th className="p-2">Tipo de Cuenta</th>
                      <th className="p-2">Banco</th>
                      <th className="p-2">CBU / Alias</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {parsedItems.map((item, idx) => {
                      const exists = existingVendors.some(
                        (v) => v.name.toLowerCase().trim() === item.name.toLowerCase().trim()
                      );
                      return (
                        <tr key={`prev-${idx}`} className={exists ? 'bg-amber-50/60' : ''}>
                          <td className="p-2 font-bold text-slate-800 truncate max-w-[150px]">
                            {item.name}
                            {exists && <span className="ml-1 text-[9px] text-amber-700 bg-amber-100 px-1 rounded">Ya existe</span>}
                          </td>
                          <td className="p-2 text-slate-600 font-mono">{item.cuit || '-'}</td>
                          <td className="p-2 text-slate-700 font-medium">{item.bankDetails?.accountType || 'Indefinido'}</td>
                          <td className="p-2 text-slate-700 font-medium">{item.bankDetails?.bankName || '-'}</td>
                          <td className="p-2 text-slate-600 font-mono truncate max-w-[120px]">
                            {item.bankDetails?.cbuCvu || item.bankDetails?.alias || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            disabled={isImporting}
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={parsedItems.length === 0 || isImporting}
            onClick={handleConfirmImport}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold shadow-md cursor-pointer transition active:scale-95 flex items-center space-x-1.5"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Importando a Firestore...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                <span>Importar {parsedItems.length > 0 ? `${parsedItems.length} Proveedores` : ''}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
