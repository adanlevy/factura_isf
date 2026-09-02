import React, { useState, useMemo } from 'react';
import { Tag, Plus, Trash2, Edit2, Check, X, Search, FileSpreadsheet, Layers } from 'lucide-react';
import { Expense } from '../types';
import { formatCurrency, matchesSearch } from '../utils/helpers';

interface CategoriesViewProps {
  categories: string[];
  expenses: Expense[];
  onAddCategory: (categoryName: string) => void;
  onUpdateCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (categoryName: string) => void;
}

export function CategoriesView({
  categories,
  expenses,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
}: CategoriesViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  // Calculate usage stats per category
  const categoryStats = useMemo(() => {
    const stats: Record<string, { count: number; total: number }> = {};
    categories.forEach((cat) => {
      stats[cat] = { count: 0, total: 0 };
    });

    expenses.forEach((e) => {
      if (stats[e.category]) {
        stats[e.category].count += 1;
        stats[e.category].total += e.amount || 0;
      }
    });

    return stats;
  }, [categories, expenses]);

  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) {
      return [...categories].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    }
    return categories
      .filter((cat) => matchesSearch(cat, searchTerm))
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [categories, searchTerm]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      alert('Esta categoría ya existe.');
      return;
    }
    onAddCategory(trimmed);
    setNewCategoryName('');
  };

  const handleStartEdit = (cat: string) => {
    setEditingCategory(cat);
    setEditingValue(cat);
  };

  const handleSaveEdit = (oldName: string) => {
    const trimmed = editingValue.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingCategory(null);
      return;
    }
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase() && c !== oldName)) {
      alert('Ya existe otra categoría con este nombre.');
      return;
    }
    onUpdateCategory(oldName, trimmed);
    setEditingCategory(null);
  };

  return (
    <div className="space-y-6">
      {/* Header & Add Category Panel */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Tag className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Categorías Contables</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Plan de cuentas para clasificar comprobantes y deducciones impositivas ({categories.length} categorías).
          </p>
        </div>

        {/* Add Form */}
        <form onSubmit={handleCreate} className="flex items-center gap-2 max-w-md w-full">
          <input
            type="text"
            placeholder="Nueva categoría..."
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
          />
          <button
            type="submit"
            disabled={!newCategoryName.trim()}
            className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center space-x-1.5 shadow-xs transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Añadir</span>
          </button>
        </form>
      </div>

      {/* Search & List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="relative max-w-sm w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar categoría..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9.5 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
            />
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Mostrando {filteredCategories.length} de {categories.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase text-[11px] tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">Nombre de Categoría</th>
                <th className="px-5 py-3.5 text-center">Comprobantes</th>
                <th className="px-5 py-3.5 text-right">Total Acumulado</th>
                <th className="px-5 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-xs">
                    No se encontraron categorías que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                filteredCategories.map((category) => {
                  const stat = categoryStats[category] || { count: 0, total: 0 };
                  const isEditing = editingCategory === category;

                  return (
                    <tr key={category} className="hover:bg-slate-50/60 transition group">
                      <td className="px-5 py-3.5 font-medium text-slate-900">
                        {isEditing ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              className="px-3 py-1.5 border border-indigo-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveEdit(category)}
                              className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
                              title="Guardar"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingCategory(null)}
                              className="p-1.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 transition"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            <span>{category}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center text-slate-600">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                          {stat.count} gasto{stat.count !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-slate-900">
                        {stat.total > 0 ? formatCurrency(stat.total) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1">
                        {!isEditing && (
                          <>
                            <button
                              onClick={() => handleStartEdit(category)}
                              className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition"
                              title="Editar nombre"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setCategoryToDelete(category)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                              title="Eliminar categoría"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Category Confirmation Modal */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">¿Eliminar categoría contable?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Estás por eliminar la categoría <strong className="text-slate-800">"{categoryToDelete}"</strong>.
              </p>
              {categoryStats[categoryToDelete]?.count > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200 mt-2 text-left">
                  ⚠️ <strong>Atención:</strong> Hay {categoryStats[categoryToDelete].count} comprobante(s) asignados a esta categoría.
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (categoryToDelete) {
                    onDeleteCategory(categoryToDelete);
                    setCategoryToDelete(null);
                  }
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
