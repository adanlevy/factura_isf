import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  CreditCard,
  Building2,
  Receipt,
  Check,
  Zap,
  Search,
  User,
  CheckCircle2,
  Clock,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { ExpensePaymentType, UserBankDetails, UserProfile, Vendor, Expense, ReimbursementStatus } from '../types';
import { getStoredUserBankDetails } from '../utils/auth';

interface PaymentTypeSelectorProps {
  paymentType: ExpensePaymentType;
  onChangePaymentType: (type: ExpensePaymentType) => void;
  bankDetails: UserBankDetails;
  onChangeBankDetails: (details: UserBankDetails) => void;
  currentUser?: UserProfile;
  vendors?: Vendor[];
  existingExpenses?: Expense[];
  reimbursementStatus?: ReimbursementStatus;
  onChangeReimbursementStatus?: (status: ReimbursementStatus) => void;
  onSelectVendorName?: (name: string) => void;
  isCompact?: boolean;
  vendorNotes?: string;
  onChangeVendorNotes?: (notes: string) => void;
}

export function PaymentTypeSelector({
  paymentType,
  onChangePaymentType,
  bankDetails,
  onChangeBankDetails,
  currentUser,
  vendors = [],
  existingExpenses = [],
  reimbursementStatus = 'PENDING',
  onChangeReimbursementStatus,
  onSelectVendorName,
  isCompact = false,
  vendorNotes,
  onChangeVendorNotes,
}: PaymentTypeSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const storedUserBank = currentUser?.email ? getStoredUserBankDetails(currentUser.email) : null;
  const myBank = currentUser?.bankDetails || storedUserBank;

  // Click outside to close suggestion dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Collect candidate accounts from vendors and previous expenses
  const suggestedAccounts = useMemo(() => {
    const list: {
      source: 'vendor' | 'expense';
      name: string;
      cuit?: string;
      bankName?: string;
      accountType?: string;
      cbuCvu?: string;
      alias?: string;
      accountHolder?: string;
      notes?: string;
    }[] = [];

    // 1. If PAGO_PROVEEDOR: ONLY suggest from the official Vendors catalog (strictly 1:1 with Proveedores tab)
    if (paymentType === 'PAGO_PROVEEDOR') {
      const seen = new Set<string>();
      vendors.forEach((v) => {
        const vName = (v.name || '').trim();
        if (vName && !seen.has(vName.toLowerCase())) {
          seen.add(vName.toLowerCase());
          list.push({
            source: 'vendor',
            name: vName,
            cuit: v.cuit || v.bankDetails?.cuitCuil,
            bankName: v.bankDetails?.bankName,
            accountType: v.bankDetails?.accountType,
            cbuCvu: v.bankDetails?.cbuCvu,
            alias: v.bankDetails?.alias,
            accountHolder: v.bankDetails?.accountHolder || vName,
            notes: v.notes,
          });
        }
      });
      // Sort alphabetically
      list.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      return list;
    }

    // 2. If REINTEGRO: From previous reimbursement expenses with bank details
    existingExpenses.forEach((exp) => {
      if (exp.bankDetails && (exp.bankDetails.alias || exp.bankDetails.cbuCvu)) {
        const holder = exp.bankDetails.accountHolder || exp.submittedByName;
        const exists = list.some(
          (item) =>
            item.cbuCvu === exp.bankDetails?.cbuCvu &&
            item.alias === exp.bankDetails?.alias &&
            item.name.toLowerCase() === (holder || '').toLowerCase()
        );
        if (!exists && holder) {
          list.push({
            source: 'expense',
            name: holder,
            cuit: exp.bankDetails.cuitCuil,
            bankName: exp.bankDetails.bankName,
            accountType: exp.bankDetails.accountType,
            cbuCvu: exp.bankDetails.cbuCvu,
            alias: exp.bankDetails.alias,
            accountHolder: holder,
          });
        }
      }
    });

    return list;
  }, [vendors, existingExpenses, paymentType]);

  // Filter suggestions based on query
  const filteredSuggestions = useMemo(() => {
    const q = (searchQuery || bankDetails.accountHolder || '').toLowerCase().trim();
    if (!q) return suggestedAccounts.slice(0, 8);

    return suggestedAccounts.filter(
      (acc) =>
        acc.name.toLowerCase().includes(q) ||
        (acc.accountHolder && acc.accountHolder.toLowerCase().includes(q)) ||
        (acc.alias && acc.alias.toLowerCase().includes(q)) ||
        (acc.cuit && acc.cuit.includes(q)) ||
        (acc.bankName && acc.bankName.toLowerCase().includes(q)) ||
        (acc.cbuCvu && acc.cbuCvu.includes(q))
    ).slice(0, 10);
  }, [suggestedAccounts, searchQuery, bankDetails.accountHolder]);

  const handleApplySuggestion = (acc: typeof suggestedAccounts[0]) => {
    const updated: UserBankDetails = {
      accountHolder: acc.accountHolder || acc.name,
      bankName: acc.bankName || bankDetails.bankName || '',
      accountType: acc.accountType || bankDetails.accountType || 'Indefinido',
      cbuCvu: acc.cbuCvu || bankDetails.cbuCvu || '',
      alias: acc.alias || bankDetails.alias || '',
      cuitCuil: acc.cuit || bankDetails.cuitCuil || '',
    };
    onChangeBankDetails(updated);
    setSearchQuery(acc.name);
    setShowSuggestions(false);

    if (acc.notes !== undefined && onChangeVendorNotes) {
      onChangeVendorNotes(acc.notes);
    }

    if (onSelectVendorName && paymentType === 'PAGO_PROVEEDOR') {
      onSelectVendorName(acc.name);
    }
  };

  const handleUseMyAccount = () => {
    if (!myBank) return;
    const updated: UserBankDetails = {
      bankName: myBank.bankName || '',
      accountType: myBank.accountType || 'Indefinido',
      cbuCvu: myBank.cbuCvu || '',
      alias: myBank.alias || '',
      cuitCuil: myBank.cuitCuil || '',
      accountHolder: myBank.accountHolder || currentUser?.name || '',
    };
    onChangeBankDetails(updated);
    setSearchQuery(updated.accountHolder);
  };

  // Matched vendor from catalog (to show observations/notes)
  const matchedVendor = useMemo(() => {
    const query = (searchQuery || bankDetails.accountHolder || '').trim().toLowerCase();
    const cuit = (bankDetails.cuitCuil || '').trim();
    if (!query && !cuit) return null;

    return (
      vendors.find((v) => {
        const vName = (v.name || '').trim().toLowerCase();
        const vCuit = (v.cuit || v.bankDetails?.cuitCuil || '').trim();
        const vHolder = (v.bankDetails?.accountHolder || '').trim().toLowerCase();

        if (cuit && vCuit && vCuit === cuit) return true;
        if (query && (vName === query || vHolder === query)) return true;
        return false;
      }) || null
    );
  }, [vendors, searchQuery, bankDetails.accountHolder, bankDetails.cuitCuil]);

  const options: {
    type: ExpensePaymentType;
    title: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    activeColor: string;
  }[] = [
    {
      type: 'REINTEGRO',
      title: 'Es Reintegro',
      description: 'El colaborador pagó con fondos propios y solicita devolución',
      icon: <Receipt className="w-4 h-4" />,
      color: 'border-amber-200 text-amber-900 bg-amber-50/50',
      activeColor: 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/20 text-amber-950 font-bold',
    },
    {
      type: 'PAGO_PROVEEDOR',
      title: 'Es Pago a Proveedor',
      description: 'Transferencia bancaria directa a cuenta de proveedor',
      icon: <Building2 className="w-4 h-4" />,
      color: 'border-indigo-200 text-indigo-900 bg-indigo-50/40',
      activeColor: 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-600/20 text-indigo-950 font-bold',
    },
    {
      type: 'TARJETA_CORPORATIVA',
      title: 'Tarjeta corporativa',
      description: 'Abonado con la tarjeta corporativa de la organización',
      icon: <CreditCard className="w-4 h-4" />,
      color: 'border-slate-200 text-slate-800 bg-slate-50',
      activeColor: 'border-slate-800 bg-slate-900 text-white font-bold ring-2 ring-slate-400/30',
    },
    {
      type: 'TARJETA_DEBITO_GALICIA',
      title: 'Tarjeta Débito Galicia',
      description: 'Débito directo en la cuenta Galicia institucional',
      icon: <CreditCard className="w-4 h-4" />,
      color: 'border-orange-200 text-orange-900 bg-orange-50/40',
      activeColor: 'border-orange-500 bg-orange-500 text-white font-bold ring-2 ring-orange-400/30',
    },
  ];

  return (
    <div className="space-y-4">
      {/* 4 Mutually Exclusive Cards Header */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
          Definición del Medio de Pago (Mutuamente Excluyente) *
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {options.map((opt) => {
            const isSelected = paymentType === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => onChangePaymentType(opt.type)}
                className={`p-3 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? opt.activeColor
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <div className="flex items-center space-x-1.5">
                    <span className={isSelected ? 'text-current' : 'text-slate-500'}>
                      {opt.icon}
                    </span>
                    <span className="text-xs font-bold">{opt.title}</span>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${
                      isSelected
                        ? opt.type === 'TARJETA_CORPORATIVA'
                          ? 'border-slate-900 bg-slate-900'
                          : opt.type === 'TARJETA_DEBITO_GALICIA'
                          ? 'border-orange-600 bg-orange-600'
                          : opt.type === 'PAGO_PROVEEDOR'
                          ? 'border-indigo-600 bg-indigo-600'
                          : 'border-amber-600 bg-amber-600'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {isSelected && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white shadow-2xs animate-in zoom-in-75 duration-150" />
                    )}
                  </div>
                </div>
                <p
                  className={`text-[11px] leading-tight line-clamp-2 ${
                    isSelected
                      ? opt.type === 'TARJETA_CORPORATIVA' || opt.type === 'TARJETA_DEBITO_GALICIA'
                        ? 'text-white/85'
                        : 'text-slate-600'
                      : 'text-slate-400'
                  }`}
                >
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Case 1: REINTEGRO Mode */}
      {paymentType === 'REINTEGRO' && (
        <div className="p-4 rounded-2xl border border-amber-300/80 bg-amber-50/50 space-y-3.5 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/70 pb-3">
            <div className="flex items-center space-x-2">
              <div className="p-1 bg-amber-600 text-white rounded-lg">
                <Receipt className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-950">Datos de Cuenta para el Reintegro</h4>
                <p className="text-[11px] text-amber-800">
                  Completar o seleccionar la cuenta a la cual transferir el reembolso.
                </p>
              </div>
            </div>

            {/* Quick 1-Click Button: "Ingresar mi cuenta" */}
            {myBank && (
              <button
                type="button"
                onClick={handleUseMyAccount}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                title="Cargar automáticamente los datos de mi cuenta precargada en el perfil"
              >
                <Zap className="w-3.5 h-3.5 text-amber-200" />
                <span>Ingresar mi cuenta ({myBank.alias || myBank.bankName})</span>
              </button>
            )}
          </div>

          {/* Status selector if editable, or badge if read-only */}
          {onChangeReimbursementStatus ? (
            <div className="flex items-center space-x-2 text-xs">
              <span className="font-semibold text-amber-950">Estado de Reintegro:</span>
              <select
                value={reimbursementStatus === 'REIMBURSED' ? 'REIMBURSED' : 'PENDING'}
                onChange={(e) => onChangeReimbursementStatus(e.target.value as ReimbursementStatus)}
                className="px-2.5 py-1 rounded-xl border border-amber-300 bg-white font-bold text-amber-900 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden cursor-pointer"
              >
                <option value="PENDING">⏳ Pendiente de Reintegro</option>
                <option value="REIMBURSED">✅ Reintegrado / Liquidado</option>
              </select>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-xs">
              <span className="font-semibold text-amber-950">Estado de Reintegro:</span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  reimbursementStatus === 'REIMBURSED'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                {reimbursementStatus === 'REIMBURSED' ? '✅ Reintegrado / Liquidado' : '⏳ Pendiente de Reintegro'}
              </span>
              <span className="text-[10px] text-slate-500 italic">(Gestionable en Gestión Pagos)</span>
            </div>
          )}

          {/* Name input with Autocomplete */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-[11px] font-bold text-amber-950 mb-1">
              Nombre / Titular de la Cuenta (o buscar en contactos precargados)
            </label>
            <div className="relative">
              <User className="w-3.5 h-3.5 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={bankDetails.accountHolder || searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  onChangeBankDetails({ ...bankDetails, accountHolder: val });
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Escribe el nombre del colaborador o titular..."
                className="w-full pl-8.5 pr-4 py-2 rounded-xl border border-amber-300 bg-white text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-slate-200 z-30 overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto animate-in fade-in">
                <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold uppercase text-slate-500 flex justify-between">
                  <span>Cuentas sugeridas precargadas</span>
                  <span>Click para autocompletar</span>
                </div>
                {filteredSuggestions.map((acc, idx) => (
                  <button
                    key={`reimb-sugg-${idx}`}
                    type="button"
                    onClick={() => handleApplySuggestion(acc)}
                    className="w-full text-left px-3.5 py-2 hover:bg-amber-50/80 transition flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-slate-900 flex items-center">
                        <span>{acc.accountHolder || acc.name}</span>
                        {acc.cuit && (
                          <span className="ml-2 text-[10px] text-slate-500 font-mono">
                            CUIT: {acc.cuit}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {acc.bankName && <span className="font-semibold text-slate-700">{acc.bankName} • </span>}
                        {acc.alias && <span className="text-indigo-600 font-bold">Alias: {acc.alias}</span>}
                        {acc.cbuCvu && <span className="text-slate-400 ml-2 text-[10px]">CBU: {acc.cbuCvu}</span>}
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold shrink-0">
                      Seleccionar
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Account Detail Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Banco o Billetera</label>
              <input
                type="text"
                placeholder="Ej: Banco Galicia / Mercado Pago"
                value={bankDetails.bankName || ''}
                onChange={(e) => onChangeBankDetails({ ...bankDetails, bankName: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-hidden focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Alias</label>
              <input
                type="text"
                placeholder="Ej: nombre.isf.galicia"
                value={bankDetails.alias || ''}
                onChange={(e) => onChangeBankDetails({ ...bankDetails, alias: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-indigo-900 outline-hidden focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">CBU / CVU (22 dígitos)</label>
              <input
                type="text"
                placeholder="0070123430004567890123"
                value={bankDetails.cbuCvu || ''}
                onChange={(e) => onChangeBankDetails({ ...bankDetails, cbuCvu: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-hidden focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">CUIT / CUIL Titular</label>
              <input
                type="text"
                placeholder="Ej: 20-33445566-7"
                value={bankDetails.cuitCuil || ''}
                onChange={(e) => onChangeBankDetails({ ...bankDetails, cuitCuil: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-hidden focus:border-amber-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Case 2: PAGO A PROVEEDOR Mode */}
      {paymentType === 'PAGO_PROVEEDOR' && (
        <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-3.5 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <div className="p-1 bg-indigo-600 text-white rounded-lg">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-indigo-950">Datos de Cuenta del Proveedor</h4>
                <p className="text-[11px] text-indigo-800">
                  Selecciona de la lista de proveedores o escribe para autocompletar CBU, Alias y CUIT.
                </p>
              </div>
            </div>
          </div>

          {/* Status selector if editable, or badge if read-only */}
          {onChangeReimbursementStatus ? (
            <div className="flex items-center space-x-2 text-xs">
              <span className="font-semibold text-indigo-950">Estado de Pago:</span>
              <select
                value={reimbursementStatus === 'REIMBURSED' ? 'REIMBURSED' : 'PENDING'}
                onChange={(e) => onChangeReimbursementStatus(e.target.value as ReimbursementStatus)}
                className="px-2.5 py-1 rounded-xl border border-indigo-300 bg-white font-bold text-indigo-900 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden cursor-pointer"
              >
                <option value="PENDING">⏳ Pendiente de Pago</option>
                <option value="REIMBURSED">✅ Pagado / Transferido</option>
              </select>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-xs">
              <span className="font-semibold text-indigo-950">Estado de Pago:</span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  reimbursementStatus === 'REIMBURSED'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                }`}
              >
                {reimbursementStatus === 'REIMBURSED' ? '✅ Pagado / Transferido' : '⏳ Pendiente de Pago'}
              </span>
              <span className="text-[10px] text-slate-500 italic">(Gestionable en Gestión Pagos)</span>
            </div>
          )}

          {/* Search/Name input with Autocomplete for Vendors */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-[11px] font-bold text-indigo-950 mb-1">
              Nombre o Razón Social del Proveedor *
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-indigo-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={bankDetails.accountHolder || searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  onChangeBankDetails({ ...bankDetails, accountHolder: val });
                  if (onSelectVendorName) onSelectVendorName(val);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Escribe el nombre del proveedor para autocompletar..."
                className="w-full pl-8.5 pr-4 py-2 rounded-xl border border-indigo-300 bg-white text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-slate-200 z-30 overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto animate-in fade-in">
                <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold uppercase text-slate-500 flex justify-between">
                  <span>Proveedores precargados</span>
                  <span>Click para autocompletar</span>
                </div>
                {filteredSuggestions.map((acc, idx) => (
                  <button
                    key={`prov-sugg-${idx}`}
                    type="button"
                    onClick={() => handleApplySuggestion(acc)}
                    className="w-full text-left px-3.5 py-2 hover:bg-indigo-50/80 transition flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-slate-900 flex items-center">
                        <span>{acc.name}</span>
                        {acc.cuit && (
                          <span className="ml-2 text-[10px] text-slate-500 font-mono">
                            CUIT: {acc.cuit}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {acc.bankName && <span className="font-semibold text-slate-700">{acc.bankName} • </span>}
                        {acc.alias && <span className="text-indigo-600 font-bold">Alias: {acc.alias}</span>}
                        {acc.cbuCvu && <span className="text-slate-400 ml-2 text-[10px]">CBU: {acc.cbuCvu}</span>}
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-semibold shrink-0">
                      Cargar Proveedor
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Account Detail Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Banco del Proveedor</label>
              <input
                type="text"
                placeholder="Ej: Banco Galicia / Santander / BBVA"
                value={bankDetails.bankName || ''}
                onChange={(e) => onChangeBankDetails({ ...bankDetails, bankName: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-hidden focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Tipo de Cuenta</label>
              <select
                value={bankDetails.accountType || 'Indefinido'}
                onChange={(e) => onChangeBankDetails({ ...bankDetails, accountType: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-hidden focus:border-indigo-500 cursor-pointer"
              >
                <option value="Cuenta Corriente">Cuenta Corriente</option>
                <option value="Caja de Ahorro">Caja de Ahorro</option>
                <option value="Indefinido">Indefinido / No especificado</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Alias del Proveedor</label>
              <input
                type="text"
                placeholder="Ej: proveedor.galicia"
                value={bankDetails.alias || ''}
                onChange={(e) => onChangeBankDetails({ ...bankDetails, alias: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-indigo-900 outline-hidden focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">CBU / CVU Proveedor (22 dígitos)</label>
              <input
                type="text"
                placeholder="0720198220000034509123"
                value={bankDetails.cbuCvu || ''}
                onChange={(e) => onChangeBankDetails({ ...bankDetails, cbuCvu: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-hidden focus:border-indigo-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold text-slate-600 block mb-1">CUIT Proveedor</label>
              <input
                type="text"
                placeholder="Ej: 30-71089945-8"
                value={bankDetails.cuitCuil || ''}
                onChange={(e) => onChangeBankDetails({ ...bankDetails, cuitCuil: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Notas / Observaciones del Proveedor */}
          {(onChangeVendorNotes || vendorNotes || matchedVendor?.notes) && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notas / Observaciones del Proveedor {matchedVendor?.name ? `(${matchedVendor.name})` : ''}
              </label>
              {onChangeVendorNotes ? (
                <textarea
                  rows={2}
                  value={vendorNotes !== undefined ? vendorNotes : (matchedVendor?.notes || '')}
                  onChange={(e) => onChangeVendorNotes(e.target.value)}
                  placeholder="Observaciones sobre el proveedor..."
                  className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-hidden bg-slate-50/50 focus:bg-white transition leading-relaxed"
                />
              ) : (
                <div className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 text-xs text-slate-700 bg-slate-50/50 whitespace-pre-wrap leading-relaxed">
                  {vendorNotes !== undefined ? vendorNotes : matchedVendor?.notes}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Case 3: TARJETA CORPORATIVA Mode */}
      {paymentType === 'TARJETA_CORPORATIVA' && (
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-center space-x-3 text-xs animate-in fade-in duration-200">
          <div className="p-2 bg-slate-900 text-white rounded-xl shrink-0">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-slate-900">Abonado con Tarjeta Corporativa</div>
            <div className="text-slate-500 text-[11px]">
              El gasto se imputa directamente al estado de cuenta de la tarjeta corporativa de la organización. No requiere transferencia ni solicitud de reintegro.
            </div>
          </div>
        </div>
      )}

      {/* Case 4: TARJETA DEBITO GALICIA Mode */}
      {paymentType === 'TARJETA_DEBITO_GALICIA' && (
        <div className="p-4 rounded-2xl border border-orange-200 bg-orange-50/60 flex items-center space-x-3 text-xs animate-in fade-in duration-200">
          <div className="p-2 bg-orange-500 text-white rounded-xl shrink-0">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-orange-950">Abonado con Tarjeta Débito Galicia</div>
            <div className="text-orange-900/80 text-[11px]">
              El importe fue debitado directamente de la cuenta bancaria de la organización en Banco Galicia. No requiere transferencia de reintegro.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
