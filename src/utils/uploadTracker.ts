import { useEffect, useState } from 'react';

/**
 * Subidas de facturas/tickets a Drive en curso en esta pestaña: alimenta la barra de progreso
 * y la advertencia del navegador si se intenta cerrar la app antes de que terminen.
 */
export type UploadPhase = 'sending' | 'saving' | 'done' | 'error';

export interface UploadEntry {
  id: string;
  label: string;
  /** Bytes enviados al servidor y total (0 si el navegador no lo informa) */
  loaded: number;
  total: number;
  /** sending: se está enviando el archivo; saving: el servidor lo está guardando en Drive */
  phase: UploadPhase;
  error?: string;
}

const entries = new Map<string, UploadEntry>();
const listeners = new Set<(list: UploadEntry[]) => void>();
const removeTimers = new Map<string, number>();

const snapshot = () => Array.from(entries.values());
const emit = () => {
  const list = snapshot();
  listeners.forEach((listener) => listener(list));
};

export function startUpload(id: string, label: string): void {
  const timer = removeTimers.get(id);
  if (timer) window.clearTimeout(timer);
  entries.set(id, { id, label, loaded: 0, total: 0, phase: 'sending' });
  emit();
}

export function updateUploadProgress(id: string, loaded: number, total: number): void {
  const entry = entries.get(id);
  if (!entry) return;
  const sentAll = total > 0 && loaded >= total;
  entries.set(id, { ...entry, loaded, total, phase: sentAll ? 'saving' : 'sending' });
  emit();
}

export function finishUpload(id: string, ok: boolean, error?: string): void {
  const entry = entries.get(id);
  if (!entry) return;
  entries.set(id, { ...entry, phase: ok ? 'done' : 'error', error, loaded: entry.total, total: entry.total });
  emit();
  // Lo terminado se ve un momento y desaparece (un error queda un poco más)
  removeTimers.set(
    id,
    window.setTimeout(() => {
      entries.delete(id);
      removeTimers.delete(id);
      emit();
    }, ok ? 4000 : 12000)
  );
}

export function dismissUpload(id: string): void {
  entries.delete(id);
  emit();
}

/** ¿Hay alguna subida sin terminar en esta pestaña? */
export function hasActiveUploads(): boolean {
  return snapshot().some((e) => e.phase === 'sending' || e.phase === 'saving');
}

export function isUploadActive(id: string): boolean {
  const entry = entries.get(id);
  return Boolean(entry && (entry.phase === 'sending' || entry.phase === 'saving'));
}

export function useUploads(): UploadEntry[] {
  const [list, setList] = useState<UploadEntry[]>(snapshot);
  useEffect(() => {
    listeners.add(setList);
    setList(snapshot());
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}

// Si se intenta cerrar o recargar la pestaña con subidas en curso, el navegador pide confirmación.
// (En celulares muchos navegadores no muestran este aviso: por eso también está la barra visible
// y el reintento automático al volver a abrir la app.)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    if (!hasActiveUploads()) return;
    event.preventDefault();
    event.returnValue = '';
  });
}
