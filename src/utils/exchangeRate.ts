import { useEffect, useState } from 'react';
import { authFetch } from './authFetch';

/**
 * Cotización del dólar (oficial Banco Nación, venta) con la que se pasan a pesos los costos de las APIs.
 * La consulta el servidor en fuentes públicas y la renueva cada pocas horas; acá se pide una vez por sesión.
 */
export interface ExchangeRateInfo {
  rate: number;
  date: string;
  source: string;
  isFallback: boolean;
  fetchedAt?: string;
}

/** Respaldo hasta que responda el servidor: dólar oficial Banco Nación, venta, al 26/10/2026 */
export const FALLBACK_EXCHANGE_RATE: ExchangeRateInfo = {
  rate: 1550,
  date: '2026-10-26',
  source: 'Valor de respaldo (dólar oficial Banco Nación, venta, 26/10/2026)',
  isFallback: true,
};

let current: ExchangeRateInfo = FALLBACK_EXCHANGE_RATE;
let loading: Promise<ExchangeRateInfo> | null = null;
const listeners = new Set<(info: ExchangeRateInfo) => void>();

/** Pesos por dólar vigentes */
export function getArsExchangeRate(): number {
  return current.rate;
}

export function getExchangeRateInfo(): ExchangeRateInfo {
  return current;
}

export function loadExchangeRate(): Promise<ExchangeRateInfo> {
  if (!loading) {
    loading = (async () => {
      try {
        const response = await authFetch('/api/exchange-rate');
        if (response.ok) {
          const data = (await response.json()) as Partial<ExchangeRateInfo>;
          const rate = Number(data.rate);
          if (Number.isFinite(rate) && rate > 0) {
            current = {
              rate,
              date: String(data.date || ''),
              source: String(data.source || ''),
              isFallback: Boolean(data.isFallback),
              fetchedAt: data.fetchedAt,
            };
            listeners.forEach((listener) => listener(current));
          }
        }
      } catch {
        // Sin conexión con el servidor: se sigue con el respaldo
      }
      // Si todavía es el respaldo, se vuelve a intentar la próxima vez que se pida
      if (current.isFallback) loading = null;
      return current;
    })();
  }
  return loading;
}

/** Cotización vigente; la pide al servidor la primera vez y se actualiza cuando llega */
export function useExchangeRate(): ExchangeRateInfo {
  const [info, setInfo] = useState(current);
  useEffect(() => {
    listeners.add(setInfo);
    setInfo(current);
    void loadExchangeRate();
    return () => {
      listeners.delete(setInfo);
    };
  }, []);
  return info;
}

/** "26/10/2026" a partir de la fecha de la fuente */
export function formatExchangeRateDate(info: ExchangeRateInfo): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(info.date || '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}
