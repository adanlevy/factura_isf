import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  HardDrive,
  Cpu,
  Coins,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Server,
  Activity,
  CheckCircle2,
  AlertCircle,
  Calendar,
  DollarSign,
  Layers,
  Search,
  FileText,
  Mail,
  Cloud,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Info,
} from 'lucide-react';
import {
  Expense,
  Vendor,
  CostCenter,
  AppUserRecord,
  SystemMetricsReport,
  ApiUsageLogEntry,
} from '../types';
import { computeFirestoreStorage, formatBytes, formatCurrencyUsd, formatCurrencyArs } from '../utils/firestoreMetrics';
import { APP_VERSION, APP_BUILD_DATE } from '../version';

interface SystemAdminViewProps {
  expenses: Expense[];
  vendors: Vendor[];
  costCenters: CostCenter[];
  categories: string[];
  appUsers: AppUserRecord[];
}

export const SystemAdminView: React.FC<SystemAdminViewProps> = ({
  expenses,
  vendors,
  costCenters,
  categories,
  appUsers,
}) => {
  const [metrics, setMetrics] = useState<SystemMetricsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currencyMode, setCurrencyMode] = useState<'USD' | 'ARS'>('USD');
  const [logFilterService, setLogFilterService] = useState<string>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [selectedTab, setSelectedTab] = useState<'overview' | 'storage' | 'apis' | 'logs'>('overview');

  // Fallback client-side calculation if backend metrics request fails
  const localFirestoreMetrics = useMemo(() => {
    return computeFirestoreStorage(expenses, vendors, costCenters, categories, appUsers);
  }, [expenses, vendors, costCenters, categories, appUsers]);

  const fetchMetrics = async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/system/metrics');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setMetrics(json.data);
        }
      }
    } catch (err) {
      console.warn('Could not load backend system metrics, using local calculation:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  // Merged Firestore Storage data
  const firestoreData = metrics?.firestore || localFirestoreMetrics;
  const apiUsage = metrics?.apiUsage;
  const exchangeRate = apiUsage?.exchangeRateArs || 1060;

  // Format currency helper based on state
  const formatCost = (usd: number) => {
    if (currencyMode === 'ARS') {
      return formatCurrencyArs(usd * exchangeRate);
    }
    return formatCurrencyUsd(usd);
  };

  // Filtered API logs
  const filteredLogs = useMemo(() => {
    if (!apiUsage?.recentLogs) return [];
    return apiUsage.recentLogs.filter((log: ApiUsageLogEntry) => {
      const matchesService =
        logFilterService === 'all' || log.service === logFilterService;
      const matchesQuery =
        !logSearchQuery ||
        log.actionName.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
        log.endpoint.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
        (log.details && log.details.toLowerCase().includes(logSearchQuery.toLowerCase())) ||
        (log.userEmail && log.userEmail.toLowerCase().includes(logSearchQuery.toLowerCase()));
      return matchesService && matchesQuery;
    });
  }, [apiUsage?.recentLogs, logFilterService, logSearchQuery]);

  return (
    <div id="system-admin-view-root" className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 flex items-center justify-center">
            <Server className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                Panel del Sistema & Métricas Operativas
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                En Línea
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-mono font-medium text-slate-700">
                v{APP_VERSION}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Base de Datos: <strong className="font-mono text-slate-700">ai-studio-isffacturas</strong></span>
              <span>•</span>
              <span>ID: <code className="font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded">b8bc195a-3ac7-493a</code></span>
              <span>•</span>
              <span>Moneda: 1 USD = ${exchangeRate.toLocaleString('es-AR')} ARS</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 self-end md:self-center">
          {/* Currency Switcher */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium">
            <button
              id="currency-toggle-usd"
              onClick={() => setCurrencyMode('USD')}
              className={`px-2.5 py-1 rounded-md transition ${
                currencyMode === 'USD'
                  ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              USD ($)
            </button>
            <button
              id="currency-toggle-ars"
              onClick={() => setCurrencyMode('ARS')}
              className={`px-2.5 py-1 rounded-md transition ${
                currencyMode === 'ARS'
                  ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ARS ($ ARS)
            </button>
          </div>

          <button
            id="btn-refresh-system-metrics"
            onClick={fetchMetrics}
            disabled={refreshing}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer disabled:opacity-50"
            title="Recargar métricas en tiempo real"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
            <span>{refreshing ? 'Actualizando...' : 'Actualizar'}</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          id="tab-system-overview"
          onClick={() => setSelectedTab('overview')}
          className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-2 ${
            selectedTab === 'overview'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Resumen General</span>
        </button>
        <button
          id="tab-system-storage"
          onClick={() => setSelectedTab('storage')}
          className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-2 ${
            selectedTab === 'storage'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>Espacio Firestore ({formatBytes(firestoreData.totalEstimatedBytes)})</span>
        </button>
        <button
          id="tab-system-apis"
          onClick={() => setSelectedTab('apis')}
          className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-2 ${
            selectedTab === 'apis'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Consumo de APIs ({apiUsage ? formatCost(apiUsage.currentMonth.totalCostUsd) : '...'})</span>
        </button>
        <button
          id="tab-system-logs"
          onClick={() => setSelectedTab('logs')}
          className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-2 ${
            selectedTab === 'logs'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Auditoría de Llamadas</span>
        </button>
      </div>

      {/* TOP KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Firestore Total Storage */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Espacio en Firestore</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-800">
              {formatBytes(firestoreData.totalEstimatedBytes)}
            </span>
            <span className="text-xs text-slate-400">/ 1.00 GB</span>
          </div>
          {/* Progress bar */}
          <div className="mt-2.5 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(firestoreData.percentUsed, 0.5)}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>{firestoreData.percentUsed}% utilizado</span>
            <span>{firestoreData.totalDocuments} documentos</span>
          </div>
        </div>

        {/* 2. API Usage Current Month */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              {apiUsage ? `Gasto APIs: ${apiUsage.currentMonth.monthLabel}` : 'Gasto APIs (Este Mes)'}
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-800">
              {apiUsage ? formatCost(apiUsage.currentMonth.totalCostUsd) : '$0.00 USD'}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>{apiUsage?.currentMonth.totalCalls || 0} peticiones ejecutadas</span>
            <span className="font-mono text-slate-400">
              {((apiUsage?.currentMonth.totalTokens || 0) / 1000).toFixed(1)}k tokens
            </span>
          </div>
        </div>

        {/* 3. API Usage Previous Month */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              {apiUsage ? `Gasto APIs: ${apiUsage.previousMonth.monthLabel}` : 'Gasto APIs (Mes Anterior)'}
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-800">
              {apiUsage ? formatCost(apiUsage.previousMonth.totalCostUsd) : '$0.00 USD'}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>{apiUsage?.previousMonth.totalCalls || 0} peticiones ejecutadas</span>
            <span className="font-mono text-slate-400">
              {((apiUsage?.previousMonth.totalTokens || 0) / 1000).toFixed(1)}k tokens
            </span>
          </div>
        </div>

        {/* 4. Month-over-Month Trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Variación Intermensual</span>
            <div className={`p-2 rounded-lg ${
              apiUsage?.comparison.isHigher
                ? 'bg-rose-50 text-rose-600'
                : 'bg-emerald-50 text-emerald-600'
            }`}>
              {apiUsage?.comparison.isHigher ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className={`text-2xl font-bold ${
              apiUsage?.comparison.isHigher ? 'text-rose-600' : 'text-emerald-600'
            }`}>
              {apiUsage ? `${apiUsage.comparison.isHigher ? '+' : ''}${apiUsage.comparison.percentageChange}%` : '0%'}
            </span>
            <span className="text-xs text-slate-400">vs mes anterior</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>Diferencia neta:</span>
            <span className="font-medium text-slate-700">
              {apiUsage ? `${apiUsage.comparison.diffCostUsd >= 0 ? '+' : ''}${formatCost(apiUsage.comparison.diffCostUsd)}` : '$0.00'}
            </span>
          </div>
        </div>
      </div>

      {/* VIEW SECTION: OVERVIEW OR SPECIFIC TABS */}
      {(selectedTab === 'overview' || selectedTab === 'storage') && (
        <div className="space-y-6">
          {/* FIRESTORE STORAGE DETAILED BREAKDOWN */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    Espacio Ocupado en Firestore por Colección
                  </h2>
                  <p className="text-xs text-slate-500">
                    Cálculo exacto de bytes por documento según estándares de Firebase Firestore Enterprise
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-700">
                  Total: {formatBytes(firestoreData.totalEstimatedBytes)}
                </span>
                <span className="text-xs text-slate-400 block">
                  ({firestoreData.totalDocuments} documentos en BD)
                </span>
              </div>
            </div>

            {/* Collection Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Colección</th>
                    <th className="py-3 px-4">Descripción del Contenido</th>
                    <th className="py-3 px-4 text-center">Documentos</th>
                    <th className="py-3 px-4 text-right">Tamaño Estimado</th>
                    <th className="py-3 px-4 text-right">% del Total</th>
                    <th className="py-3 px-4">Distribución</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {firestoreData.collections.map((col) => (
                    <tr key={col.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-800">
                        {col.name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                        {col.description}
                      </td>
                      <td className="py-3.5 px-4 text-center font-medium text-slate-700">
                        {col.documentCount.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-800">
                        {formatBytes(col.estimatedBytes)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-indigo-600">
                        {col.percentage}%
                      </td>
                      <td className="py-3.5 px-4 w-36">
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(col.percentage, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Storage Note Banner */}
            <div className="bg-slate-50 border-t border-slate-100 p-4 text-xs text-slate-500 flex items-start space-x-2.5">
              <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Optimización de Almacenamiento:</strong> Los archivos binarios pesados (imágenes de facturas, constancias PDF y comprobantes de transferencias) se suben y resguardan en <strong>Google Drive</strong> dentro de carpetas organizadas por Centro de Costos, manteniendo en Firestore únicamente los metadatos estructurados y URLs, lo que permite un ahorro drástico de espacio y costos de base de datos.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW SECTION: API USAGE MONTH OVER MONTH */}
      {(selectedTab === 'overview' || selectedTab === 'apis') && apiUsage && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  <Coins className="w-5 h-5 text-indigo-600" />
                  <span>Comparativa de Costos de APIs: Este Mes vs Mes Anterior</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Consumo discriminado de Gemini 3.7 Flash OCR, Google Drive v3, Gmail REST API y Firestore
                </p>
              </div>

              {/* Monthly Cost Comparison Pills */}
              <div className="flex items-center space-x-3 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
                <div className="px-3 py-1.5 bg-white rounded-lg border border-slate-200 shadow-xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    {apiUsage.previousMonth.monthLabel}
                  </span>
                  <span className="font-bold text-slate-800">
                    {formatCost(apiUsage.previousMonth.totalCostUsd)}
                  </span>
                </div>
                <div className="text-slate-400 font-bold">→</div>
                <div className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg shadow-xs">
                  <span className="text-[10px] uppercase font-bold text-indigo-500 block">
                    {apiUsage.currentMonth.monthLabel} (Actual)
                  </span>
                  <span className="font-bold text-indigo-700">
                    {formatCost(apiUsage.currentMonth.totalCostUsd)}
                  </span>
                </div>
              </div>
            </div>

            {/* Service Breakdown Comparison Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Google Gemini AI OCR & Voice */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-md">
                        <Zap className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-slate-800">Gemini 3.7 Flash (AI)</span>
                    </div>
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-mono">
                      OCR / Audio
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-slate-500">Este Mes:</div>
                    <div className="text-lg font-bold text-slate-800">
                      {formatCost(apiUsage.currentMonth.byService.gemini_ai?.costUsd || 0)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {apiUsage.currentMonth.byService.gemini_ai?.calls || 0} llamadas •{' '}
                      {((apiUsage.currentMonth.byService.gemini_ai?.tokens || 0) / 1000).toFixed(1)}k tokens
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between">
                  <span>Mes Anterior:</span>
                  <span className="font-medium text-slate-700">
                    {formatCost(apiUsage.previousMonth.byService.gemini_ai?.costUsd || 0)}
                  </span>
                </div>
              </div>

              {/* 2. Google Drive API */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 bg-blue-100 text-blue-700 rounded-md">
                        <Cloud className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-slate-800">Google Drive API</span>
                    </div>
                    <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">
                      v3 REST
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-slate-500">Este Mes:</div>
                    <div className="text-lg font-bold text-slate-800">
                      {formatCost(apiUsage.currentMonth.byService.google_drive?.costUsd || 0)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {apiUsage.currentMonth.byService.google_drive?.calls || 0} subidas de comprobantes
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between">
                  <span>Mes Anterior:</span>
                  <span className="font-medium text-slate-700">
                    {formatCost(apiUsage.previousMonth.byService.google_drive?.costUsd || 0)}
                  </span>
                </div>
              </div>

              {/* 3. Google Gmail API */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 bg-rose-100 text-rose-700 rounded-md">
                        <Mail className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-slate-800">Google Gmail API</span>
                    </div>
                    <span className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-mono">
                      v1 Notif
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-slate-500">Este Mes:</div>
                    <div className="text-lg font-bold text-slate-800">
                      {formatCost(apiUsage.currentMonth.byService.google_gmail?.costUsd || 0)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {apiUsage.currentMonth.byService.google_gmail?.calls || 0} correos enviados
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between">
                  <span>Mes Anterior:</span>
                  <span className="font-medium text-slate-700">
                    {formatCost(apiUsage.previousMonth.byService.google_gmail?.costUsd || 0)}
                  </span>
                </div>
              </div>

              {/* 4. Firebase Firestore Synchronizer */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 bg-amber-100 text-amber-700 rounded-md">
                        <Database className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-slate-800">Firebase Firestore</span>
                    </div>
                    <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-mono">
                      Sync SDK
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-slate-500">Este Mes:</div>
                    <div className="text-lg font-bold text-slate-800">
                      $0.00 (Incluido en Cuota)
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {firestoreData.totalDocuments} docs • 0.00% cuota
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between">
                  <span>Mes Anterior:</span>
                  <span className="font-medium text-slate-700">$0.00 USD</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW SECTION: HEALTH STATUS OF INTEGRATED SERVICES */}
      {selectedTab === 'overview' && metrics?.servicesHealth && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>Estado de Conectividad & Servicios del Sistema</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(metrics.servicesHealth).map(([key, rawSvc]) => {
              const svc = rawSvc as { status: string; label: string };
              return (
                <div
                  key={key}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-start space-x-3 shadow-2xs"
                >
                  <div className="mt-0.5">
                    {svc.status === 'healthy' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 capitalize truncate">
                        {key}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${
                          svc.status === 'healthy'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {svc.status === 'healthy' ? 'Operativo' : 'Configurado'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-tight line-clamp-2">
                      {svc.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW SECTION: AUDIT LOGS OF API EXECUTIONS */}
      {(selectedTab === 'overview' || selectedTab === 'logs') && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <span>Auditoría de Ejecución de APIs & Microservicios</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Historial cronológico de llamadas realizadas por los usuarios y el motor de IA
              </p>
            </div>

            {/* Filter and Search Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar en auditoría..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48"
                />
              </div>

              <select
                value={logFilterService}
                onChange={(e) => setLogFilterService(e.target.value)}
                className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none"
              >
                <option value="all">Todos los Servicios</option>
                <option value="gemini_ai">Google Gemini AI</option>
                <option value="google_drive">Google Drive API</option>
                <option value="google_gmail">Google Gmail API</option>
              </select>
            </div>
          </div>

          {/* Logs Table */}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[10px] sticky top-0">
                <tr>
                  <th className="py-3 px-4">Fecha y Hora</th>
                  <th className="py-3 px-4">Servicio / API</th>
                  <th className="py-3 px-4">Acción Realizada</th>
                  <th className="py-3 px-4 text-center">Tokens</th>
                  <th className="py-3 px-4 text-right">Costo Estimado</th>
                  <th className="py-3 px-4 text-center">Latencia</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                      No se encontraron registros de auditoría que coincidan con el filtro.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log: ApiUsageLogEntry) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                            log.service === 'gemini_ai'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                              : log.service === 'google_drive'
                              ? 'bg-blue-50 text-blue-700 border border-blue-100'
                              : log.service === 'google_gmail'
                              ? 'bg-rose-50 text-rose-700 border border-rose-100'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {log.serviceName}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 block">
                          {log.actionName}
                        </span>
                        {log.details && (
                          <span className="text-[11px] text-slate-400 block truncate max-w-sm">
                            {log.details}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[11px] text-slate-600">
                        {log.totalTokens && log.totalTokens > 0
                          ? log.totalTokens.toLocaleString()
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {formatCost(log.estimatedCostUsd)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[11px] text-slate-500">
                        {log.durationMs}ms
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Éxito
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
