import React, { useMemo, useState } from 'react';
import { FolderKanban, Plus, DollarSign, Clock, CheckCircle2, ChevronRight, Filter } from 'lucide-react';
import { Expense } from '../types';
import { formatCurrency } from '../utils/helpers';

interface ProjectsViewProps {
  expenses: Expense[];
  availableProjects: string[];
  onAddNewProject: (project: string) => void;
  onFilterByProject: (project: string) => void;
}

export function ProjectsView({
  expenses,
  availableProjects,
  onAddNewProject,
  onFilterByProject,
}: ProjectsViewProps) {
  const [newProjectName, setNewProjectName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Group expenses by project
  const projectStats = useMemo(() => {
    return availableProjects.map((projectName) => {
      const projectExpenses = expenses.filter((e) => e.project === projectName);
      const totalSpent = projectExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const reimbursablePending = projectExpenses
        .filter((e) => e.reimbursable && e.reimbursementStatus === 'PENDING')
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      const reimbursablePaid = projectExpenses
        .filter((e) => e.reimbursable && e.reimbursementStatus === 'REIMBURSED')
        .reduce((sum, e) => sum + (e.amount || 0), 0);

      // Categories breakdown
      const categories: Record<string, number> = {};
      projectExpenses.forEach((e) => {
        categories[e.category] = (categories[e.category] || 0) + (e.amount || 0);
      });

      return {
        name: projectName,
        count: projectExpenses.length,
        totalSpent,
        reimbursablePending,
        reimbursablePaid,
        categories,
      };
    });
  }, [expenses, availableProjects]);

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    onAddNewProject(newProjectName.trim());
    setNewProjectName('');
    setIsAdding(false);
  };

  return (
    <div className="space-y-4">
      
      {/* Header & Add Project Banner (Bento Tile) */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center">
            <FolderKanban className="w-5 h-5 mr-2 text-indigo-600" />
            Consolidado por Proyectos
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Supervisa el presupuesto ejecutado, facturas asignadas y reintegros por cada centro de costos o proyecto.
          </p>
        </div>

        {isAdding ? (
          <form onSubmit={handleAddProject} className="flex items-center space-x-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Nombre del nuevo proyecto..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-indigo-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-hidden flex-1 sm:w-64"
              autoFocus
            />
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>
          </form>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/70 rounded-2xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Proyecto</span>
          </button>
        )}
      </div>

      {/* Projects Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projectStats.map((proj) => (
          <div
            key={proj.name}
            className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">{proj.name}</h4>
                  <span className="text-xs text-slate-500">{proj.count} comprobante(s) asignado(s)</span>
                </div>
                <span className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
                  <FolderKanban className="w-5 h-5" />
                </span>
              </div>

              {/* Numbers */}
              <div className="p-4 bg-slate-50 rounded-2xl space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600">Total Gastado:</span>
                  <span className="font-extrabold text-slate-900 text-sm">
                    {formatCurrency(proj.totalSpent)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center text-xs">
                  <span className="text-amber-800 flex items-center">
                    <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" /> Reintegros pendientes:
                  </span>
                  <span className="font-bold text-amber-800">
                    {formatCurrency(proj.reimbursablePending)}
                  </span>
                </div>
              </div>

              {/* Categories mini preview */}
              {Object.keys(proj.categories).length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Principales rubros:
                  </div>
                  <div className="space-y-1 text-xs">
                    {(Object.entries(proj.categories) as [string, number][])
                      .slice(0, 3)
                      .map(([cat, amt]) => (
                        <div key={cat} className="flex justify-between text-slate-600">
                          <span className="truncate pr-2">• {cat}</span>
                          <span className="font-medium text-slate-900">{formatCurrency(amt)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action to drill down */}
            <button
              onClick={() => onFilterByProject(proj.name)}
              className="w-full py-2.5 px-3 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-2xl text-xs font-semibold flex items-center justify-center space-x-1 transition cursor-pointer"
            >
              <span>Ver {proj.count} comprobantes</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
