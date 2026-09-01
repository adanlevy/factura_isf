import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Building2,
  Plus,
  Search,
  CreditCard,
  Mail,
  Phone,
  MapPin,
  FileSpreadsheet,
  Edit2,
  Trash2,
  ExternalLink,
  Tag,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  FileUp,
  RefreshCw,
  RotateCcw,
  ArrowUpDown,
  ArrowDownAZ,
  ArrowUpAZ,
  Calendar,
  Clock,
  FileText,
} from 'lucide-react';
import { Vendor, Expense, UserBankDetails } from '../types';
import { formatCurrency, formatDate } from '../utils/helpers';
import { getSmartSortedOptions } from '../utils/sorting';
import { notifyBankDetailsChange } from '../utils/googleWorkspace';
import { normalizeVendorBankDetails } from '../utils/cloudSync';

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
  availableCategories: string[];
  onAddVendor: (vendor: Omit<Vendor, 'id' | 'createdAt'>) => void;
  onBatchAddVendors?: (vendors: Omit<Vendor, 'id' | 'createdAt'>[]) => void;
  onUpdateVendor: (vendor: Vendor) => void;
  onDeleteVendor: (id: string) => void;
  onViewVendorExpenses: (vendorName: string) => void;
}

export function VendorsView({
  vendors,
  expenses,
  availableCategories,
  onAddVendor,
  onBatchAddVendors,
  onUpdateVendor,
  onDeleteVendor,
  onViewVendorExpenses,
}: VendorsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<VendorSortOption>('name-asc');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);

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
    return vendors.filter((v) => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = v.name.toLowerCase().includes(term);
        const matchCuit = (v.cuit || '').toLowerCase().includes(term);
        const matchEmail = (v.contactEmail || '').toLowerCase().includes(term);
        const matchNotes = (v.notes || '').toLowerCase().includes(term);
        const matchAlias = (v.bankDetails?.alias || '').toLowerCase().includes(term);
        const matchCbu = (v.bankDetails?.cbuCvu || '').toLowerCase().includes(term);
        if (!matchName && !matchCuit && !matchEmail && !matchNotes && !matchAlias && !matchCbu) {
          return false;
        }
      }

      return true;
    });
  }, [vendors, searchTerm]);

  // Sorted and filtered vendors
  const sortedVendors = useMemo(() => {
    const list = [...filteredVendors];
    return list.sort((a, b) => {
      switch (sortOption) {
        case 'name-asc':
          return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
        case 'name-desc':
          return (b.name || '').localeCompare(a.name || '', 'es', { sensitivity: 'base' });
        case 'createdAt-desc': {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        }
        case 'createdAt-asc': {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeA - timeB;
        }
        case 'totalAmount-desc': {
          const amountA = vendorStats.get(a.name.trim().toLowerCase())?.totalAmount || 0;
          const amountB = vendorStats.get(b.name.trim().toLowerCase())?.totalAmount || 0;
          return amountB - amountA;
        }
        case 'count-desc': {
          const countA = vendorStats.get(a.name.trim().toLowerCase())?.count || 0;
          const countB = vendorStats.get(b.name.trim().toLowerCase())?.count || 0;
          return countB - countA;
        }
        default:
          return 0;
      }
    });
  }, [filteredVendors, sortOption, vendorStats]);

  // Global metrics
  const totalBilled = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [expenses]);

  const vendorsWithBank = useMemo(() => {
    return vendors.filter((v) => v.bankDetails?.cbuCvu || v.bankDetails?.alias).length;
  }, [vendors]);

  return (
    <div className="space-y-4">
      {/* Top Banner KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Directorio de Proveedores</span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {vendors.length}
            </div>
            <p className="text-xs text-slate-500">{filteredVendors.length} visible(s) con los filtros</p>
          </div>
        </div>

        <div className="bg-white border border-indigo-200/90 rounded-3xl p-5 shadow-xs flex flex-col justify-between bg-gradient-to-br from-indigo-50/40 via-white to-white">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-900 uppercase tracking-wider">
            <span>Cuentas para Pago Directo</span>
            <CreditCard className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-extrabold text-indigo-950 tracking-tight">
              {vendorsWithBank} / {vendors.length}
            </div>
            <p className="text-xs text-indigo-700 font-medium">
              Proveedores con CBU/Alias precargados
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 text-white shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-300 uppercase tracking-wider">
            <span>Facturación Histórica</span>
            <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-extrabold text-white tracking-tight">
              {formatCurrency(totalBilled)}
            </div>
            <p className="text-xs text-slate-300">Total acumulado en comprobantes vinculados</p>
          </div>
        </div>
      </div>

      {/* Control Bar: Search, Sorting and Actions */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-xs space-y-3">
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

        {/* Quick Sort Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-bold text-slate-400 mr-1">Orden rápido:</span>
          <button
            type="button"
            id="vendor-sort-name-asc"
            onClick={() => setSortOption('name-asc')}
            className={`px-2.5 py-1 rounded-xl font-bold text-[11px] transition cursor-pointer flex items-center gap-1 ${
              sortOption === 'name-asc'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ArrowDownAZ className="w-3 h-3" />
            <span>A → Z</span>
          </button>
          <button
            type="button"
            id="vendor-sort-name-desc"
            onClick={() => setSortOption('name-desc')}
            className={`px-2.5 py-1 rounded-xl font-bold text-[11px] transition cursor-pointer flex items-center gap-1 ${
              sortOption === 'name-desc'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ArrowUpAZ className="w-3 h-3" />
            <span>Z → A</span>
          </button>
          <button
            type="button"
            id="vendor-sort-created-desc"
            onClick={() => setSortOption('createdAt-desc')}
            className={`px-2.5 py-1 rounded-xl font-bold text-[11px] transition cursor-pointer flex items-center gap-1 ${
              sortOption === 'createdAt-desc'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>Más recientes</span>
          </button>
          <button
            type="button"
            id="vendor-sort-created-asc"
            onClick={() => setSortOption('createdAt-asc')}
            className={`px-2.5 py-1 rounded-xl font-bold text-[11px] transition cursor-pointer flex items-center gap-1 ${
              sortOption === 'createdAt-asc'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Calendar className="w-3 h-3" />
            <span>Más antiguos</span>
          </button>
          <button
            type="button"
            id="vendor-sort-amount-desc"
            onClick={() => setSortOption('totalAmount-desc')}
            className={`px-2.5 py-1 rounded-xl font-bold text-[11px] transition cursor-pointer flex items-center gap-1 ${
              sortOption === 'totalAmount-desc'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Mayor Facturación</span>
          </button>
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
                      <span className="font-bold text-slate-800">{bank?.accountType || 'Indefinido'}</span>
                    </div>
                    <div className="col-span-2 truncate">
                      <span className="text-slate-400 font-medium">Alias:</span>{' '}
                      <span className="font-mono font-bold text-indigo-950 bg-white px-1.5 py-0.5 rounded border border-slate-200">{bank?.alias || '-'}</span>
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
          availableCategories={availableCategories}
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

      {/* Modal: Create Vendor */}
      {isCreateModalOpen && (
        <VendorFormModal
          isOpen={isCreateModalOpen}
          title="Registrar Nuevo Proveedor"
          subtitle="Carga los datos del proveedor (nombre o datos completos para transferencias directas)"
          onClose={() => setIsCreateModalOpen(false)}
          onSave={(data) => {
            onAddVendor(data);
            setIsCreateModalOpen(false);
          }}
        />
      )}

      {/* Modal: Edit Vendor */}
      {editingVendor && (
        <VendorFormModal
          isOpen={Boolean(editingVendor)}
          initialData={editingVendor}
          title="Editar Datos de Proveedor"
          subtitle="Modifica cualquier dato contable, de contacto o bancario del proveedor"
          onClose={() => setEditingVendor(null)}
          onSave={(data) => {
            onUpdateVendor({ ...editingVendor, ...data });
            setEditingVendor(null);
          }}
        />
      )}

      {/* Delete Vendor Confirmation Modal */}
      {vendorToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">¿Eliminar proveedor?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Estás por eliminar de forma permanente a <strong className="text-slate-800">{vendorToDelete.name}</strong> del catálogo de proveedores.
              </p>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setVendorToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (vendorToDelete) {
                    onDeleteVendor(vendorToDelete.id);
                    setVendorToDelete(null);
                  }
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface VendorFormModalProps {
  isOpen: boolean;
  initialData?: Vendor;
  title: string;
  subtitle: string;
  onClose: () => void;
  onSave: (data: Omit<Vendor, 'id' | 'createdAt'>) => void;
}

function VendorFormModal({
  isOpen,
  initialData,
  title,
  subtitle,
  onClose,
  onSave,
}: VendorFormModalProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [cuit, setCuit] = useState(initialData?.cuit || '');
  const [contactEmail, setContactEmail] = useState(initialData?.contactEmail || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [bankData, setBankData] = useState<UserBankDetails>(
    initialData?.bankDetails || {
      bankName: '',
      accountType: 'Indefinido',
      cbuCvu: '',
      alias: '',
      cuitCuil: initialData?.cuit || '',
      accountHolder: initialData?.name || '',
    }
  );

  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccessMsg, setScanSuccessMsg] = useState<string | null>(null);
  const [scanErrorMsg, setScanErrorMsg] = useState<string | null>(null);
  const [previousValues, setPreviousValues] = useState<Record<string, string>>({});

  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setName(initialData?.name || '');
      setCuit(initialData?.cuit || '');
      setContactEmail(initialData?.contactEmail || '');
      setPhone(initialData?.phone || '');
      setNotes(initialData?.notes || '');
      setBankData(
        initialData?.bankDetails || {
          bankName: '',
          accountType: 'Indefinido',
          cbuCvu: '',
          alias: '',
          cuitCuil: initialData?.cuit || '',
          accountHolder: initialData?.name || '',
        }
      );
      setPreviousValues({});
      setScanSuccessMsg(null);
      setScanErrorMsg(null);
      setIsScanning(false);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRevertField = (fieldKey: string) => {
    const prevVal = previousValues[fieldKey];
    if (prevVal === undefined) return;

    if (fieldKey === 'name') setName(prevVal);
    else if (fieldKey === 'cuit') setCuit(prevVal);
    else if (fieldKey === 'contactEmail') setContactEmail(prevVal);
    else if (fieldKey === 'phone') setPhone(prevVal);
    else if (fieldKey === 'notes') setNotes(prevVal);
    else if (fieldKey === 'bankName') setBankData((prev) => ({ ...prev, bankName: prevVal }));
    else if (fieldKey === 'accountType') setBankData((prev) => ({ ...prev, accountType: prevVal as any }));
    else if (fieldKey === 'alias') setBankData((prev) => ({ ...prev, alias: prevVal }));
    else if (fieldKey === 'cbuCvu') setBankData((prev) => ({ ...prev, cbuCvu: prevVal }));
    else if (fieldKey === 'accountHolder') setBankData((prev) => ({ ...prev, accountHolder: prevVal }));

    const updated = { ...previousValues };
    delete updated[fieldKey];
    setPreviousValues(updated);
  };

  const getCurrentFieldValue = (fieldKey: string): string => {
    if (fieldKey === 'name') return name;
    if (fieldKey === 'cuit') return cuit;
    if (fieldKey === 'contactEmail') return contactEmail;
    if (fieldKey === 'phone') return phone;
    if (fieldKey === 'notes') return notes;
    if (fieldKey === 'bankName') return bankData.bankName;
    if (fieldKey === 'accountType') return bankData.accountType || 'Indefinido';
    if (fieldKey === 'alias') return bankData.alias;
    if (fieldKey === 'cbuCvu') return bankData.cbuCvu;
    if (fieldKey === 'accountHolder') return bankData.accountHolder || '';
    return '';
  };

  const renderPreviousValueNotice = (fieldKey: string) => {
    const prevVal = previousValues[fieldKey];
    if (prevVal === undefined || prevVal === null) return null;
    const currentVal = getCurrentFieldValue(fieldKey);
    if (!prevVal.trim() || prevVal.trim().toLowerCase() === currentVal.trim().toLowerCase()) {
      return null;
    }

    return (
      <div className="flex items-center justify-between text-[11px] text-amber-900 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200/80 mt-1">
        <span className="truncate">valor anterior: <strong className="font-semibold">{prevVal}</strong></span>
        <button
          type="button"
          onClick={() => handleRevertField(fieldKey)}
          className="text-amber-800 hover:text-indigo-600 font-bold text-[10px] underline cursor-pointer shrink-0 ml-2 flex items-center gap-1"
          title="Restaurar valor anterior"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Revertir</span>
        </button>
      </div>
    );
  };

  const handleFileScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanErrorMsg(null);
    setScanSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const res = await fetch('/api/process-vendor-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64,
            mimeType: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
          }),
        });

        const json = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.error || 'No se pudieron extraer los datos del documento');
        }

        const ext = json.data;
        const newPreviousValues: Record<string, string> = { ...previousValues };
        let changedCount = 0;

        // Name
        if (ext.name && ext.name.trim()) {
          const val = ext.name.trim();
          if (name && name.trim().toLowerCase() !== val.toLowerCase()) {
            newPreviousValues['name'] = name.trim();
            setName(val);
            changedCount++;
          } else if (!name) {
            setName(val);
            changedCount++;
          }
        }

        // CUIT
        if (ext.cuit && ext.cuit.trim()) {
          const val = ext.cuit.trim();
          if (cuit && cuit.trim().toLowerCase() !== val.toLowerCase()) {
            newPreviousValues['cuit'] = cuit.trim();
            setCuit(val);
            changedCount++;
          } else if (!cuit) {
            setCuit(val);
            changedCount++;
          }
        }

        // Contact Email
        if (ext.contactEmail && ext.contactEmail.trim()) {
          const val = ext.contactEmail.trim();
          if (contactEmail && contactEmail.trim().toLowerCase() !== val.toLowerCase()) {
            newPreviousValues['contactEmail'] = contactEmail.trim();
            setContactEmail(val);
            changedCount++;
          } else if (!contactEmail) {
            setContactEmail(val);
            changedCount++;
          }
        }

        // Phone
        if (ext.phone && ext.phone.trim()) {
          const val = ext.phone.trim();
          if (phone && phone.trim().toLowerCase() !== val.toLowerCase()) {
            newPreviousValues['phone'] = phone.trim();
            setPhone(val);
            changedCount++;
          } else if (!phone) {
            setPhone(val);
            changedCount++;
          }
        }

        // Notes
        if (ext.notes && ext.notes.trim()) {
          const val = ext.notes.trim();
          if (notes && notes.trim().toLowerCase() !== val.toLowerCase()) {
            newPreviousValues['notes'] = notes.trim();
            setNotes(val);
            changedCount++;
          } else if (!notes) {
            setNotes(val);
            changedCount++;
          }
        }

        const invalidPlaceholders = /^(no_alias|no alias|no_tiene|no tiene|n\/a|na|null|none|sin alias|undefined|sin_alias|no posee|s\/d|sd|-|—)$/i;

        // Bank data
        let nextBankData = { ...bankData };
        if (ext.bankName && ext.bankName.trim() && !invalidPlaceholders.test(ext.bankName.trim())) {
          const val = ext.bankName.trim();
          if (bankData.bankName && bankData.bankName.trim().toLowerCase() !== val.toLowerCase()) {
            newPreviousValues['bankName'] = bankData.bankName.trim();
            nextBankData.bankName = val;
            changedCount++;
          } else if (!bankData.bankName) {
            nextBankData.bankName = val;
            changedCount++;
          }
        }

        if (ext.accountType && ['Caja de Ahorro', 'Cuenta Corriente', 'Indefinido'].includes(ext.accountType)) {
          const val = ext.accountType as any;
          const currentAcc = bankData.accountType || 'Indefinido';
          if (currentAcc.trim().toLowerCase() !== val.trim().toLowerCase()) {
            if (currentAcc && currentAcc !== 'Indefinido') {
              newPreviousValues['accountType'] = currentAcc;
            }
            nextBankData.accountType = val;
            changedCount++;
          }
        }

        if (ext.alias && ext.alias.trim() && !invalidPlaceholders.test(ext.alias.trim())) {
          const val = ext.alias.trim();
          if (bankData.alias && bankData.alias.trim().toLowerCase() !== val.toLowerCase()) {
            newPreviousValues['alias'] = bankData.alias.trim();
            nextBankData.alias = val;
            changedCount++;
          } else if (!bankData.alias) {
            nextBankData.alias = val;
            changedCount++;
          }
        }

        if (ext.cbuCvu && ext.cbuCvu.trim() && !invalidPlaceholders.test(ext.cbuCvu.trim())) {
          const digits = ext.cbuCvu.trim().replace(/\D/g, '');
          const val = digits.length === 22 ? digits : ext.cbuCvu.trim();
          if (bankData.cbuCvu && bankData.cbuCvu.trim().toLowerCase() !== val.toLowerCase()) {
            newPreviousValues['cbuCvu'] = bankData.cbuCvu.trim();
            nextBankData.cbuCvu = val;
            changedCount++;
          } else if (!bankData.cbuCvu) {
            nextBankData.cbuCvu = val;
            changedCount++;
          }
        }

        if (ext.accountHolder && ext.accountHolder.trim() && !invalidPlaceholders.test(ext.accountHolder.trim())) {
          const val = ext.accountHolder.trim();
          if (bankData.accountHolder && bankData.accountHolder.trim().toLowerCase() !== val.toLowerCase()) {
            newPreviousValues['accountHolder'] = bankData.accountHolder.trim();
            nextBankData.accountHolder = val;
            changedCount++;
          } else if (!bankData.accountHolder) {
            nextBankData.accountHolder = val;
            changedCount++;
          }
        }

        setBankData(nextBankData);
        setPreviousValues(newPreviousValues);

        if (changedCount > 0) {
          setScanSuccessMsg(`¡Escaneo de archivo completado! Se completaron o actualizaron ${changedCount} campos.`);
        } else {
          setScanSuccessMsg('Archivo procesado. No se detectaron datos nuevos.');
        }
      } catch (err: any) {
        setScanErrorMsg(err.message || 'Error al escanear archivo con IA');
      } finally {
        setIsScanning(false);
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Ingresa el nombre o razón social del proveedor.');
      return;
    }

    // Clear previous values notices on save
    setPreviousValues({});

    const rawVendor: Vendor = {
      id: initialData?.id || 'temp',
      name: name.trim(),
      cuit: cuit.trim() || undefined,
      category: initialData?.category || undefined,
      contactEmail: contactEmail.trim() || undefined,
      phone: phone.trim() || undefined,
      address: initialData?.address || undefined,
      notes: notes.trim() || undefined,
      createdAt: initialData?.createdAt || new Date().toISOString(),
      bankDetails: {
        bankName: bankData.bankName?.trim() || '',
        accountType: bankData.accountType || 'Indefinido',
        cbuCvu: bankData.cbuCvu?.trim() || '',
        alias: bankData.alias?.trim() || '',
        cuitCuil: bankData.cuitCuil || cuit.trim() || '',
        accountHolder: bankData.accountHolder?.trim() || name.trim(),
      },
    };

    const normalized = normalizeVendorBankDetails(rawVendor);

    if (normalized.bankDetails) {
      notifyBankDetailsChange({
        updatedBy: { email: 'admin@isf-argentina.org', name: 'Administrador' },
        targetType: 'vendor',
        targetName: `Proveedor: ${name.trim()}`,
        bankDetails: normalized.bankDetails,
      }).catch((err) => console.warn('Notification error:', err));
    }

    onSave({
      name: normalized.name,
      cuit: normalized.cuit,
      category: normalized.category,
      contactEmail: normalized.contactEmail,
      phone: normalized.phone,
      address: normalized.address,
      notes: normalized.notes,
      bankDetails: normalized.bankDetails,
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">{title}</h3>
              <p className="text-xs text-indigo-300">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* File Upload / OCR Scan Box */}
          <div className="p-4 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs shrink-0">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Escanear Documento / Comprobante con IA</h4>
                  <p className="text-[11px] text-slate-500">
                    Cargá una imagen (JPG, PNG) o PDF con datos del proveedor, CBU, Alias o constancia fiscal.
                  </p>
                </div>
              </div>

              <label
                className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition flex items-center justify-center space-x-1.5 shrink-0 ${
                  isScanning
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs active:scale-95'
                }`}
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Escaneando...</span>
                  </>
                ) : (
                  <>
                    <FileUp className="w-3.5 h-3.5" />
                    <span>Cargar Imagen / PDF</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileScan}
                  disabled={isScanning}
                  className="hidden"
                />
              </label>
            </div>

            {scanSuccessMsg && (
              <div className="text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded-xl border border-emerald-200 flex items-center space-x-1.5 animate-in fade-in duration-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{scanSuccessMsg}</span>
              </div>
            )}

            {scanErrorMsg && (
              <div className="text-[11px] text-rose-800 bg-rose-50 p-2 rounded-xl border border-rose-200 flex items-center space-x-1.5 animate-in fade-in duration-200">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>{scanErrorMsg}</span>
              </div>
            )}
          </div>

          {/* Main info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre / Razón Social *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Ferretería Industrial del Norte"
                className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white"
                required
              />
              {renderPreviousValueNotice('name')}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                CUIT / Identificación Fiscal
              </label>
              <input
                type="text"
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
                placeholder="30-71089945-8"
                className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white"
              />
              {renderPreviousValueNotice('cuit')}
            </div>
          </div>

          {/* Contact Email & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email de Facturación / Contacto
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="facturacion@proveedor.com.ar"
                className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white"
              />
              {renderPreviousValueNotice('contactEmail')}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Teléfono de Contacto
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+54 11 4832-5754"
                className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white"
              />
              {renderPreviousValueNotice('phone')}
            </div>
          </div>

          {/* Bank Details */}
          <div className="p-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 space-y-2.5">
            <span className="text-xs font-bold text-indigo-950 flex items-center">
              <CreditCard className="w-3.5 h-3.5 mr-1 text-indigo-600" />
              Datos Bancarios
            </span>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Banco</label>
                <input
                  type="text"
                  value={bankData.bankName || ''}
                  onChange={(e) => setBankData({ ...bankData, bankName: e.target.value })}
                  placeholder="Ej: BBVA"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs outline-hidden bg-white"
                />
                {renderPreviousValueNotice('bankName')}
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Tipo de Cuenta</label>
                <select
                  value={bankData.accountType || 'Indefinido'}
                  onChange={(e) => setBankData({ ...bankData, accountType: e.target.value as any })}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs outline-hidden bg-white font-medium cursor-pointer"
                >
                  <option value="Indefinido">Indefinido</option>
                  <option value="Caja de Ahorro">Caja de Ahorro</option>
                  <option value="Cuenta Corriente">Cuenta Corriente</option>
                </select>
                {renderPreviousValueNotice('accountType')}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Alias</label>
                <input
                  type="text"
                  value={bankData.alias || ''}
                  onChange={(e) => setBankData({ ...bankData, alias: e.target.value })}
                  placeholder="Ej: proveedor.santander"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-indigo-900 outline-hidden bg-white"
                />
                {renderPreviousValueNotice('alias')}
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">CBU / CVU (22 dígitos)</label>
                <input
                  type="text"
                  value={bankData.cbuCvu || ''}
                  onChange={(e) => setBankData({ ...bankData, cbuCvu: e.target.value })}
                  placeholder="0720198220000034509123"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-mono outline-hidden bg-white"
                />
                {renderPreviousValueNotice('cbuCvu')}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Titular de la Cuenta</label>
              <input
                type="text"
                value={bankData.accountHolder || ''}
                onChange={(e) => setBankData({ ...bankData, accountHolder: e.target.value })}
                placeholder="Razón Social / Nombre del Titular"
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs outline-hidden bg-white"
              />
              {renderPreviousValueNotice('accountHolder')}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Notas / Observaciones del Proveedor
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Descuentos conveniados, plazos de pago, contacto de urgencia..."
              className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white"
            />
            {renderPreviousValueNotice('notes')}
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-md cursor-pointer transition active:scale-95"
            >
              Guardar Proveedor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface VendorImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableCategories: string[];
  existingVendors: Vendor[];
  onImport: (vendors: Omit<Vendor, 'id' | 'createdAt'>[]) => void;
}

function VendorImportModal({
  isOpen,
  onClose,
  availableCategories,
  existingVendors,
  onImport,
}: VendorImportModalProps) {
  const [rawText, setRawText] = useState('');
  const [defaultCategory, setDefaultCategory] = useState<string>(availableCategories[0] || 'Alimentos y Viáticos');
  const [parsedItems, setParsedItems] = useState<Omit<Vendor, 'id' | 'createdAt'>[]>([]);

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
      ['nombre', 'razon', 'razón', 'proveedor', 'empresa', 'cuit', 'cuil', 'rubro', 'categoria', 'categoría', 'cbu', 'alias', 'email'].some(
        (k) => h.includes(k)
      )
    );

    const colMap = {
      name: -1,
      cuit: -1,
      category: -1,
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
        } else if ((h.includes('rubro') || h.includes('categoria') || h.includes('categoría') || h.includes('tipo')) && colMap.category === -1) {
          colMap.category = idx;
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
      let category = colMap.category !== -1 ? r[colMap.category] : '';
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
        category: category.trim() || defaultCategory || 'General',
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
        category: norm.category,
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

  const handleConfirmImport = () => {
    if (parsedItems.length === 0) return;
    onImport(parsedItems);
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
          {/* Default Category selector */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700">Rubro por defecto (si la fila no lo especifica):</span>
            <select
              value={defaultCategory}
              onChange={(e) => {
                setDefaultCategory(e.target.value);
                if (rawText) handleTextChange(rawText);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 outline-hidden"
            >
              {availableCategories.map((cat) => (
                <option key={`import-cat-${cat}`} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

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
              placeholder={`Nombre\tCUIT\tRubro\tEmail\tCBU\tAlias\nLa Cabrera Norte\t30-71089945-8\tAlimentos y Viáticos\tfacturacion@lacabrera.com\t0720198220000034509123\tlacabrera.norte\nEstación YPF\t30-54668997-9\tTransporte, Combustible\tcontacto@ypf.com.ar\t\t`}
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
                      <th className="p-2">Rubro</th>
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
                          <td className="p-2 text-slate-600">{item.category}</td>
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
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={parsedItems.length === 0}
            onClick={handleConfirmImport}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold shadow-md cursor-pointer transition active:scale-95 flex items-center space-x-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Importar {parsedItems.length > 0 ? `${parsedItems.length} Proveedores` : ''}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
