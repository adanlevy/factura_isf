import React from 'react';
import {
  Receipt,
  Plus,
  Sparkles,
  FolderKanban,
  Shield,
  Building2,
  CreditCard,
  User,
  Users,
  CloudCheck,
  Cloud,
  RefreshCw,
  Server,
} from 'lucide-react';
import { UserProfile } from '../types';
import { FacturaAppIcon } from './FacturaIcon';

export type NavigationTab = 'expenses' | 'admin_movements' | 'vendors' | 'cost_centers' | 'admin_users' | 'system';

interface NavbarProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  onOpenNewModal: () => void;
  onOpenAuthProfile: () => void;
  onLogout?: () => void;
  currentUser: UserProfile;
  expensesCount: number;
  vendorsCount?: number;
  pendingReimbursementAmount?: number;
  isCloudSyncing?: boolean;
}

export function Navbar({
  activeTab,
  setActiveTab,
  onOpenNewModal,
  onOpenAuthProfile,
  onLogout,
  currentUser,
  expensesCount,
  vendorsCount = 0,
  pendingReimbursementAmount = 0,
  isCloudSyncing = false,
}: NavbarProps) {
  const isAccountingProfile = currentUser.role === 'admin';

  return (
    <header id="main-header" className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18">
          
          {/* Brand & Logo with Argentine Factura Icon */}
          <div className="flex items-center space-x-3">
            <FacturaAppIcon className="w-11 h-11" showBadge={false} interactive={true} />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-black text-slate-900 text-xl tracking-tight">Factura</span>
                {/* Cloud Sync Status Indicator */}
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    isCloudSyncing
                      ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                  title={
                    isCloudSyncing
                      ? 'Sincronizando con la nube de ISF...'
                      : 'Nube ISF conectada: datos compartidos en tiempo real entre todos los usuarios y dispositivos'
                  }
                >
                  <Cloud className={`w-3 h-3 mr-1 ${isCloudSyncing ? 'animate-spin text-amber-600' : 'text-emerald-600'}`} />
                  <span className="hidden xs:inline">{isCloudSyncing ? 'Sincronizando...' : 'Nube Conectada'}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Rendición de comprobantes y control de centros de costos
              </p>
            </div>
          </div>

          {/* Right Action & User Profile Pill */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* User Account / Profile Button */}
            <div className="flex items-center gap-1.5">
              <button
                id="btn-user-profile"
                onClick={onOpenAuthProfile}
                className="flex items-center space-x-2 p-1.5 sm:px-3 sm:py-2 rounded-2xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100 transition cursor-pointer"
                title="Mi perfil y datos bancarios (Click para editar)"
              >
                <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                  {currentUser.picture ? (
                    <img
                      src={currentUser.picture}
                      alt={currentUser.name}
                      className="w-7 h-7 rounded-xl object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    currentUser.name.charAt(0)
                  )}
                </div>
                <div className="hidden md:block text-left text-xs">
                  <div className="font-bold text-slate-800 leading-tight">{currentUser.name}</div>
                  <div className="text-[10px] text-slate-500 flex items-center">
                    {isAccountingProfile ? (
                      <span className="text-indigo-600 font-semibold flex items-center">
                        <Shield className="w-2.5 h-2.5 mr-0.5" /> Perfil Contable
                      </span>
                    ) : (
                      <span>Colaborador</span>
                    )}
                  </div>
                </div>
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-2.5 py-2 text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition border border-transparent hover:border-rose-200 cursor-pointer"
                  title="Cambiar de usuario o cerrar sesión"
                >
                  Salir
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Strict Navigation Menu in requested Order:
            1. Mis Gastos (All users, Default)
            2. Gestión Pagos (Accounting profile only)
            3. Proveedores (Accounting profile only)
            4. Categorías (Accounting profile only)
            5. Centro de Costos (Accounting profile only)
        */}
        <div className="flex space-x-1 sm:space-x-2 border-t border-slate-100 overflow-x-auto py-2">
          
          {/* 1. Mis Gastos */}
          <button
            id="nav-tab-expenses"
            onClick={() => setActiveTab('expenses')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center space-x-2 ${
              activeTab === 'expenses'
                ? 'bg-indigo-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Mis Gastos</span>
          </button>

          {/* 2. Gestión Pagos (Accounting profile only) */}
          {isAccountingProfile && (
            <button
              id="nav-tab-admin-movements"
              onClick={() => setActiveTab('admin_movements')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center space-x-2 ${
                activeTab === 'admin_movements'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Gestión Pagos</span>
              {pendingReimbursementAmount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 ml-0.5 animate-pulse" />
              )}
            </button>
          )}

          {/* 3. Proveedores (Accounting profile only) */}
          {isAccountingProfile && (
            <button
              id="nav-tab-vendors"
              onClick={() => setActiveTab('vendors')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center space-x-2 ${
                activeTab === 'vendors'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Proveedores</span>
            </button>
          )}

          {/* 4. Centro de Costos (Accounting profile only) */}
          {isAccountingProfile && (
            <button
              id="nav-tab-cost-centers"
              onClick={() => setActiveTab('cost_centers')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center space-x-2 ${
                activeTab === 'cost_centers'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FolderKanban className="w-4 h-4" />
              <span>Centro de Costos</span>
            </button>
          )}

          {/* 6. Usuarios y Administradores (Accounting profile only) */}
          {isAccountingProfile && (
            <button
              id="nav-tab-admin-users"
              onClick={() => setActiveTab('admin_users')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center space-x-2 ${
                activeTab === 'admin_users'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Usuarios / Roles</span>
            </button>
          )}

          {/* 7. Sistema & Métricas Operativas (Accounting profile only) */}
          {isAccountingProfile && (
            <button
              id="nav-tab-system"
              onClick={() => setActiveTab('system')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center space-x-2 ${
                activeTab === 'system'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Server className="w-4 h-4" />
              <span>Sistema</span>
            </button>
          )}

        </div>
      </div>
    </header>
  );
}
