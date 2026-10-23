import React, { useState } from 'react';
import { AlertTriangle, Check, Clock, Edit3, Inbox, Loader2, MessageSquare, UserPlus, X } from 'lucide-react';
import { Vendor, VendorChangeRequest } from '../types';
import { formatCuit } from '../utils/helpers';
import {
  VENDOR_FIELD_LABELS,
  SENSITIVE_VENDOR_FIELDS,
  getVendorFieldValue,
  applyVendorChangeRequest,
  vendorChangedSinceRequest,
} from '../utils/vendorChanges';
import { VendorFormModal } from './VendorFormModal';

interface VendorChangeRequestsPanelProps {
  requests: VendorChangeRequest[];
  vendors: Vendor[];
  onApprove: (request: VendorChangeRequest, editedVendor?: Vendor) => Promise<boolean>;
  onReject: (request: VendorChangeRequest, reason: string, deleteVendor?: boolean) => Promise<boolean>;
}

const formatWhen = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
};

const displayValue = (field: string, value: string) =>
  value && (field === 'cuit' || field === 'bankDetails.cuitCuil') ? formatCuit(value) : value;

/**
 * Administración: pedidos de cambio de proveedores hechos por Colaboradores y altas nuevas para revisar.
 * Cada tarjeta muestra solo lo que cambia (antes → pedido) y permite aprobar, corregir y aprobar, o rechazar.
 */
