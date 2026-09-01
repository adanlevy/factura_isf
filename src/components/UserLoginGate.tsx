import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  AlertCircle,
  Copy,
  Check,
  Settings,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import { UserProfile } from '../types';
import { FacturaAppIcon } from './FacturaIcon';
import { requestGoogleWorkspaceAuth, getGoogleClientId, saveGoogleClientId } from '../utils/googleWorkspace';
import { resolveUserRoleFromEmail, saveCentralUser } from '../utils/cloudSync';

interface UserLoginGateProps {
  onLogin: (user: UserProfile) => void;
}

export function UserLoginGate({ onLogin }: UserLoginGateProps) {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOriginMismatch, setIsOriginMismatch] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [copiedClientId, setCopiedClientId] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [clientIdInput, setClientIdInput] = useState(() => getGoogleClientId());
  const [savedClientIdMsg, setSavedClientIdMsg] = useState(false);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const currentClientId = getGoogleClientId();

  // Recover from closed or cancelled Google popup
  useEffect(() => {
    const handleWindowFocus = () => {
      if (isGoogleLoading) {
        // Give a brief moment for any pending callback, then release the loading/disabled state
        const timer = setTimeout(() => {
          setIsGoogleLoading(false);
        }, 1200);
        return () => clearTimeout(timer);
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isGoogleLoading]);

  const handleCopyOrigin = () => {
    if (navigator?.clipboard && currentOrigin) {
      navigator.clipboard.writeText(currentOrigin);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 3000);
    }
  };

  const handleCopyClientId = () => {
    if (navigator?.clipboard && currentClientId) {
      navigator.clipboard.writeText(currentClientId);
      setCopiedClientId(true);
      setTimeout(() => setCopiedClientId(false), 3000);
    }
  };

  const handleSaveCustomClientId = (e: React.FormEvent) => {
    e.preventDefault();
    saveGoogleClientId(clientIdInput.trim());
    setSavedClientIdMsg(true);
    setTimeout(() => setSavedClientIdMsg(false), 3000);
  };

  const handleResetClientId = () => {
    saveGoogleClientId('');
    setClientIdInput(getGoogleClientId());
    setSavedClientIdMsg(true);
    setTimeout(() => setSavedClientIdMsg(false), 3000);
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setErrorMsg(null);
    setIsOriginMismatch(false);

    try {
      const res = await requestGoogleWorkspaceAuth();
      if (res.user && res.user.email) {
        const userEmail = res.user.email.toLowerCase().trim();
        const detectedRole = await resolveUserRoleFromEmail(userEmail);

        if (!detectedRole) {
          setErrorMsg(
            `Acceso denegado: El correo "${userEmail}" no está habilitado como colaborador o administrador. Por favor, solicita a un administrador que te agregue en el panel de gestión de usuarios.`
          );
          setIsGoogleLoading(false);
          return;
        }

        const displayName = res.user.name || userEmail.split('@')[0];

        // Register/update user in Firestore since they are authorized
        saveCentralUser({
          email: userEmail,
          name: displayName,
          picture: res.user.picture,
          role: detectedRole,
        }).catch(console.warn);

        onLogin({
          name: displayName,
          email: userEmail,
          picture: res.user.picture,
          role: detectedRole,
        });
      } else {
        setErrorMsg('No se pudo obtener la identidad de Google. Por favor, selecciona tu cuenta para continuar.');
      }
    } catch (err: any) {
      console.warn('Google login notice:', err);
      const rawError = (err?.message || '').toLowerCase();
      const isMismatch =
        rawError.includes('origin_mismatch') ||
        rawError.includes('400') ||
        rawError.includes('origen de javascript') ||
        rawError.includes('idpiframe_initialization_failed');

      if (isMismatch) {
        setIsOriginMismatch(true);
        setErrorMsg(
          'Error 400: origin_mismatch. El dominio de este navegador no está en los "Orígenes de JavaScript autorizados" en Google Cloud Console. Puedes registrar el origen o reintentar.'
        );
      } else {
        setErrorMsg(err.message || 'Error al conectar con Google. Por favor intenta nuevamente.');
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 flex items-center justify-center p-4 sm:p-6">
      {/* Ambient background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-25">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-500 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-500 rounded-full blur-3xl" />
      </div>

      <div className="relative bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="px-6 pt-8 pb-6 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white text-center">
          <div className="inline-flex items-center justify-center p-3.5 bg-white/10 rounded-2xl mb-3.5 shadow-inner ring-1 ring-white/20">
            <FacturaAppIcon className="w-12 h-12" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Factura ISF</h1>
          <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto">
            Ingeniería Sin Fronteras Argentina · Sistema de Comprobantes
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>

              {isOriginMismatch && (
                <div className="mt-2 p-2.5 bg-white rounded-xl border border-rose-200 text-[11px] text-slate-700 space-y-1.5">
                  <p className="text-slate-600">
                    Si el origen aún se está propagando en Google, puedes copiar la URL o volver a intentar:
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={currentOrigin}
                      className="flex-1 px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg font-mono text-[10.5px] text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={handleCopyOrigin}
                      className="px-2.5 py-1 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-bold text-[10.5px] transition flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedOrigin ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedOrigin ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-5">
            <div className="text-center space-y-2">
              <p className="text-xs text-slate-600 leading-relaxed">
                Inicia sesión con tu cuenta corporativa o institucional de Google habilitada para registrar y gestionar tus comprobantes.
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Identidad de Google verificada por el sistema</span>
              </div>
            </div>

            {/* Google Sign In Button */}
            <div>
              <button
                type="button"
                id="google-signin-btn"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading}
                className="w-full py-3.5 px-5 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-bold text-xs rounded-2xl border-2 border-slate-200 hover:border-slate-300 shadow-xs transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98 disabled:opacity-85"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="text-sm font-semibold text-slate-900">
                  {isGoogleLoading ? 'Verificando con Google...' : 'Ingresar con cuenta de Google'}
                </span>
              </button>
            </div>

            {/* Diagnostics & Config toggle */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowConfig((prev) => !prev)}
                className="w-full py-1.5 px-3 text-[11px] font-medium text-slate-500 hover:text-slate-700 flex items-center justify-between rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  <span>Verificar Client ID y Origen OAuth</span>
                </span>
                {showConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showConfig && (
                <div className="mt-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs animate-in fade-in duration-150">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      1. Origen de JavaScript en Cloud Console:
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={currentOrigin}
                        className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-mono text-[10.5px] text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={handleCopyOrigin}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-[10.5px] transition flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedOrigin ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedOrigin ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      2. Client ID de Google OAuth activo:
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={clientIdInput}
                        onChange={(e) => setClientIdInput(e.target.value)}
                        placeholder="ej. 50454054524-...apps.googleusercontent.com"
                        className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-mono text-[10.5px] text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={handleCopyClientId}
                        className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-[10.5px] transition flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedClientId ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedClientId ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 gap-2">
                    <button
                      type="button"
                      onClick={handleSaveCustomClientId}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-xl transition cursor-pointer"
                    >
                      Guardar Client ID
                    </button>
                    <button
                      type="button"
                      onClick={handleResetClientId}
                      className="px-2.5 py-1.5 text-slate-500 hover:text-slate-700 text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Restablecer</span>
                    </button>
                  </div>

                  {savedClientIdMsg && (
                    <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                      <Check className="w-3.5 h-3.5" />
                      <span>Client ID guardado correctamente. Prueba ingresar nuevamente.</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="pt-1 text-center text-[10px] text-slate-400">
            ISF Argentina · Sincronización directa con Google Drive & Firestore
          </div>
        </div>
      </div>
    </div>
  );
}
