import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, CreditCard, Loader2, Plus, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import { UserBankDetails, UserProfile, Vendor } from '../types';
import { formatCuit, hasPayableBankDetails, matchesSearch } from '../utils/helpers';
import { VendorFormModal } from './VendorFormModal';

interface ReimbursementAccountPickerProps {
  isOpen: boolean;
  reason: 'first-use' | 'profile';
  currentUser: UserProfile;
  vendors: Vendor[];
  currentVendorId?: string | null;
  /** Datos sueltos de versiones anteriores del perfil: solo para sugerir el registro equivalente */
  legacyBank?: UserBankDetails | null;
  onCreateVendor: (vendor: Omit<Vendor, 'id' | 'createdAt'>) => Promise<Vendor | null>;
  onConfirm: (vendor: Vendor) => Promise<boolean>;
  onCancel: () => void;
}

const norm = (v?: string) => (v || '').replace(/\s+/g, '').toLowerCase();

function accountLine(bank?: UserBankDetails) {
  if (!bank) return 'Sin CBU ni alias';
  if (bank.cbuCvu?.trim()) return `CBU: ${bank.cbuCvu.trim()}`;
  if (bank.alias?.trim()) return `Alias: ${bank.alias.trim()}`;
  return 'Sin CBU ni alias';
}

/**
 * Elegir la cuenta para los "Reintegro a mí": se busca un registro del listado de proveedores
 * (o se crea) y se confirma antes de asociarlo al perfil.
 */
