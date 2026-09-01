import React, { useState, useEffect } from 'react';
import { User, Shield, Check, CreditCard, Mail, CheckCircle2, Server, Lock, LogOut } from 'lucide-react';
import { UserProfile, UserBankDetails } from '../types';
import { getStoredUserBankDetails, saveStoredUserBankDetails } from '../utils/auth';
import { checkCentralizedDriveStatus, notifyBankDetailsChange } from '../utils/googleWorkspace';

interface AuthProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onUpdateUser: (user: UserProfile) => void;
  onSwitchUser: (preset: 'admin' | 'user') => void;
  onLogout?: () => void;
  canSwitchRole?: boolean;
}

export function AuthProfileModal({
  isOpen,
  onClose,
  currentUser,
  onUpdateUser,
  onSwitchUser,
  onLogout,
  canSwitchRole = false,
}: AuthProfileModalProps) {
  const storedBank = getStoredUserBankDetails(currentUser.email);
  const [bankDetails, setBankDetails] = useState<UserBankDetails>({
    bankName: storedBank?.bankName || currentUser.bankDetails?.bankName || '',
    accountType: storedBank?.accountType || currentUser.bankDetails?.accountType || 'Caja de Ahorro',
    cbuCvu: storedBank?.cbuCvu || currentUser.bankDetails?.cbuCvu || '',
    alias: storedBank?.alias || currentUser.bankDetails?.alias || '',
    cuitCuil: storedBank?.cuitCuil || currentUser.bankDetails?.cuitCuil || '',
    accountHolder: storedBank?.accountHolder || currentUser.bankDetails?.accountHolder || currentUser.name || '',
  });

  const [savedFeedback, setSavedFeedback] = useState(false);
  const [centralDriveStatus, setCentralDriveStatus] = useState<{ configured: boolean; source: string | null } | null>(null);

  useEffect(() => {
    const bank = getStoredUserBankDetails(currentUser.email);
    setBankDetails({
      bankName: bank?.bankName || currentUser.bankDetails?.bankName || '',
      accountType: bank?.accountType || currentUser.bankDetails?.accountType || 'Caja de Ahorro',
      cbuCvu: bank?.cbuCvu || currentUser.bankDetails?.cbuCvu || '',
      alias: bank?.alias || currentUser.bankDetails?.alias || '',
      cuitCuil: bank?.cuitCuil || currentUser.bankDetails?.cuitCuil || '',
      accountHolder: bank?.accountHolder || currentUser.bankDetails?.accountHolder || currentUser.name || '',
    });
  }, [currentUser, isOpen]);

  useEffect(() => {
    checkCentralizedDriveStatus().then((status) => {
      setCentralDriveStatus(status);
    });
  }, []);

  if (!isOpen) return null;

  const handleSaveBank = (e: React.FormEvent) => {
    e.preventDefault();
    saveStoredUserBankDetails(currentUser.email, bankDetails);
    onUpdateUser({
      ...currentUser,
      bankDetails,
    });
    notifyBankDetailsChange({
      updatedBy: { email: currentUser.email, name: currentUser.name },
      targetType: 'user',
      targetName: `Usuario ${currentUser.name} (${currentUser.email})`,
      bankDetails,
    }).catch((err) => console.warn('Bank details notification warning:', err));
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold text-base shadow-xs overflow-hidden">
              {currentUser.picture ? (
                <img
                  src={currentUser.picture}
                  alt={currentUser.name}
                  className="w-10 h-10 rounded-2xl object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                currentUser.name.charAt(0)
              )}
            </div>
            <div>
              <h3 className="font-bold text-base text-white">{currentUser.name}</h3>
              <p className="text-xs text-indigo-300 flex items-center">
                <Mail className="w-3 h-3 mr-1" />
                {currentUser.email}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Profile Details & Bank Settings */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          
          {/* Identity Google Badge (Immutable, certified from Google OAuth) */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                <Lock className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                Identidad de Google Verificada
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                <CheckCircle2 className="w-3 h-3" />
                Autenticado
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nombre y Apellido</span>
                <span className="text-xs font-bold text-slate-900 mt-0.5 block">{currentUser.name}</span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Correo Electrónico</span>
                <span className="text-xs font-bold text-slate-900 mt-0.5 block truncate" title={currentUser.email}>
                  {currentUser.email}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
              <span>Datos obtenidos de Google. No se pueden modificar manualmente.</span>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Cerrar sesión / Cambiar</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Role and Switcher */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rol en la Organización</div>
              <div className="text-sm font-extrabold text-slate-900 flex items-center space-x-1.5 pt-0.5">
                {currentUser.role === 'admin' ? (
                  <>
                    <Shield className="w-4 h-4 text-indigo-600" />
                    <span>Administrador / Finanzas</span>
                  </>
                ) : (
                  <>
                    <User className="w-4 h-4 text-slate-600" />
                    <span>Colaborador / Rendidor</span>
                  </>
                )}
              </div>
            </div>

            {/* Quick role toggle for authorized admins */}
            {canSwitchRole && (
              <div className="flex space-x-1">
                <button
                  type="button"
                  onClick={() => onSwitchUser('admin')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                    currentUser.role === 'admin'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchUser('user')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                    currentUser.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Colaborador
                </button>
              </div>
            )}
          </div>

          {/* Centralized Server Google Drive & Gmail Dispatch Status */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-white border border-emerald-200 flex items-center justify-center shadow-xs mt-0.5">
                  <Server className="w-4 h-4 text-emerald-700" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-slate-900">Despacho Central (Drive & Gmail)</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Cuenta Maestra
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    {centralDriveStatus?.configured ? (
                      <span className="text-emerald-700 font-medium">
                        Activo ({centralDriveStatus.source}). Todos los correos y subidas a Drive se realizan automáticamente desde la cuenta central configurada en el servidor.
                      </span>
                    ) : (
                      <span>
                        Todos los correos institucionales y comprobantes se centralizan en la cuenta maestra configurada en el servidor (OAuth / Service Account).
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {centralDriveStatus?.configured ? (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                  <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                  Activo
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                  Configurable en .env
                </span>
              )}
            </div>
          </div>

          {/* Persistent Bank Details (Used for autocomplete in reimbursements) */}
          <form onSubmit={handleSaveBank} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                <CreditCard className="w-4 h-4 mr-1.5 text-indigo-600" />
                Mis Datos Bancarios para Reintegros
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Auto-completado en facturas</span>
            </div>

            {savedFeedback && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-900 flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Datos bancarios guardados en tu perfil con éxito.</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Banco / Billetera</label>
                <input
                  type="text"
                  value={bankDetails.bankName}
                  onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                  placeholder="Ej: Galicia / Mercado Pago"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Tipo de Cuenta</label>
                <select
                  value={bankDetails.accountType}
                  onChange={(e: any) => setBankDetails({ ...bankDetails, accountType: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden cursor-pointer"
                >
                  <option value="Caja de Ahorro">Caja de Ahorro</option>
                  <option value="Cuenta Corriente">Cuenta Corriente</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Alias</label>
                <input
                  type="text"
                  value={bankDetails.alias}
                  onChange={(e) => setBankDetails({ ...bankDetails, alias: e.target.value })}
                  placeholder="Ej: nombre.isf.mp"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden font-bold text-indigo-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">CUIT / CUIL</label>
                <input
                  type="text"
                  value={bankDetails.cuitCuil}
                  onChange={(e) => setBankDetails({ ...bankDetails, cuitCuil: e.target.value })}
                  placeholder="Ej: 20-33445566-7"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">CBU / CVU (22 dígitos)</label>
              <input
                type="text"
                value={bankDetails.cbuCvu}
                onChange={(e) => setBankDetails({ ...bankDetails, cbuCvu: e.target.value })}
                placeholder="0070123430004567890123"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Titular de la Cuenta</label>
              <input
                type="text"
                value={bankDetails.accountHolder}
                onChange={(e) => setBankDetails({ ...bankDetails, accountHolder: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-2xl transition cursor-pointer shadow-xs"
            >
              Guardar Datos de Destinatario
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Desconectar cuenta</span>
            </button>
          ) : <div />}
          
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl cursor-pointer transition shadow-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
