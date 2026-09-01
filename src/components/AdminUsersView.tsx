import React, { useState } from 'react';
import {
  Shield,
  ShieldCheck,
  User,
  UserPlus,
  Trash2,
  Search,
  CheckCircle2,
  Mail,
  Info,
  Clock,
  Sparkles,
  Lock,
  UserCheck,
} from 'lucide-react';
import { AppUserRecord, UserProfile } from '../types';

interface AdminUsersViewProps {
  users: AppUserRecord[];
  currentUser: UserProfile;
  onAddUser: (user: AppUserRecord) => void;
  onUpdateUserRole: (email: string, newRole: 'admin' | 'user') => void;
  onToggleCcAllOutgoingEmails?: (email: string, ccAll: boolean) => void;
  onDeleteUser: (email: string) => void;
}

export function AdminUsersView({
  users,
  currentUser,
  onAddUser,
  onUpdateUserRole,
  onToggleCcAllOutgoingEmails,
  onDeleteUser,
}: AdminUsersViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('admin');
  const [newCcAllOutgoing, setNewCcAllOutgoing] = useState(false);
  const [newNotes, setNewNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<AppUserRecord | null>(null);

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase().trim();
    return (
      (u.name || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term) ||
      (u.notes || '').toLowerCase().includes(term)
    );
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = newEmail.toLowerCase().trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Por favor ingresa una dirección de correo válida.');
      return;
    }

    if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      setErrorMsg('Este correo ya se encuentra registrado. Puedes modificar su rol directamente en la tabla.');
      return;
    }

    const calculatedName = newName.trim() || cleanEmail.split('@')[0];

    onAddUser({
      email: cleanEmail,
      name: calculatedName,
      role: newRole,
      ccAllOutgoingEmails: newCcAllOutgoing,
      notes: newNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
      addedBy: currentUser.email,
    });

    // Reset form
    setNewEmail('');
    setNewName('');
    setNewRole('admin');
    setNewCcAllOutgoing(false);
    setNewNotes('');
    setIsAddingUser(false);
  };

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const collaboratorCount = users.filter((u) => u.role === 'user').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header & Stats Banner */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Gestión de Usuarios y Administradores</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Control de roles y permisos con sincronización en tiempo real en Firestore
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          {/* Quick Metrics */}
          <div className="flex items-center space-x-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 text-xs">
            <span className="px-2.5 py-1 rounded-xl bg-indigo-100 text-indigo-800 font-bold flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" />
              {adminCount} Admin{adminCount !== 1 ? 's' : ''}
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-slate-200 text-slate-700 font-semibold flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {collaboratorCount} Colaborador{collaboratorCount !== 1 ? 'es' : ''}
            </span>
          </div>

          <button
            type="button"
            id="btn-add-user"
            onClick={() => setIsAddingUser(!isAddingUser)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-2xl transition cursor-pointer shadow-xs flex items-center gap-2 shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>{isAddingUser ? 'Cerrar Formulario' : 'Habilitar Usuario / Admin'}</span>
          </button>
        </div>
      </div>

      {/* Add User / Admin Collapsible Card */}
      {isAddingUser && (
        <form
          onSubmit={handleAddSubmit}
          className="bg-white rounded-3xl p-6 border-2 border-indigo-200 shadow-lg space-y-4 animate-in fade-in slide-in-from-top-3 duration-200"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-600" />
              <span>Habilitar Nuevo Usuario o Administrador</span>
            </h3>
            <span className="text-[11px] text-slate-400">Guardado directo en Firestore</span>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                Correo Electrónico (Google) *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  placeholder="ejemplo@isf-argentina.org"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Cuenta de Google con la que iniciará sesión
              </span>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                Nombre y Apellido (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Laura Gómez"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Se actualizará automáticamente cuando ingrese
              </span>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                Rol Asignado *
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden cursor-pointer font-bold text-slate-800"
              >
                <option value="admin">🛡️ Administrador / Finanzas (Acceso Total)</option>
                <option value="user">👤 Colaborador / Rendidor (Carga de Gastos)</option>
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Define las vistas y acciones permitidas
              </span>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
              Notas o Cargo (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Tesorera regional, Coordinación de Proyecto Chaco, etc."
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
            />
          </div>

          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl flex items-start space-x-3">
            <input
              type="checkbox"
              id="new-user-cc-all"
              checked={newCcAllOutgoing}
              onChange={(e) => setNewCcAllOutgoing(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
            />
            <label htmlFor="new-user-cc-all" className="text-xs text-slate-800 cursor-pointer select-none">
              <span className="font-bold text-indigo-950 block">Poner en copia en emails salientes</span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Si se marca, se enviará copia (CC) a este usuario en todo correo saliente generado por la plataforma (resúmenes de comprobantes, solicitudes bancarias, confirmaciones de pago y certificados).
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingUser(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
            >
              Guardar Usuario en Firestore
            </button>
          </div>
        </form>
      )}

      {/* Explanatory Info Card */}
      <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 text-xs text-indigo-950 flex items-start gap-3">
        <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">¿Cómo funciona el acceso de usuarios y administradores?</p>
          <p className="text-[11px] text-indigo-800 leading-relaxed">
            Cuando cualquier miembro del equipo ingresa con su cuenta de Google, la aplicación consulta esta lista en tiempo real.
            Los usuarios con rol <strong>Administrador</strong> tienen acceso completo a la pestaña de <em>Gestión de Pagos, Proveedores, Categorías, Centros de Costo</em> y a este panel.
            Los usuarios con rol <strong>Colaborador</strong> acceden exclusivamente a cargar sus comprobantes y ver el estado de sus reintegros.
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, correo o notas..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
          />
        </div>
        <span className="text-xs text-slate-500 shrink-0 font-medium">
          {filteredUsers.length} usuario{filteredUsers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4 sm:px-6">Usuario / Correo</th>
                <th className="py-3.5 px-4">Rol en Factura ISF</th>
                <th className="py-3.5 px-4 text-center">CC en Emails Salientes</th>
                <th className="py-3.5 px-4 hidden md:table-cell">Detalles / Cargo</th>
                <th className="py-3.5 px-4 hidden sm:table-cell">Registrado</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredUsers.map((user) => {
                const isCurrent = user.email.toLowerCase() === currentUser.email.toLowerCase();
                const isAdmin = user.role === 'admin';
                const isCcAll = Boolean(user.ccAllOutgoingEmails);

                return (
                  <tr key={user.email} className="hover:bg-slate-50/60 transition-colors">
                    
                    {/* User info */}
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 shrink-0 overflow-hidden">
                          {user.picture ? (
                            <img
                              src={user.picture}
                              alt={user.name}
                              className="w-9 h-9 rounded-xl object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                            <span>{user.name || user.email.split('@')[0]}</span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                                Tu sesión
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate">{user.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role Pill & Switcher */}
                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                        <button
                          type="button"
                          onClick={() => onUpdateUserRole(user.email, 'admin')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                            isAdmin
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                          title="Habilitar como Administrador / Finanzas"
                        >
                          <Shield className="w-3 h-3" />
                          <span>Admin</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateUserRole(user.email, 'user')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                            !isAdmin
                              ? 'bg-white text-slate-800 shadow-xs border border-slate-200'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                          title="Asignar como Colaborador / Rendidor"
                        >
                          <User className="w-3 h-3" />
                          <span>Colaborador</span>
                        </button>
                      </div>
                    </td>

                    {/* CC in outgoing emails checkbox / toggle */}
                    <td className="py-3.5 px-4 text-center">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none px-2.5 py-1 rounded-xl hover:bg-slate-100 transition">
                        <input
                          type="checkbox"
                          checked={isCcAll}
                          onChange={(e) => {
                            if (onToggleCcAllOutgoingEmails) {
                              onToggleCcAllOutgoingEmails(user.email, e.target.checked);
                            }
                          }}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className={`text-[11px] font-semibold ${isCcAll ? 'text-indigo-700 font-bold' : 'text-slate-400'}`}>
                          {isCcAll ? 'En copia (CC)' : 'No'}
                        </span>
                      </label>
                    </td>

                    {/* Notes */}
                    <td className="py-3.5 px-4 hidden md:table-cell text-slate-600">
                      {user.notes ? (
                        <span className="text-xs">{user.notes}</span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Sin notas</span>
                      )}
                    </td>

                    {/* Timestamp */}
                    <td className="py-3.5 px-4 hidden sm:table-cell text-slate-500 text-[11px]">
                      {user.createdAt ? (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{new Date(user.createdAt).toLocaleDateString('es-AR')}</span>
                        </div>
                      ) : (
                        <span>Automático</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      {isCurrent ? (
                        <span className="text-[10px] text-slate-400 font-semibold">Activo</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setUserToDelete(user)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                          title="Eliminar usuario"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>

                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                      <Search className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-semibold">No se encontraron usuarios que coincidan con la búsqueda</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">¿Eliminar acceso de usuario?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Estás por quitar los permisos y el rol asignado a{' '}
                <strong className="text-slate-800">{userToDelete.name || userToDelete.email}</strong> (
                <span className="font-mono text-slate-600">{userToDelete.email}</span>).
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-600 border border-slate-200">
              <span className="font-semibold block text-slate-700">Efecto:</span>
              El registro se removerá de Firestore. Si la persona vuelve a ingresar con Google, accederá como colaborador sin privilegios administrativos.
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (userToDelete) {
                    onDeleteUser(userToDelete.email);
                    setUserToDelete(null);
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