export function ReimbursementAccountPicker({
  isOpen,
  reason,
  currentUser,
  vendors,
  currentVendorId,
  legacyBank,
  onCreateVendor,
  onConfirm,
  onCancel,
}: ReimbursementAccountPickerProps) {
  const [step, setStep] = useState<'search' | 'confirm' | 'create'>('search');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep('search');
      setSearch('');
      setSelected(null);
      setBusy(false);
    }
  }, [isOpen]);

  // Registro que coincide con la cuenta que la persona tenía cargada en el perfil (versiones anteriores)
  const suggested = useMemo(() => {
    if (!legacyBank || (!legacyBank.cbuCvu && !legacyBank.alias)) return null;
    return (
      vendors.find(
        (v) =>
          (norm(legacyBank.cbuCvu) && norm(v.bankDetails?.cbuCvu) === norm(legacyBank.cbuCvu)) ||
          (norm(legacyBank.alias) && norm(v.bankDetails?.alias) === norm(legacyBank.alias))
      ) || null
    );
  }, [vendors, legacyBank]);

  const results = useMemo(() => {
    const q = search.trim();
    const list = q
      ? vendors.filter((v) =>
          matchesSearch(
            [v.name, v.cuit, v.bankDetails?.alias, v.bankDetails?.cbuCvu, v.bankDetails?.accountHolder, v.bankDetails?.cuitCuil],
            q
          )
        )
      : vendors.filter((v) => matchesSearch([v.name, v.bankDetails?.accountHolder], currentUser.name));
    const ordered = [...list].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    if (suggested) {
      return [suggested, ...ordered.filter((v) => v.id !== suggested.id)].slice(0, 8);
    }
    return ordered.slice(0, 8);
  }, [vendors, search, suggested, currentUser.name]);

  if (!isOpen) return null;

  if (step === 'create') {
    return (
      <VendorFormModal
        isOpen
        existingVendors={vendors}
        title="Crear mi registro de cuenta"
        subtitle="Se agrega al listado de proveedores y queda asociado a tu perfil para reintegros"
        suggestedName={currentUser.name}
        initialData={{
          id: '',
          name: currentUser.name,
          cuit: legacyBank?.cuitCuil || '',
          bankDetails: {
            accountHolder: currentUser.name,
            bankName: legacyBank?.bankName || '',
            accountType: legacyBank?.accountType || 'Indefinido',
            cbuCvu: legacyBank?.cbuCvu || '',
            alias: legacyBank?.alias || '',
            cuitCuil: legacyBank?.cuitCuil || '',
          },
        }}
        onClose={() => setStep('search')}
        onSave={async (data) => {
          const created = await onCreateVendor(data);
          if (!created) throw new Error('No se pudo crear el registro.');
          setSelected(created);
          setStep('confirm');
        }}
      />
    );
  }

  const isFirstUse = reason === 'first-use';

  const content = (
    <div className="fixed inset-0 z-[70] bg-slate-950/70 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 flex items-center justify-center shrink-0">
              <CreditCard className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">
                {step === 'confirm' ? 'Confirmá tu cuenta para reintegros' : 'Elegí tu cuenta para reintegros'}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
                Los «Reintegro a mí» se transfieren a un registro del listado de proveedores.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'search' ? (
          <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
            {isFirstUse && (
              <p className="text-xs text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-2xl px-3 py-2.5">
                Es tu primer «Reintegro a mí». Buscá tu registro (por nombre, CUIT, alias o CBU) o crealo si no existe.
                Lo vas a confirmar en el paso siguiente y después se usa solo en tus próximos reintegros.
              </p>
            )}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Buscar por nombre, CUIT, alias o CBU (ej: ${currentUser.name.split(' ')[0] || 'tu nombre'})`}
                className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-hidden"
              />
            </div>
            {!search.trim() && (
              <p className="text-[11px] text-slate-500 -mt-1">Registros que coinciden con tu nombre:</p>
            )}

            <div className="space-y-1.5">
              {results.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  No encontramos registros{search.trim() ? ` para «${search.trim()}»` : ' con tu nombre'}. Podés crear el tuyo.
                </p>
              ) : (
                results.map((v) => {
                  const payable = hasPayableBankDetails(v.bankDetails);
                  const isCurrent = v.id === currentVendorId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={!payable}
                      onClick={() => {
                        setSelected(v);
                        setStep('confirm');
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-2xl border flex items-center gap-3 transition ${
                        payable
                          ? 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 cursor-pointer'
                          : 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-purple-700 text-white flex items-center justify-center shrink-0">
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                          <span className="truncate">
                            {v.name}
                            {v.cuit ? ` (${formatCuit(v.cuit)})` : ''}
                          </span>
                          {suggested?.id === v.id && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 text-[9.5px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1 py-px">
                              <Sparkles className="w-2.5 h-2.5" /> Coincide con tu perfil anterior
                            </span>
                          )}
                          {isCurrent && (
                            <span className="shrink-0 text-[9.5px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-1 py-px">
                              Asociada ahora
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">
                          {payable ? accountLine(v.bankDetails) : 'Sin CBU ni alias: no se puede usar para transferir'}
                          {payable && v.bankDetails?.bankName ? ` · ${v.bankDetails.bankName}` : ''}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={() => setStep('create')}
              className="w-full px-3 py-2.5 rounded-2xl border border-dashed border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> No está mi registro: crearlo
            </button>
          </div>
        ) : (
          selected && (
            <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <tbody>
                    {[
                      ['Nombre', selected.name],
                      ['CUIT', selected.cuit ? formatCuit(selected.cuit) : ''],
                      ['Banco', selected.bankDetails?.bankName || ''],
                      ['CBU / CVU', selected.bankDetails?.cbuCvu || ''],
                      ['Alias', selected.bankDetails?.alias || ''],
                    ]
                      .filter(([, value]) => value)
                      .map(([label, value]) => (
                        <tr key={label} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 text-slate-500 font-semibold bg-slate-50 w-[35%]">{label}</td>
                          <td className="px-3 py-2 font-bold text-slate-900 break-all">{value}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-amber-950 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2.5 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                <span>
                  <strong>¿Estás seguro de que esta es tu cuenta?</strong> Va a quedar asociada a tu perfil y se usará
                  automáticamente en tus próximos «Reintegro a mí». La podés cambiar después desde tu perfil.
                </span>
              </div>
            </div>
          )
        )}

        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          {step === 'confirm' ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep('search')}
                className="px-3.5 py-2 rounded-2xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white cursor-pointer flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Volver
              </button>
              <button
                type="button"
                disabled={busy || !selected}
                onClick={async () => {
                  if (!selected) return;
                  setBusy(true);
                  try {
                    await onConfirm(selected);
                  } finally {
                    setBusy(false);
                  }
                }}
                className="px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Sí, asociar a mi perfil
              </button>
            </>
          ) : (
            <>
              <span className="text-[11px] text-slate-500">
                {isFirstUse ? 'Si cancelás, el comprobante vuelve al tipo de pago anterior.' : ''}
              </span>
              <button
                type="button"
                onClick={onCancel}
                className="px-3.5 py-2 rounded-2xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white cursor-pointer"
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
