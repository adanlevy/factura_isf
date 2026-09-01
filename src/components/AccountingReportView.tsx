import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Download,
  Calendar,
  DollarSign,
  PieChart,
  Layers,
  ArrowDownToLine,
  CheckCircle2,
  Clock,
  Receipt,
} from 'lucide-react';
import { Expense } from '../types';
import { formatCurrency, formatDate, formatUploadDateTime, exportToCSV } from '../utils/helpers';
import {
  sortExpenses,
  ExpenseSortField,
  ExpenseSortConfig,
  SortDirection,
} from '../utils/sorting';
import { SortableHeader, MobileSortSelector } from './SortableHeader';

interface AccountingReportViewProps {
  expenses: Expense[];
  onImportJSON: (importedExpenses: Expense[]) => void;
}

export function AccountingReportView({ expenses, onImportJSON }: AccountingReportViewProps) {
  // Sorting state - Defaults to 'createdAt' descending (Fecha de Carga)
  const [sortConfig, setSortConfig] = useState<ExpenseSortConfig>({
    field: 'createdAt',
    direction: 'desc',
  });

  const handleSort = (field: ExpenseSortField) => {
    setSortConfig((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      const defaultDesc = field === 'createdAt' || field === 'date' || field === 'amount';
      return {
        field,
        direction: defaultDesc ? 'desc' : 'asc',
      };
    });
  };

  const handleSortChange = (field: ExpenseSortField, direction: SortDirection) => {
    setSortConfig({ field, direction });
  };

  // Sorted expenses by sortConfig
  const sortedExpenses = useMemo(() => {
    return sortExpenses(expenses, sortConfig);
  }, [expenses, sortConfig]);

  // Aggregate Metrics
  const summary = useMemo(() => {
    const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const pendingReimbursements = expenses
      .filter((e) => e.reimbursable && e.reimbursementStatus === 'PENDING')
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    const paidReimbursements = expenses
      .filter((e) => e.reimbursable && e.reimbursementStatus === 'REIMBURSED')
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    const nonReimbursable = expenses
      .filter((e) => !e.reimbursable)
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    // Group by project
    const byProject: Record<string, { total: number; count: number; pending: number }> = {};
    expenses.forEach((e) => {
      if (!byProject[e.project]) byProject[e.project] = { total: 0, count: 0, pending: 0 };
      byProject[e.project].total += e.amount || 0;
      byProject[e.project].count += 1;
      if (e.reimbursable && e.reimbursementStatus === 'PENDING') {
        byProject[e.project].pending += e.amount || 0;
      }
    });

    return {
      totalAmount,
      pendingReimbursements,
      paidReimbursements,
      nonReimbursable,
      byProject,
    };
  }, [expenses]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(expenses, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `backup_contable_gastos_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          onImportJSON(parsed);
          alert(`Se importaron exitosamente ${parsed.length} comprobantes.`);
        }
      } catch {
        alert('Error al leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      
      {/* Action Bar (Bento Panel) */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center">
            <FileSpreadsheet className="w-5 h-5 mr-2 text-indigo-600" />
            Informe Contable y Rendición
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Descarga la planilla en CSV/Excel o imprime el informe de rendición de gastos para contabilidad.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportToCSV(expenses)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Descargar CSV (Excel)</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Informe</span>
          </button>

          <button
            onClick={handleExportJSON}
            className="px-3 py-2.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-semibold flex items-center space-x-1 cursor-pointer"
            title="Exportar copia de seguridad en JSON"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Backup JSON</span>
          </button>

          <label className="px-3 py-2.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-semibold flex items-center space-x-1 cursor-pointer">
            <span>Restaurar JSON</span>
            <input type="file" accept=".json" onChange={handleFileImport} className="hidden" />
          </label>
        </div>
      </div>

      {/* Printable Report Canvas */}
      <div id="printable-accounting-report" className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-xs space-y-8">
        
        {/* Document Header */}
        <div className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row justify-between sm:items-end gap-4">
          <div>
            <span className="text-xs uppercase font-bold text-indigo-600 tracking-wider">
              Informe de Gastos & Comprobantes
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 mt-1">Rendición Contable Periódica</h2>
            <p className="text-xs text-slate-500 mt-1">
              Generado el {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-xs text-slate-500">Monto Total Rendido</div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {formatCurrency(summary.totalAmount)}
            </div>
          </div>
        </div>

        {/* Top 3 Breakdown Bento Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1">
            <div className="text-xs font-bold text-amber-800 uppercase flex items-center">
              <Clock className="w-3.5 h-3.5 mr-1" /> Reintegros Pendientes
            </div>
            <div className="text-xl font-extrabold text-amber-950">
              {formatCurrency(summary.pendingReimbursements)}
            </div>
            <p className="text-[11px] text-amber-700">A devolver a colaboradores</p>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1">
            <div className="text-xs font-bold text-emerald-800 uppercase flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Reintegros Ya Pagados
            </div>
            <div className="text-xl font-extrabold text-emerald-950">
              {formatCurrency(summary.paidReimbursements)}
            </div>
            <p className="text-[11px] text-emerald-700">Liquidados satisfactoriamente</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-xs font-bold text-slate-700 uppercase flex items-center">
              <DollarSign className="w-3.5 h-3.5 mr-1" /> Pagado por Empresa Directo
            </div>
            <div className="text-xl font-extrabold text-slate-900">
              {formatCurrency(summary.nonReimbursable)}
            </div>
            <p className="text-[11px] text-slate-500">Tarjetas corporativas / Caja chica</p>
          </div>
        </div>

        {/* Detailed Ledger Table */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Detalle de Comprobantes Asentados ({sortedExpenses.length})
          </h4>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[10.5px] uppercase tracking-wider">
                <tr>
                  <SortableHeader
                    label="Fecha Carga"
                    field="createdAt"
                    currentField={sortConfig.field}
                    currentDirection={sortConfig.direction}
                    onSort={handleSort}
                    className="py-2.5 px-3 whitespace-nowrap"
                  />
                  <SortableHeader
                    label="Fecha Doc."
                    field="date"
                    currentField={sortConfig.field}
                    currentDirection={sortConfig.direction}
                    onSort={handleSort}
                    className="py-2.5 px-3 whitespace-nowrap"
                  />
                  <SortableHeader
                    label="N° Factura / CUIT"
                    field="invoiceNumber"
                    currentField={sortConfig.field}
                    currentDirection={sortConfig.direction}
                    onSort={handleSort}
                    className="py-2.5 px-3"
                  />
                  <SortableHeader
                    label="Nombre / Factura"
                    field="vendor"
                    currentField={sortConfig.field}
                    currentDirection={sortConfig.direction}
                    onSort={handleSort}
                    className="py-2.5 px-3"
                  />
                  <SortableHeader
                    label="Centro de Costos"
                    field="project"
                    currentField={sortConfig.field}
                    currentDirection={sortConfig.direction}
                    onSort={handleSort}
                    className="py-2.5 px-3"
                  />
                  <SortableHeader
                    label="Reintegro"
                    field="status"
                    currentField={sortConfig.field}
                    currentDirection={sortConfig.direction}
                    onSort={handleSort}
                    align="center"
                    className="py-2.5 px-3 text-center"
                  />
                  <SortableHeader
                    label="Monto"
                    field="amount"
                    currentField={sortConfig.field}
                    currentDirection={sortConfig.direction}
                    onSort={handleSort}
                    align="right"
                    className="py-2.5 px-3 text-right whitespace-nowrap"
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {sortedExpenses.map((e) => {
                  const uploadDt = formatUploadDateTime(e.createdAt, e.date);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/50">
                      {/* Fecha Carga */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-xs">{uploadDt.date}</div>
                        {uploadDt.time && (
                          <div className="text-[10px] text-slate-500 font-medium">{uploadDt.time}</div>
                        )}
                      </td>
                      {/* Fecha Doc */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 font-medium">
                        {formatDate(e.date)}
                      </td>
                      {/* Factura / CUIT */}
                      <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                        {e.invoiceNumber || e.cuit || '-'}
                      </td>
                      {/* Proveedor */}
                      <td className="py-2.5 px-3 font-bold text-slate-900 max-w-[170px] truncate" title={e.vendor}>
                        {e.vendor}
                      </td>
                      {/* Proyecto */}
                      <td className="py-2.5 px-3 text-slate-700 font-medium">{e.project}</td>
                      {/* Reintegro */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {e.reimbursable ? (
                          e.reimbursementStatus === 'PENDING' ? (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                              Pendiente
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              Reintegrado
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">Directo</span>
                        )}
                      </td>
                      {/* Monto */}
                      <td className="py-2.5 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                        {formatCurrency(e.amount, e.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={6} className="py-3 px-3 text-right">
                    TOTAL RENDIDO:
                  </td>
                  <td className="py-3 px-3 text-right text-sm">
                    {formatCurrency(summary.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile Cards for Ledger View */}
          <div className="block md:hidden space-y-2.5">
            {sortedExpenses.length > 0 && (
              <MobileSortSelector
                currentField={sortConfig.field}
                currentDirection={sortConfig.direction}
                onSortChange={handleSortChange}
                options={[
                  { field: 'createdAt', label: 'Fecha Carga' },
                  { field: 'date', label: 'Fecha Doc.' },
                  { field: 'vendor', label: 'Proveedor' },
                  { field: 'amount', label: 'Monto' },
                  { field: 'project', label: 'Centro de Costos' },
                  { field: 'status', label: 'Reintegro' },
                ]}
              />
            )}

            {sortedExpenses.map((e) => {
              const uploadDt = formatUploadDateTime(e.createdAt, e.date);
              return (
                <div
                  key={`report-card-${e.id}`}
                  className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-1 text-slate-600">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="font-bold">Carga:</span>
                      <span>{uploadDt.date} {uploadDt.time ? `• ${uploadDt.time}` : ''}</span>
                    </div>
                    <div>
                      {e.reimbursable ? (
                        e.reimbursementStatus === 'PENDING' ? (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            Pendiente
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            Reintegrado
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">Directo</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-sm truncate">{e.vendor}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Doc: {formatDate(e.date)} {e.invoiceNumber ? `• N° ${e.invoiceNumber}` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-extrabold text-slate-900 text-sm">
                      {formatCurrency(e.amount, e.currency)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="truncate"><strong>Centro de Costos:</strong> {e.project}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Project Breakdown */}
        <div className="pt-4">
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Distribución por Centro de Costos
            </h4>
            <div className="rounded-2xl border border-slate-200 overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Centro de Costos</th>
                    <th className="py-2 px-3 text-center">Cant.</th>
                    <th className="py-2 px-3 text-right">Pendiente Reintegro</th>
                    <th className="py-2 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(Object.entries(summary.byProject) as [string, { total: number; count: number; pending: number }][]).map(([proj, data]) => (
                    <tr key={proj}>
                      <td className="py-2 px-3 font-medium text-slate-900">{proj}</td>
                      <td className="py-2 px-3 text-center text-slate-500">{data.count}</td>
                      <td className="py-2 px-3 text-right text-amber-700 font-semibold">
                        {data.pending > 0 ? formatCurrency(data.pending) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        {formatCurrency(data.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Signatures section for physical printout */}
        <div className="pt-12 border-t border-slate-200 grid grid-cols-2 gap-12 text-center text-xs text-slate-500">
          <div className="space-y-2">
            <div className="border-b border-slate-300 w-48 mx-auto" />
            <p className="font-semibold text-slate-700">Firma del Rendidor / Solicitante</p>
          </div>
          <div className="space-y-2">
            <div className="border-b border-slate-300 w-48 mx-auto" />
            <p className="font-semibold text-slate-700">Firma de Aprobación Contable / Tesorería</p>
          </div>
        </div>
      </div>
    </div>
  );
}
