import React, { useState } from 'react';
import { Tag, Plus, Trash2, Shield, Check, AlertCircle, Sparkles, FolderKanban } from 'lucide-react';

interface CategoryAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  projects: string[];
  onUpdateCategories: (categories: string[]) => void;
  onUpdateProjects: (projects: string[]) => void;
}

export function CategoryAdminModal({
  isOpen,
  onClose,
  categories,
  projects,
  onUpdateCategories,
  onUpdateProjects,
}: CategoryAdminModalProps) {
  const [activeTab, setActiveTab] = useState<'categories' | 'projects'>('categories');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [newProjectInput, setNewProjectInput] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      setFeedback('La categoría ya existe.');
      return;
    }
    const updated = [...categories, trimmed];
    onUpdateCategories(updated);
    setNewCategoryInput('');
    setFeedback(`Categoría "${trimmed}" añadida.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleDeleteCategory = (catToDelete: string) => {
    if (categories.length <= 1) {
      alert('Debe quedar al menos una categoría en el sistema.');
      return;
    }
    if (confirm(`¿Eliminar la categoría "${catToDelete}" del catálogo?`)) {
      const updated = categories.filter((c) => c !== catToDelete);
      onUpdateCategories(updated);
      setFeedback(`Categoría "${catToDelete}" eliminada.`);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProjectInput.trim();
    if (!trimmed) return;
    if (projects.includes(trimmed)) {
      setFeedback('El proyecto ya existe.');
      return;
    }
    const updated = [...projects, trimmed];
    onUpdateProjects(updated);
    setNewProjectInput('');
    setFeedback(`Proyecto "${trimmed}" añadido.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleDeleteProject = (projToDelete: string) => {
    if (projects.length <= 1) {
      alert('Debe quedar al menos un proyecto en el sistema.');
      return;
    }
    if (confirm(`¿Eliminar el proyecto "${projToDelete}" del catálogo?`)) {
      const updated = projects.filter((p) => p !== projToDelete);
      onUpdateProjects(updated);
      setFeedback(`Proyecto "${projToDelete}" eliminado.`);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Administración de Catálogos</h3>
              <p className="text-xs text-slate-400">Control normalizado de Categorías Contables y Proyectos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-100 bg-slate-50 px-6 pt-3 space-x-3">
          <button
            onClick={() => setActiveTab('categories')}
            className={`pb-3 font-bold text-xs sm:text-sm flex items-center space-x-1.5 border-b-2 cursor-pointer transition ${
              activeTab === 'categories'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Categorías Contables ({categories.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('projects')}
            className={`pb-3 font-bold text-xs sm:text-sm flex items-center space-x-1.5 border-b-2 cursor-pointer transition ${
              activeTab === 'projects'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span>Proyectos ({projects.length})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          
          {feedback && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-semibold text-indigo-900 flex items-center space-x-2">
              <Check className="w-4 h-4 text-indigo-600" />
              <span>{feedback}</span>
            </div>
          )}

          {activeTab === 'categories' ? (
            <div className="space-y-4">
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  placeholder="Nombre de nueva categoría (ej: Logística y Envíos)..."
                  className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-xs sm:text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-xs transition flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar</span>
                </button>
              </form>

              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Listado de Categorías Normalizadas
                </div>
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                  {categories.map((cat, idx) => (
                    <div key={idx} className="p-3 sm:px-4 flex items-center justify-between hover:bg-slate-50 transition">
                      <div className="flex items-center space-x-2">
                        <Tag className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-xs sm:text-sm font-medium text-slate-800">{cat}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title="Eliminar categoría"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={handleAddProject} className="flex gap-2">
                <input
                  type="text"
                  value={newProjectInput}
                  onChange={(e) => setNewProjectInput(e.target.value)}
                  placeholder="Nombre de nuevo proyecto..."
                  className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-xs sm:text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-xs transition flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar</span>
                </button>
              </form>

              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Listado de Proyectos
                </div>
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                  {projects.map((proj, idx) => (
                    <div key={idx} className="p-3 sm:px-4 flex items-center justify-between hover:bg-slate-50 transition">
                      <div className="flex items-center space-x-2">
                        <FolderKanban className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-xs sm:text-sm font-medium text-slate-800">{proj}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteProject(proj)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title="Eliminar proyecto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
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
