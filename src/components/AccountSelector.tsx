import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  CreditCard,
  User,
  Search,
  Plus,
  ChevronDown,
  X,
  Edit3,
} from 'lucide-react';
import { UserBankDetails, UserProfile, Vendor, ExpensePaymentType } from '../types';
import { formatCuit } from '../utils/helpers';
import { VendorFormModal } from './VendorFormModal';

export interface AccountOption {
  id: string;
  name: string;
  cuit?: string;
  bankDetails: UserBankDetails;
  vendorName: string;
  category?: string;
  isPersonal: boolean;
  notes?: string;
  line1: string;
  line2: string;
}

interface AccountSelectorProps {
  bankDetails?: UserBankDetails;
  vendorName?: string;
  cuit?: string;
  onSelectAccount: (data: {
    bankDetails: UserBankDetails;
    vendorName: string;
    cuit?: string;
    category?: string;
    notes?: string;
  }) => void;
  onClearAccount?: () => void;
  vendors?: Vendor[];
  currentUser?: UserProfile;
  storedBank?: UserBankDetails;
  paymentType?: ExpensePaymentType;
  onAddVendor?: (vendor: Omit<Vendor, 'id' | 'createdAt'>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerMode?: 'button' | 'input' | 'chip';
}

export function AccountSelector({
  bankDetails,
  vendorName = '',
  cuit = '',
  onSelectAccount,
  onClearAccount,
  vendors = [],
  currentUser,
  storedBank,
  paymentType = 'PAGO_PROVEEDOR',
  onAddVendor,
  placeholder = 'Seleccionar cuenta...',
  disabled = false,
  className = '',
  triggerMode = 'button',
}: AccountSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isNewVendorModalOpen, setIsNewVendorModalOpen] = useState(false);
  const [isEditVendorModalOpen, setIsEditVendorModalOpen] = useState(false);

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const myBank = storedBank || currentUser?.bankDetails;