export function VendorChangeRequestsPanel({ requests, vendors, onApprove, onReject }: VendorChangeRequestsPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectDeleteVendor, setRejectDeleteVendor] = useState(false);
  const [editing, setEditing] = useState<{ request: VendorChangeRequest; vendor: Vendor } | null>(null);

  if (requests.length === 0) return null;

  const run = async (id: string, action: () => Promise<boolean>) => {
    setBusyId(id);
    try {
      return await action();
    } finally {
      setBusyId(null);
    }
  };

  const startReject = (request: VendorChangeRequest) => {
    setRejectingId(request.id);
    setRejectReason('');
    setRejectDeleteVendor(false);
  };

  return (
    <div className="bg-amber-50/60 border border-amber-200 rounded-3xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Inbox className="w-5 h-5 text-amber-700" />
        <h3 className="text-sm sm:text-base font-black text-amber-950">
          Pendientes de revisión ({requests.length})
        </h3>
      </div>
      <p className="text-xs text-amber-900/80 -mt-1">
        Cambios que pidieron los colaboradores y proveedores nuevos que cargaron. Nada de esto modifica el catálogo hasta que lo apruebes.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {requests.map((request) => {
          const current = vendors.find((v) => v.id === request.vendorId);
          const isNew = request.type === 'NEW_VENDOR';
          const changedSince = vendorChangedSinceRequest(current, request);
          const busy = busyId === request.id;
          const who = request.requestedByName || request.requestedByEmail;
          const newVendorRows = isNew
            ? ['name', 'cuit', 'bankDetails.cbuCvu', 'bankDetails.alias', 'bankDetails.bankName', 'notes'].filter((f) =>
                getVendorFieldValue(request.proposed, f)
              )
            : [];

          return (
            <div key={request.id} className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isNew ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5">
                        <UserPlus className="w-3 h-3" /> Alta nueva para revisar
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-md px-1.5 py-0.5">
                        <Edit3 className="w-3 h-3" /> Pedido de cambio
                      </span>
                    )}
                    {request.bankChanged && !isNew && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5">
                        <AlertTriangle className="w-3 h-3" /> Cambia la cuenta bancaria
                      </span>
                    )}
                  </div>
                  <h4 className="font-extrabold text-slate-900 text-sm mt-1 truncate" title={request.vendorName}>
                    {current?.name || request.vendorName}
                  </h4>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {who} · {formatWhen(request.updatedAt || request.requestedAt)}
                  </p>
                </div>
              </div>

              {request.comment && (
                <p className="text-xs text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-xl px-2.5 py-1.5 flex items-start gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{request.comment}</span>
                </p>
              )}

              {!current && (
                <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1.5">
                  Este proveedor ya no está en el catálogo. Rechazá el pedido para cerrarlo.
                </p>
              )}
              {changedSince && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>El proveedor se modificó después de este pedido: revisá que el cambio siga teniendo sentido.</span>
                </p>
              )}

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-[11.5px]">
                  <tbody>
                    {isNew
                      ? newVendorRows.map((field) => (
                          <tr key={field} className="border-b border-slate-100 last:border-0">
                            <td className="px-2.5 py-1.5 text-slate-500 font-semibold bg-slate-50 w-[38%]">
                              {VENDOR_FIELD_LABELS[field] || field}
                            </td>
                            <td className="px-2.5 py-1.5 font-bold text-slate-900 break-all">
                              {displayValue(field, getVendorFieldValue(request.proposed, field))}
                            </td>
                          </tr>
                        ))
                      : request.changedFields.map((field) => {
                          const before = displayValue(field, getVendorFieldValue(request.before, field));
                          const after = displayValue(field, getVendorFieldValue(request.proposed, field));
                          const sensitive = SENSITIVE_VENDOR_FIELDS.includes(field);
                          return (
                            <tr key={field} className="border-b border-slate-100 last:border-0">
                              <td className="px-2.5 py-1.5 text-slate-500 font-semibold bg-slate-50 w-[30%]">
                                {VENDOR_FIELD_LABELS[field] || field}
                              </td>
                              <td className="px-2.5 py-1.5 text-slate-400 line-through break-all">{before || '—'}</td>
                              <td className={`px-2.5 py-1.5 font-bold break-all ${sensitive ? 'text-rose-700' : 'text-slate-900'}`}>
                                {after || '—'}
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>

              {rejectingId === request.id ? (
                <div className="space-y-2 bg-rose-50/60 border border-rose-200 rounded-xl p-2.5">
                  <label className="block text-[11px] font-bold text-rose-900">Motivo del rechazo (le llega por correo)</label>
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Ej: el CBU no coincide con la constancia del proveedor"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-rose-200 text-xs bg-white focus:ring-2 focus:ring-rose-400 outline-hidden"
                  />
                  {isNew && current && (
                    <label className="flex items-center gap-1.5 text-[11px] text-rose-900">
                      <input
                        type="checkbox"
                        checked={rejectDeleteVendor}
                        onChange={(e) => setRejectDeleteVendor(e.target.checked)}
                      />
                      Eliminar también el proveedor del catálogo
                    </label>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setRejectingId(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white cursor-pointer"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      disabled={busy || !rejectReason.trim()}
                      onClick={async () => {
                        const ok = await run(request.id, () => onReject(request, rejectReason, rejectDeleteVendor));
                        if (ok) setRejectingId(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer flex items-center gap-1"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      Rechazar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-2 pt-0.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startReject(request)}
                    className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Rechazar
                  </button>
                  {current && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setEditing({ request, vendor: isNew ? current : applyVendorChangeRequest(current, request) })
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Editar y aprobar
                    </button>
                  )}
                  {current && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(request.id, () => onApprove(request))}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer flex items-center gap-1"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      {isNew ? 'Marcar revisado' : 'Aprobar'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <VendorFormModal
        isOpen={Boolean(editing)}
        existingVendors={vendors}
        title={editing?.request.type === 'NEW_VENDOR' ? 'Revisar proveedor nuevo' : 'Corregir y aprobar el cambio'}
        subtitle={`Pedido de ${editing?.request.requestedByName || editing?.request.requestedByEmail || ''}: al guardar se aplica y se aprueba`}
        initialData={editing?.vendor || null}
        onClose={() => setEditing(null)}
        onSave={async (saved) => {
          if (!editing) return;
          const { request, vendor } = editing;
          const ok = await run(request.id, () => onApprove(request, { ...vendor, ...saved, id: vendor.id }));
          if (!ok) throw new Error('No se pudo aprobar el pedido.');
          setEditing(null);
        }}
      />
    </div>
  );
}
