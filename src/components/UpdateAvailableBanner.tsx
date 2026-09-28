import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { APP_VERSION } from '../version';

// Cada cuánto se consulta la versión publicada, y el mínimo entre consultas al volver a la pestaña
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;
// "Más tarde" oculta el aviso por este tiempo (se vuelve a mostrar si sigue desactualizada)
const SNOOZE_MS = 30 * 60 * 1000;
const SNOOZE_KEY = 'isf_update_snoozed_until';

/** Compara versiones "x.y.z": > 0 si a es más nueva que b. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function readSnooze(): number {
  try {
    return Number(sessionStorage.getItem(SNOOZE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Aviso de nueva versión: consulta /api/version y, si la publicada es más nueva que la que
 * tiene cargada el navegador, ofrece recargar para pasar a la nueva.
 */
export function UpdateAvailableBanner() {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState<number>(readSnooze);
  const lastCheckRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const now = Date.now();
      if (now - lastCheckRef.current < MIN_GAP_MS) return;
      lastCheckRef.current = now;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data?.version === 'string' && compareVersions(data.version, APP_VERSION) > 0) {
          setLatestVersion(data.version);
        }
      } catch {
        // Sin conexión o servidor reiniciando: se reintenta en la próxima consulta
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    const firstCheck = window.setTimeout(check, 5000);
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  if (!latestVersion || Date.now() < snoozedUntil) return null;

  const handleSnooze = () => {
    const until = Date.now() + SNOOZE_MS;
    setSnoozedUntil(until);
    try {
      sessionStorage.setItem(SNOOZE_KEY, String(until));
    } catch {
      // Sin almacenamiento disponible: el aviso se oculta solo en esta pantalla
    }
  };

  return (
    <div
      role="alert"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-xl bg-indigo-700 text-white rounded-2xl shadow-2xl border border-indigo-500 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 animate-in fade-in slide-in-from-top-3 duration-200"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <RefreshCw className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm leading-snug">
          <p className="font-bold">Hay una versión nueva de la aplicación (v{latestVersion})</p>
          <p className="text-indigo-100">
            Estás usando la v{APP_VERSION}. Guardá lo que estés cargando y actualizá para usar la última versión.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        <button
          type="button"
          onClick={handleSnooze}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-100 hover:bg-indigo-600 transition-colors flex items-center gap-1"
        >
          <X className="w-3.5 h-3.5" />
          Más tarde
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-indigo-700 hover:bg-indigo-50 transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar ahora
        </button>
      </div>
    </div>
  );
}
