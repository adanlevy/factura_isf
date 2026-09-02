import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderKanban,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  Copy,
  AlertCircle,
  ExternalLink,
  Loader2,
  FolderCheck,
} from 'lucide-react';
import { CostCenter, Expense } from '../types';
import { GoogleDriveIcon, GoogleDriveLinkButton } from './GoogleDriveIcon';
import { sanitizeCostCenter, matchesSearch } from '../utils/helpers';
import { fetchDriveFolderInfo } from '../utils/googleWorkspace';

interface CostCentersViewProps {
  costCenters: CostCenter[];
  expenses?: Expense[];
  onAddCostCenter: (newCc: Omit<CostCenter, 'id'>) => Promise<void> | void;
  onUpdateCostCenter: (updatedCc: CostCenter) => Promise<void> | void;
  onDeleteCostCenter: (id: string) => Promise<void> | void;
}

export function CostCentersView({
  costCenters,
  onAddCostCenter,
  onUpdateCostCenter,
  onDeleteCostCenter,
}: CostCentersViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Creation form state
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDriveFolder, setNewDriveFolder] = useState('');
  const [newDriveUrl, setNewDriveUrl] = useState('');
  const [newNotifyEmails, setNewNotifyEmails] = useState('');
  const [isLoadingFolderInfo, setIsLoadingFolderInfo] = useState(false);
  const [folderAutoDetected, setFolderAutoDetected] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingNew, setIsSavingNew] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editDriveFolder, setEditDriveFolder] = useState('');
  const [editDriveUrl, setEditDriveUrl] = useState('');
  const [editNotifyEmails, setEditNotifyEmails] = useState('');
  const [isEditLoadingFolderInfo, setIsEditLoadingFolderInfo] = useState(false);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [costCenterToDelete, setCostCenterToDelete] = useState<CostCenter | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Auto-detect folder name from Drive URL for new Cost Center
  useEffect(() => {
    if (!newDriveUrl || !newDriveUrl.trim() || newDriveUrl.length < 15) {
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      setIsLoadingFolderInfo(true);
      try {
        const info = await fetchDriveFolderInfo(newDriveUrl);
        if (isMounted && info.success && info.folderName) {
          setNewDriveFolder(info.folderName);
          setFolderAutoDetected(info.folderName);
          if (!newName.trim()) {
            setNewName(info.folderName);
          }
        }
      } catch (e) {
        console.warn('Could not auto-fetch folder info:', e);
      } finally {
        if (isMounted) setIsLoadingFolderInfo(false);
      }
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [newDriveUrl]);

  // Auto-detect folder name for edit mode when URL changes
  const handleEditUrlChange = async (url: string) => {
    setEditDriveUrl(url);
    if (url && url.length > 15) {
      setIsEditLoadingFolderInfo(true);
      try {
        const info = await fetchDriveFolderInfo(url);
        if (info.success && info.folderName) {
          setEditDriveFolder(info.folderName);
        }
      } catch (e) {
        console.warn('Could not auto-fetch edit folder info:', e);
      } finally {
        setIsEditLoadingFolderInfo(false);
      }
    }
  };

  const cleanCostCenters = useMemo(() => {
    return costCenters.map(sanitizeCostCenter);
  }, [costCenters]);

  const filteredCostCenters = useMemo(() => {
    if (!searchTerm.trim()) return cleanCostCenters;
    return cleanCostCenters.filter((cc) =>
      matchesSearch([cc.name, cc.code, cc.driveFolder, cc.driveUrl, cc.notifyEmails], searchTerm)
    );
  }, [cleanCostCenters, searchTerm]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    const cleanCode = newCode.trim().toUpperCase();
    const cleanFolder = newDriveFolder.trim() || folderAutoDetected || `${cleanName} 2026`;
    const cleanUrl = newDriveUrl.trim();
    const cleanEmails = newNotifyEmails.trim();

    if (!cleanName) return;

    const finalFolder = cleanFolder;
    const finalDriveUrl = cleanUrl
      ? cleanUrl
      : `https://drive.google.com/drive/search?q=${encodeURIComponent(finalFolder)}`;

    const rawNew: Omit<CostCenter, 'id'> = {
      name: cleanName,
      code: cleanCode || cleanName.slice(0, 4).toUpperCase(),
      driveFolder: finalFolder,
      driveUrl: finalDriveUrl,
      notifyEmails: cleanEmails || '',
      ccEmails: cleanEmails || '',
      active: true,
    };

    const sanitized = sanitizeCostCenter({ ...rawNew, id: 'temp' });
    setIsSavingNew(true);
    try {
      await onAddCostCenter({
        name: sanitized.name,
        code: sanitized.code,
        driveFolder: sanitized.driveFolder,
        driveUrl: sanitized.driveUrl,
        notifyEmails: sanitized.notifyEmails || '',
        ccEmails: sanitized.ccEmails || '',
        active: sanitized.active,
      });

      setNewName('');
      setNewCode('');
      setNewDriveFolder('');
      setNewDriveUrl('');
      setNewNotifyEmails('');
      setFolderAutoDetected(null);
      setIsCreating(false);
    } catch (err: any) {
      alert('Error al guardar centro de costos en Firestore: ' + (err.message || err));
    } finally {
      setIsSavingNew(false);
    }
  };

  const handleStartEdit = (cc: CostCenter) => {
    const clean = sanitizeCostCenter(cc);
    setEditingId(clean.id);
    setEditCode(clean.code || '');
    setEditName(clean.name);
    setEditDriveFolder(clean.driveFolder || `${clean.name} 2026`);
    setEditDriveUrl(clean.driveUrl || '');
    setEditNotifyEmails(clean.notifyEmails || clean.ccEmails || '');
  };

  const handleSaveEdit = async (cc: CostCenter) => {
    const cleanName = editName.trim();
    const cleanCode = editCode.trim().toUpperCase();
    const cleanFolder = editDriveFolder.trim();
    const cleanUrl = editDriveUrl.trim();
    const cleanEmails = editNotifyEmails.trim();

    if (!cleanName) {
      setEditingId(null);
      return;
    }

    const finalFolder = cleanFolder || `${cleanName} 2026`;
    const finalDriveUrl = cleanUrl
      ? cleanUrl
      : `https://drive.google.com/drive/search?q=${encodeURIComponent(finalFolder)}`;

    const updated = sanitizeCostCenter({
      ...cc,
      name: cleanName,
      code: cleanCode || cleanName.slice(0, 4).toUpperCase(),
      driveFolder: finalFolder,
      driveUrl: finalDriveUrl,
      notifyEmails: cleanEmails || '',
      ccEmails: cleanEmails || '',
    });

    setSavingEditId(cc.id);
    try {
      await onUpdateCostCenter(updated);
      setEditingId(null);
    } catch (err: any) {
      alert('Error al actualizar centro de costos en Firestore: ' + (err.message || err));
    } finally {
      setSavingEditId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <FolderKanban className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Centros de Costos</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gestión de siglas y vinculación directa con carpetas de Google Drive ({costCenters.length} centros de costos registrados).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold flex items-center space-x-1.5 shadow-xs transition active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{isCreating ? 'Cerrar' : 'Nuevo Centro de Costos'}</span>
          </button>
        </div>
      </div>

      {/* New Cost Center Form (collapsible / toggleable) */}
      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-3xl p-6 border-2 border-indigo-200 shadow-md space-y-4 animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Añadir Nuevo Centro de Costos</h3>
              <p className="text-[11px] text-slate-500">Pega el link de Google Drive y el nombre de la carpeta se autocompletará solo.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
            {/* Sigla */}
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Sigla (Mayúsculas)
              </label>
              <input
                type="text"
                maxLength={8}
                placeholder="Ej: GADM"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono font-bold text-slate-900 uppercase text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>

            {/* Nombre */}
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Nombre del Centro de Costos *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Gastos de Administración"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>

            {/* Link Google Drive */}
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
                <span className="flex items-center">
                  <GoogleDriveIcon className="w-3.5 h-3.5 mr-1" />
                  Link de Google Drive
                </span>
                {isLoadingFolderInfo && (
                  <span className="text-[10px] text-indigo-600 font-semibold flex items-center lowercase">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    detectando carpeta...
                  </span>
                )}
              </label>
              <input
                type="url"
                placeholder="https://drive.google.com/drive/folders/..."
                value={newDriveUrl}
                onChange={(e) => setNewDriveUrl(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono"
              />
            </div>
          </div>

          {/* Emails en copia (separados por coma) */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
              Emails en copia (se completa con emails separados por coma)
            </label>
            <input
              type="text"
              placeholder="ejemplo1@isf-argentina.org, coordinador@isf-argentina.org"
              value={newNotifyEmails}
              onChange={(e) => setNewNotifyEmails(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Personas que deben estar en copia exclusivamente cuando se envíe cualquier email relacionado con un movimiento en este centro de costos.
            </span>
          </div>

          {/* Auto-detected folder indicator badge */}
          {(newDriveFolder || folderAutoDetected) && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center space-x-2 text-emerald-900 font-medium truncate">
                <FolderCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Carpeta de Google Drive detectada: <strong className="text-emerald-950 font-bold">{newDriveFolder || folderAutoDetected}</strong>
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200/70 text-emerald-800 font-bold shrink-0">
                Automático
              </span>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              disabled={isSavingNew}
              onClick={() => setIsCreating(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!newName.trim() || isSavingNew}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center space-x-2 disabled:opacity-50"
            >
              {isSavingNew ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando en Firestore...</span>
                </>
              ) : (
                <span>Guardar Centro de Costos</span>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Search Toolbar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="relative max-w-sm w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nombre, sigla o link..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9.5 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
            />
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Mostrando {filteredCostCenters.length} de {costCenters.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase text-[11px] tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5 w-28">Sigla</th>
                <th className="px-5 py-3.5">Nombre del Centro de Costos</th>
                <th className="px-5 py-3.5">Emails en Copia (CC)</th>
                <th className="px-5 py-3.5">Carpeta / Link de Google Drive</th>
                <th className="px-5 py-3.5 text-right w-28">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCostCenters.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-xs">
                    No se encontraron centros de costos con los criterios de búsqueda.
                  </td>
                </tr>
              ) : (
                filteredCostCenters.map((cc, idx) => {
                  const isEditing = editingId === cc.id;
                  const driveUrl = cc.driveUrl || (cc.driveFolder ? `https://drive.google.com/drive/search?q=${encodeURIComponent(cc.driveFolder)}` : `https://drive.google.com/drive/search?q=${encodeURIComponent(cc.name)}`);
                  const notifyEmailsDisplay = cc.notifyEmails || cc.ccEmails;

                  return (
                    <tr key={cc.id ? `cc-row-${cc.id}` : `cc-row-${idx}`} className="hover:bg-slate-50/70 transition group">
                      
                      {/* Sigla */}
                      <td className="px-5 py-3.5 font-mono font-bold whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            maxLength={8}
                            value={editCode}
                            onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                            className="w-20 px-2 py-1 rounded-lg border border-indigo-300 font-mono text-xs uppercase bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="SIGLA"
                          />
                        ) : (
                          <button
                            onClick={() => copyToClipboard(cc.code, cc.id)}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-mono font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200/80 hover:bg-indigo-100 transition cursor-pointer"
                            title="Click para copiar sigla"
                          >
                            <span>{cc.code}</span>
                            {copiedCode === cc.id ? (
                              <Check className="w-3 h-3 ml-1 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3 ml-1 text-indigo-400 opacity-0 group-hover:opacity-100 transition" />
                            )}
                          </button>
                        )}
                      </td>

                      {/* Nombre */}
                      <td className="px-5 py-3.5 font-medium text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-1 rounded-lg border border-indigo-300 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        ) : (
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-slate-800">{cc.name}</span>
                          </div>
                        )}
                      </td>

                      {/* Emails en copia (CC) */}
                      <td className="px-5 py-3.5 text-slate-600">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editNotifyEmails}
                            onChange={(e) => setEditNotifyEmails(e.target.value)}
                            placeholder="email1@ejemplo.com, email2@ejemplo.com"
                            className="w-full px-2.5 py-1 rounded-lg border border-indigo-300 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-[11px]"
                          />
                        ) : (
                          notifyEmailsDisplay ? (
                            <span className="text-xs text-slate-700 font-mono bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 block truncate max-w-[200px]" title={notifyEmailsDisplay}>
                              {notifyEmailsDisplay}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Sin emails en copia</span>
                          )
                        )}
                      </td>

                      {/* Carpeta & Link Google Drive */}
                      <td className="px-5 py-3.5 text-slate-600">
                        {isEditing ? (
                          <div className="space-y-2 max-w-md">
                            <div>
                              <label className="block text-[10px] text-slate-500 font-medium mb-0.5 flex items-center justify-between">
                                <span className="flex items-center">
                                  <GoogleDriveIcon className="w-3 h-3 mr-1" />
                                  Link / URL de Google Drive:
                                </span>
                                {isEditLoadingFolderInfo && (
                                  <span className="text-[9px] text-indigo-600 font-semibold flex items-center">
                                    <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" />
                                    detectando...
                                  </span>
                                )}
                              </label>
                              <input
                                type="url"
                                value={editDriveUrl}
                                onChange={(e) => handleEditUrlChange(e.target.value)}
                                placeholder="https://drive.google.com/drive/folders/..."
                                className="w-full px-2.5 py-1 rounded-lg border border-indigo-300 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-[11px]"
                              />
                            </div>
                            {editDriveFolder && (
                              <div className="text-[11px] text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                                📁 Carpeta en Drive: <strong>{editDriveFolder}</strong>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2.5">
                            <span className="text-xs text-slate-700 font-medium truncate max-w-[220px]" title={cc.driveFolder || cc.name}>
                              {cc.driveFolder || `${cc.name} 2026`}
                            </span>
                            <GoogleDriveLinkButton url={driveUrl} />
                          </div>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              disabled={savingEditId === cc.id}
                              onClick={() => handleSaveEdit(cc)}
                              className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer disabled:opacity-50 flex items-center justify-center min-w-[28px] min-h-[28px]"
                              title="Guardar cambios"
                            >
                              {savingEditId === cc.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              disabled={savingEditId === cc.id}
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 transition cursor-pointer disabled:opacity-50"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={() => handleStartEdit(cc)}
                              className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                              title="Modificar sigla, nombre o link de Google Drive"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setCostCenterToDelete(cc)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                              title="Eliminar centro de costos"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

      {/* Delete Cost Center Confirmation Modal */}
      {costCenterToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">¿Eliminar centro de costos?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Estás por eliminar el centro de costos <strong className="text-slate-800">{costCenterToDelete.name}</strong> ({costCenterToDelete.code}).
              </p>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setCostCenterToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  if (costCenterToDelete) {
                    setIsDeleting(true);
                    try {
                      await onDeleteCostCenter(costCenterToDelete.id);
                      setCostCenterToDelete(null);
                    } catch (err: any) {
                      alert('Error al eliminar centro de costos de Firestore: ' + (err.message || err));
                    } finally {
                      setIsDeleting(false);
                    }
                  }
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <span>Sí, Eliminar</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