  const calculateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      let top = rect.bottom + 4;
      if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
        top = Math.max(10, rect.top - dropdownHeight - 4);
      }
      let left = rect.left;
      const dropdownWidth = 340;
      if (left + dropdownWidth > window.innerWidth - 16) {
        left = Math.max(16, window.innerWidth - dropdownWidth - 16);
      }
      setCoords({ top: Math.max(10, top), left: Math.max(10, left), width: dropdownWidth });
    }
  };

  const handleOpenDropdown = () => {
    if (disabled) return;
    setSearch('');
    calculateCoords();
    setIsOpen(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  // Re-calculate coords on scroll or window resize when open
  useEffect(() => {
    if (!isOpen) return;
    const handleRecalc = () => calculateCoords();
    window.addEventListener('resize', handleRecalc);
    window.addEventListener('scroll', handleRecalc, true);
    return () => {
      window.removeEventListener('resize', handleRecalc);
      window.removeEventListener('scroll', handleRecalc, true);
    };
  }, [isOpen]);

  // Build unified account options list according to specs:
  // Line 1: Nombre (en misma línea y entre paréntesis CUIT si tiene)
  // Line 2: solo Alias o CBU (lo que esté completado). Si están ambos completados poner CBU.
  const allAccounts = useMemo<AccountOption[]>(() => {
    const list: AccountOption[] = [];

    // 1. Personal Account (Mis datos personales)
    if (myBank || currentUser?.name) {
      const pBank = myBank || {
        accountHolder: currentUser?.name || 'Solicitante',
        bankName: '',
        accountType: 'Indefinido',
        cbuCvu: '',
        alias: '',
        cuitCuil: '',
      };

      const name = currentUser?.name || 'Mis datos personales';
      const c = pBank.cuitCuil || '';
      const line1 = c ? `${name} (${formatCuit(c)})` : name;

      let line2 = 'Sin CBU ni Alias';
      if (pBank.cbuCvu && pBank.cbuCvu.trim()) {
        line2 = `CBU: ${pBank.cbuCvu.trim()}`;
      } else if (pBank.alias && pBank.alias.trim()) {
        line2 = `Alias: ${pBank.alias.trim()}`;
      }

      list.push({
        id: 'personal-my-bank',
        name,
        cuit: c,
        bankDetails: pBank,
        vendorName: currentUser?.name || 'Solicitante',
        category: 'Reintegros',
        isPersonal: true,
        line1,
        line2,
      });
    }

    // 2. Catalog Vendors
    vendors.forEach((v) => {
      const vBank = v.bankDetails || {
        accountHolder: v.name,
        cuitCuil: v.cuit || '',
        bankName: '',
        accountType: 'Indefinido',
        alias: '',
        cbuCvu: '',
      };

      const name = v.name;
      const c = v.cuit || vBank.cuitCuil || '';
      const line1 = c ? `${name} (${formatCuit(c)})` : name;

      let line2 = 'Sin CBU ni Alias';
      if (vBank.cbuCvu && vBank.cbuCvu.trim()) {
        line2 = `CBU: ${vBank.cbuCvu.trim()}`;
      } else if (vBank.alias && vBank.alias.trim()) {
        line2 = `Alias: ${vBank.alias.trim()}`;
      }

      list.push({
        id: `vendor-${v.id}`,
        name,
        cuit: c,
        bankDetails: vBank,
        vendorName: v.name,
        category: v.category,
        isPersonal: false,
        notes: v.notes,
        line1,
        line2,
      });
    });

    return list;
  }, [currentUser, myBank, vendors]);

  // Filter accounts and prioritize by paymentType (Reintegro vs Pago Proveedor)
  const filteredAccounts = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      if (paymentType === 'REINTEGRO') {
        return allAccounts;
      }
      return [...allAccounts].sort((a, b) => {
        if (a.isPersonal && !b.isPersonal) return 1;
        if (!a.isPersonal && b.isPersonal) return -1;
        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      });
    }

    return allAccounts.filter((acc) => {
      const text = `${acc.name} ${acc.line1} ${acc.line2} ${acc.cuit || ''} ${acc.bankDetails.alias || ''} ${acc.bankDetails.cbuCvu || ''} ${acc.bankDetails.accountHolder || ''}`.toLowerCase();
      return text.includes(q);
    });
  }, [allAccounts, search, paymentType]);

  const handleSelectAccountItem = (acc: AccountOption) => {
    onSelectAccount({
      bankDetails: acc.bankDetails,
      vendorName: acc.vendorName,
      cuit: acc.cuit,
      category: acc.category,
      notes: acc.notes,
    });
    setIsOpen(false);
  };

  const hasSelectedData = Boolean(
    bankDetails &&
      (bankDetails.alias?.trim() ||
        bankDetails.cbuCvu?.trim() ||
        bankDetails.accountHolder?.trim() ||
        bankDetails.cuitCuil?.trim())
  );

  const matchedVendor = useMemo(() => {
    if (!vendorName && !cuit) return null;
    const vNameClean = vendorName.trim().toLowerCase();
    const cuitClean = (cuit || bankDetails?.cuitCuil || '').replace(/[^0-9]/g, '');

    return (
      vendors.find((v) => {
        const matchName = vNameClean && (v.name || '').trim().toLowerCase() === vNameClean;
        const vCuitClean = (v.cuit || v.bankDetails?.cuitCuil || '').replace(/[^0-9]/g, '');
        const matchCuit = cuitClean && vCuitClean && cuitClean === vCuitClean;
        return matchName || matchCuit;
      }) || null
    );
  }, [vendors, vendorName, cuit, bankDetails]);

  // Chip content: Top = Nombre / Titular, Bottom = (CBU o Alias) y CUIT
  const topName =
    bankDetails?.accountHolder?.trim() ||
    vendorName?.trim() ||
    'Titular de cuenta';

  const bottomCbuAlias = bankDetails?.cbuCvu?.trim()
    ? `CBU: ${bankDetails.cbuCvu.trim()}`
    : bankDetails?.alias?.trim()
    ? `Alias: ${bankDetails.alias.trim()}`
    : '';

  const rawCuit = bankDetails?.cuitCuil?.trim() || cuit?.trim() || '';
  const bottomCuit = rawCuit ? `CUIT ${formatCuit(rawCuit)}` : '';

  const bottomLine =
    bottomCbuAlias && bottomCuit
      ? `${bottomCbuAlias} • ${bottomCuit}`
      : bottomCbuAlias || bottomCuit || 'Sin CBU ni Alias';

  // Highlight matching query text
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <span key={i} className="bg-purple-100 text-purple-900 font-extrabold px-0.5 rounded-xs">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div ref={triggerRef} className={`relative inline-block ${className}`}>
      {/* Trigger: Selected chip vs Default selection button */}
      {hasSelectedData ? (
        <div className="flex items-center gap-1">
          <div
            onClick={() => setIsEditVendorModalOpen(true)}
            className="p-1.5 rounded-lg border border-purple-200 bg-purple-50/50 hover:border-purple-400 hover:bg-purple-50 transition cursor-pointer group max-w-[240px] shadow-2xs"
            title={`Titular: ${topName}\n${bottomLine}\nBanco: ${bankDetails?.bankName || '—'}\n(Clic para ver o editar datos)`}
          >
            <div className="flex items-center justify-between gap-1">
              <div className="text-[11px] font-bold text-purple-950 truncate flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-purple-700 shrink-0" />
                <span className="truncate">{topName}</span>
              </div>
              <Edit3 className="w-2.5 h-2.5 text-purple-400 group-hover:text-purple-700 shrink-0" />
            </div>
            <div className="text-[10px] text-purple-800/80 truncate mt-0.5 font-medium">
              {bottomLine}
            </div>
          </div>

          {onClearAccount && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearAccount();
              }}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
              title="Quitar cuenta y dejar vacío"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={handleOpenDropdown}
          className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 hover:text-slate-900 border border-slate-300 hover:border-slate-400 rounded-lg flex items-center gap-1.5 cursor-pointer transition shadow-2xs whitespace-nowrap disabled:opacity-50"
          title="Seleccionar cuenta o buscar en catálogo"
        >
          <CreditCard className="w-3.5 h-3.5 text-purple-700 shrink-0" />
          <span>{placeholder}</span>
          <ChevronDown className="w-2.5 h-2.5 text-slate-400 ml-0.5" />
        </button>
      )}

      {/* POPUP ESTILO SALESFORCE LOOKUP (Renderizado en Portal) */}
      {isOpen && coords && createPortal(
        <div className="fixed inset-0 z-[99999]">
          <div
            className="fixed inset-0 bg-transparent"
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
            }}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-10 text-left animate-in fade-in zoom-in-95 duration-100 flex flex-col"
          >
            {/* Input de Búsqueda Salesforce Lookup */}
            <div className="p-2 border-b border-slate-200 bg-white">
              <div className="relative flex items-center">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cuenta por nombre, alias, CUIT..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-300 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-hidden font-medium"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="p-1 text-slate-400 hover:text-slate-600 absolute right-1.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Cabecera de Búsqueda */}
            {search.trim() ? (
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center gap-2 text-[11px] text-slate-600 bg-slate-50/70">
                <Search className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate">
                  Resultados para <span className="font-semibold text-slate-900">"{search}"</span>
                </span>
              </div>
            ) : (
              <div className="px-3 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                RESULTADOS DE BÚSQUEDA
              </div>
            )}

            {/* LISTADO DINÁMICO: EXACTAMENTE 3 VISIBLES (max-h-[174px]) PARA VER CÓMODAMENTE 'NUEVA CUENTA' */}
            <div className="max-h-[174px] overflow-y-auto divide-y divide-slate-50">
              {filteredAccounts.length > 0 ? (
                filteredAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => handleSelectAccountItem(acc)}
                    className="w-full px-3 py-2 text-left hover:bg-purple-50/50 flex items-center gap-3 transition cursor-pointer group"
                  >
                    {/* Icono morado */}
                    <div className="w-7 h-7 rounded-md bg-purple-700 text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                      {acc.isPersonal ? (
                        <User className="w-3.5 h-3.5" />
                      ) : (
                        <CreditCard className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Línea 1: Nombre (y CUIT entre paréntesis si tiene) */}
                      <div className="text-xs font-bold text-slate-900 truncate leading-tight group-hover:text-purple-700 transition-colors">
                        {highlightMatch(acc.line1, search)}
                      </div>
                      {/* Línea 2: Solo Alias o CBU (si ambos, CBU) */}
                      <div className="text-[10.5px] text-slate-500 font-mono truncate leading-tight mt-0.5">
                        {highlightMatch(acc.line2, search)}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="py-4 px-3 text-center text-xs text-slate-500">
                  No se encontraron cuentas para "{search}"
                </div>
              )}
            </div>

            {/* ÚLTIMA POSICIÓN: SIEMPRE VISIBLE "+ Nueva cuenta" */}
            <div className="border-t border-slate-200 p-1 bg-slate-50/70 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsNewVendorModalOpen(true);
                }}
                className="w-full px-3 py-2 text-left text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition flex items-center gap-2 cursor-pointer group"
              >
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-800 shrink-0" />
                <span className="font-semibold text-slate-600 group-hover:text-slate-900">
                  Nueva cuenta
                </span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal emergente unificado para crear Nueva Cuenta / Proveedor */}
      <VendorFormModal
        isOpen={isNewVendorModalOpen}
        existingVendors={vendors}
        title="Nueva cuenta bancaria / Proveedor"
        subtitle="Se guardará en proveedores y se asignará al comprobante"
        initialData={{
          id: '',
          name: search || vendorName || '',
          cuit: cuit || bankDetails?.cuitCuil || '',
          category: 'Varios',
          bankDetails: {
            accountHolder: search || vendorName || '',
            bankName: '',
            accountType: 'Indefinido',
            cbuCvu: '',
            alias: '',
            cuitCuil: cuit || bankDetails?.cuitCuil || '',
          },
        }}
        onClose={() => setIsNewVendorModalOpen(false)}
        onSave={(savedVendor) => {
          if (onAddVendor) {
            onAddVendor(savedVendor);
          }
          onSelectAccount({
            bankDetails: savedVendor.bankDetails || {
              accountHolder: savedVendor.name,
              bankName: '',
              accountType: 'Indefinido',
              cbuCvu: '',
              alias: '',
              cuitCuil: savedVendor.cuit || '',
            },
            vendorName: savedVendor.name,
            cuit: savedVendor.cuit,
            category: savedVendor.category,
            notes: savedVendor.notes,
          });
          setIsNewVendorModalOpen(false);
        }}
      />

      {/* Modal emergente unificado para editar la Cuenta seleccionada */}
      <VendorFormModal
        isOpen={isEditVendorModalOpen}
        existingVendors={vendors}
        title="Editar datos de cuenta bancaria"
        subtitle="Modificar datos bancarios asignados a este comprobante"
        initialData={{
          id: matchedVendor?.id || '',
          name: bankDetails?.accountHolder || vendorName || '',
          cuit: bankDetails?.cuitCuil || cuit || '',
          category: matchedVendor?.category || 'Varios',
          notes: matchedVendor?.notes || '',
          bankDetails: bankDetails || matchedVendor?.bankDetails,
        }}
        onClose={() => setIsEditVendorModalOpen(false)}
        onSave={(savedVendor) => {
          onSelectAccount({
            bankDetails: savedVendor.bankDetails || {
              accountHolder: savedVendor.name,
              bankName: '',
              accountType: 'Indefinido',
              cbuCvu: '',
              alias: '',
              cuitCuil: savedVendor.cuit || '',
            },
            vendorName: savedVendor.name,
            cuit: savedVendor.cuit,
            category: savedVendor.category,
            notes: savedVendor.notes,
          });
          setIsEditVendorModalOpen(false);
        }}
      />
    </div>
  );
}
