import React, { useState, useMemo } from 'react';
import {
  History,
  Search,
  Trash2,
  RefreshCw,
  Filter,
  Download,
  Calendar,
  User,
  Building2,
  FolderKanban,
  FileText,
  CreditCard,
  Shield,
  Layers,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { AuditLogEntry, AuditLogEntityType, AuditLogAction, UserProfile } from '../types';
import { formatDate, matchesSearch } from '../utils/helpers';

interface AuditLogsViewProps {
  logs: AuditLogEntry[];
  currentUser: UserProfile;
  isLoading?: boolean;
  onRefreshLogs?: () => Promise<void> | void;
  onClearLogs?: () => Promise<boolean> | boolean;
}

export function AuditLogsView({
  logs,
  currentUser,
  isLoading = false,
  onRefreshLogs,
  onClearLogs,
}: AuditLogsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntityType, setSelectedEntityType] = useState<string>('ALL');
  const [selectedActionType, setSelectedActionType] = useState<string>('ALL');
  const [timeFilter, setTimeFilter] = useState<'ALL' | 'TODAY' | '7DAYS' | '30DAYS'>('ALL');
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Toggle log expansion
  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Expand / collapse all
  const toggleExpandAll = () => {
    if (expandedLogIds.size > 0) {
      setExpandedLogIds(new Set());
    } else {
      const allWithChanges = logs.filter((l) => l.changes && l.changes.length > 0).map((l) => l.id);
      setExpandedLogIds(new Set(allWithChanges));
    }
  };

  // Filter logs
  const filteredLogs = useMemo(() => {
    let list = [...logs];

    // 1. Time range filter
    if (timeFilter !== 'ALL') {
      const now = new Date().getTime();
      const oneDay = 24 * 60 * 60 * 1000;
      if (timeFilter === 'TODAY') {
        const todayStr = new Date().toISOString().slice(0, 10);
        list = list.filter((l) => l.timestamp.startsWith(todayStr));
      } else if (timeFilter === '7DAYS') {
        list = list.filter((l) => now - new Date(l.timestamp).getTime() <= 7 * oneDay);
      } else if (timeFilter === '30DAYS') {
        list = list.filter((l) => now - new Date(l.timestamp).getTime() <= 30 * oneDay);
      }
    }

    // 2. Entity filter
    if (selectedEntityType !== 'ALL') {
      list = list.filter((l) => l.entityType === selectedEntityType);
    }

    // 3. Action filter
    if (selectedActionType !== 'ALL') {
      list = list.filter((l) => l.action === selectedActionType);
    }

    // 4. Keyword search
    if (searchTerm.trim()) {
      list = list.filter((l) => {
        const changeTexts = l.changes
          ? l.changes.map((c) => `${c.fieldLabel} ${c.oldValue} ${c.newValue}`).join(' ')
          : '';
        return matchesSearch(
          [
            l.actionLabel,
            l.entityName,
            l.summary,
            l.userName,
            l.userEmail,
            l.action,
            l.entityType,
            changeTexts,
          ],
          searchTerm
        );
      });
    }

    return list;
  }, [logs, timeFilter, selectedEntityType, selectedActionType, searchTerm]);

  // Quick stats
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCount = logs.filter((l) => l.timestamp.startsWith(todayStr)).length;
    const vendorChanges = logs.filter((l) => l.entityType === 'vendor').length;
    const ccChanges = logs.filter((l) => l.entityType === 'cost_center').length;
    const expenseChanges = logs.filter((l) => l.entityType === 'expense').length;

    return {
      total: logs.length,
      today: todayCount,
      vendors: vendorChanges,
      costCenters: ccChanges,
      expenses: expenseChanges,
    };
  }, [logs]);

  const handleRefresh = async () => {
    if (!onRefreshLogs) return;
    setIsRefreshing(true);
    try {
      await onRefreshLogs();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConfirmClear = async () => {
    if (!onClearLogs) return;
    setIsClearing(true);
    try {
      await onClearLogs();
      setIsClearModalOpen(false);
    } catch (e) {
      console.error('Error clearing audit logs:', e);
    } finally {
      setIsClearing(false);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredLogs.length === 0) {
      alert('No hay registros de cambios para exportar.');
      return;
    }

    const headers = [
      'Fecha y Hora',
      'Usuario',
      'Email',
      'Acción',
      'Módulo/Entidad',
      'Elemento Modificado',
      'Resumen',
      'Detalle de Cambios',
    ];

    const rows = filteredLogs.map((l) => {
      const dateFormatted = new Date(l.timestamp).toLocaleString('es-AR');
      const changesStr = l.changes
        ? l.changes.map((c) => `[${c.fieldLabel}: Antes="${c.oldValue}" -> Ahora="${c.newValue}"]`).join(' | ')
        : '';

      return [
        `"${dateFormatted}"`,
        `"${l.userName || ''}"`,
        `"${l.userEmail || ''}"`,
        `"${l.actionLabel || l.action}"`,
        `"${l.entityType}"`,
        `"${(l.entityName || '').replace(/"/g, '""')}"`,
        `"${(l.summary || '').replace(/"/g, '""')}"`,
        `"${changesStr.replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Auditoria_Cambios_FacturaISF_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getEntityIcon = (type: AuditLogEntityType) => {
    switch (type) {
      case 'cost_center':
        return <FolderKanban className="w-4 h-4 text-emerald-600" />;
      case 'vendor':
        return <Building2 className="w-4 h-4 text-blue-600" />;
      case 'expense':
        return <FileText className="w-4 h-4 text-indigo-600" />;
      case 'user':
        return <Shield className="w-4 h-4 text-purple-600" />;
      case 'category':
        return <Layers className="w-4 h-4 text-amber-600" />;
      case 'system':
      default:
        return <History className="w-4 h-4 text-slate-600" />;
    }
  };

  const getActionBadgeColor = (action: AuditLogAction) => {
    switch (action) {
      case 'CREATE':
      case 'BATCH_CREATE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'UPDATE':
      case 'BATCH_UPDATE':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'DELETE':
      case 'BATCH_DELETE':
      case 'SYSTEM_CLEAR_LOGS':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'SETTLE_PAYMENT':
        return 'bg-teal-50 text-teal-800 border-teal-200';
      case 'REVERT_PAYMENT':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'REPLACE_RECEIPT':
      case 'WITHHOLDING_CERT':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* 1. Header & Summary Stats Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <History className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-black text-slate-900">Log de Cambios y Auditoría</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  En tiempo real
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Historial centralizado de modificaciones en Centros de Costos, Proveedores, Comprobantes y Usuarios
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons: Refresh, Export, and Clear/Reset Logs */}
        <div className="flex items-center flex-wrap gap-2 w-full lg:w-auto">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="px-3.5 py-2 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Recargar logs desde Firestore"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{isRefreshing ? 'Actualizando...' : 'Refrescar'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Exportar a CSV / Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar CSV</span>
          </button>

          {currentUser.role === 'admin' && (
            <button
              type="button"
              id="btn-clear-audit-logs"
              onClick={() => setIsClearModalOpen(true)}
              className="px-3.5 py-2 rounded-2xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Inicializar y vaciar historial de cambios en Firestore"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Inicializar y Borrar Log</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Quick Stat Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-400">Total Eventos</div>
          <div className="text-xl font-black text-slate-900 mt-0.5">{stats.total}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Hoy</span>
          </div>
          <div className="text-xl font-black text-emerald-700 mt-0.5">{stats.today}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-blue-600 flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            <span>Proveedores</span>
          </div>
          <div className="text-xl font-black text-blue-700 mt-0.5">{stats.vendors}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
            <FolderKanban className="w-3 h-3" />
            <span>Centros Costo</span>
          </div>
          <div className="text-xl font-black text-emerald-700 mt-0.5">{stats.costCenters}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold text-indigo-600 flex items-center gap-1">
            <FileText className="w-3 h-3" />
            <span>Comprobantes</span>
          </div>
          <div className="text-xl font-black text-indigo-700 mt-0.5">{stats.expenses}</div>
        </div>
      </div>

      {/* 3. Filters & Search Bar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search box */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por usuario, proveedor, centro de costos, valor..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-hidden transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Time Preset Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl text-xs font-medium w-full md:w-auto overflow-x-auto">
            <button
              type="button"
              onClick={() => setTimeFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap ${
                timeFilter === 'ALL' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos los períodos
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('TODAY')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap ${
                timeFilter === 'TODAY' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('7DAYS')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap ${
                timeFilter === '7DAYS' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Últimos 7 días
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('30DAYS')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap ${
                timeFilter === '30DAYS' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Últimos 30 días
            </button>
          </div>
        </div>

        {/* Entity Type Filter Tabs */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Módulo:</span>
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'cost_center', label: 'Centro de Costos' },
              { id: 'vendor', label: 'Proveedores' },
              { id: 'expense', label: 'Comprobantes' },
              { id: 'user', label: 'Usuarios / Roles' },
              { id: 'category', label: 'Categorías' },
              { id: 'system', label: 'Sistema' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedEntityType(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  selectedEntityType === tab.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={toggleExpandAll}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-bold transition cursor-pointer flex items-center gap-1"
          >
            {expandedLogIds.size > 0 ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Colapsar todos los detalles</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Expandir todos los detalles</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4. Logs Timeline / Table View */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <History className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">No hay registros de auditoría que coincidan</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {logs.length === 0
                ? 'El registro de cambios se encuentra vacío. Toda acción que realices en proveedores, centros de costos o comprobantes se irá guardando aquí.'
                : 'Intenta ajustando los filtros de búsqueda o el rango de fechas.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const hasChanges = Boolean(log.changes && log.changes.length > 0);
              const isExpanded = expandedLogIds.has(log.id);
              const dateObj = new Date(log.timestamp);
              const formattedDate = dateObj.toLocaleDateString('es-AR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });
              const formattedTime = dateObj.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div
                  key={log.id}
                  className={`p-4 sm:p-5 transition-colors ${
                    isExpanded ? 'bg-indigo-50/20' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    
                    {/* Left: Icon + Action Badge + Entity Name */}
                    <div className="flex items-start space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                        {getEntityIcon(log.entityType)}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center flex-wrap gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getActionBadgeColor(
                              log.action
                            )}`}
                          >
                            {log.actionLabel || log.action}
                          </span>
                          
                          <span className="font-extrabold text-sm text-slate-900">
                            {log.entityName}
                          </span>
                        </div>

                        {/* Summary description */}
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {log.summary}
                        </p>
                      </div>
                    </div>

                    {/* Right: Timestamp & User Pill */}
                    <div className="flex sm:flex-col items-end justify-between sm:justify-center w-full sm:w-auto shrink-0 text-right space-y-1">
                      <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-medium">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formattedDate} {formattedTime}</span>
                      </div>

                      <div className="flex items-center space-x-1.5 text-xs text-slate-700 bg-slate-100 px-2.5 py-1 rounded-xl">
                        <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[9px]">
                          {(log.userName || log.userEmail || 'U').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold">{log.userName || log.userEmail}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Changes Breakdown */}
                  {hasChanges && (
                    <div className="mt-3 pl-0 sm:pl-12">
                      <button
                        type="button"
                        onClick={() => toggleExpand(log.id)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold transition flex items-center gap-1 cursor-pointer select-none py-1"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            <span>Ocultar {log.changes?.length} cambio(s) detallado(s)</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span>Ver {log.changes?.length} cambio(s) detallado(s)</span>
                          </>
                        )}
                      </button>

                      {isExpanded && log.changes && (
                        <div className="mt-2.5 bg-white rounded-2xl border border-indigo-100 p-3.5 shadow-2xs space-y-2 animate-in fade-in duration-150">
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            Comparativa de Valores Modificados:
                          </div>

                          <div className="grid grid-cols-1 gap-2">
                            {log.changes.map((chg, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2"
                              >
                                <div className="font-bold text-slate-800 shrink-0 md:w-1/3">
                                  {chg.fieldLabel || chg.field}:
                                </div>

                                <div className="flex items-center flex-wrap gap-2 text-xs md:w-2/3">
                                  <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 line-through opacity-80 font-mono text-[11px]">
                                    {String(chg.oldValue || '(Vacío)')}
                                  </span>

                                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                                  <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold font-mono text-[11px]">
                                    {String(chg.newValue || '(Eliminado/Vacío)')}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Clear/Reset Confirmation Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">¿Inicializar y Borrar Log de Cambios?</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Esta acción eliminará todos los registros históricos de auditoría guardados en Firestore ({logs.length} eventos). Se dejará una única entrada registrada indicando quién inicializó el log.
            </p>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 font-medium">
              ⚠️ Esta operación es irreversible.
            </div>

            <div className="flex justify-end space-x-2.5 pt-2">
              <button
                type="button"
                disabled={isClearing}
                onClick={() => setIsClearModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isClearing}
                onClick={handleConfirmClear}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isClearing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Borrando en Firestore...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Sí, Vaciar e Inicializar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
