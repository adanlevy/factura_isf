/**
 * Cotización del dólar para pasar a pesos los costos de las APIs (que se cobran en dólares).
 * Se usa el dólar oficial minorista del Banco Nación (venta), consultado en fuentes públicas
 * y guardado en memoria; se actualiza cada pocas horas. Si ninguna fuente responde, se usa el
 * último valor obtenido o, al arrancar, el valor de respaldo.
 */

export interface UsdArsRate {
  /** Pesos por dólar (venta) */
  rate: number;
  /** Fecha de la cotización según la fuente (ISO) */
  date: string;
  source: string;
  /** true si es el valor de respaldo (ninguna fuente respondió todavía) */
  isFallback: boolean;
  fetchedAt?: string;
}

/** Respaldo: dólar oficial Banco Nación, venta, al 26/10/2026 */
export const FALLBACK_USD_ARS_RATE: UsdArsRate = {
  rate: 1550,
  date: '2026-10-26',
  source: 'Valor de respaldo (dólar oficial Banco Nación, venta, 26/10/2026)',
  isFallback: true,
};

const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

interface RateSource {
  name: string;
  url: string;
  parse: (body: unknown) => { rate: number; date: string } | null;
}

const pickRate = (entry: any) => {
  if (!entry || typeof entry !== 'object') return null;
  const rate = Number(entry.venta ?? entry.promedio);
  const date = String(entry.fechaActualizacion || entry.fecha || new Date().toISOString());
  return { rate, date };
};

const SOURCES: RateSource[] = [
  {
    name: 'DolarApi.com (dólar oficial Banco Nación, venta)',
    url: 'https://dolarapi.com/v1/dolares/oficial',
    parse: (body) => pickRate(body),
  },
  {
    // Histórico diario del mismo dato: se toma el último registro
    name: 'ArgentinaDatos (dólar oficial, venta)',
    url: 'https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial',
    parse: (body) => (Array.isArray(body) && body.length > 0 ? pickRate(body[body.length - 1]) : null),
  },
];

/** Descarta valores absurdos (respuesta rota o en otra unidad) */
const isPlausibleRate = (rate: number) => Number.isFinite(rate) && rate >= 100 && rate <= 100_000;

let current: UsdArsRate = { ...FALLBACK_USD_ARS_RATE };
let refreshing: Promise<UsdArsRate> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export function getUsdArsRate(): UsdArsRate {
  return current;
}

/** Pesos por dólar vigentes (para los cálculos) */
export function getUsdArsRateValue(): number {
  return current.rate;
}

async function fetchFromSource(source: RateSource): Promise<UsdArsRate | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(source.url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = source.parse(await response.json());
    if (!parsed || !isPlausibleRate(parsed.rate)) throw new Error('respuesta sin una cotización válida');
    return {
      rate: Number(parsed.rate.toFixed(2)),
      date: parsed.date,
      source: source.name,
      isFallback: false,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn(`[cotización] ${source.name}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Consulta las fuentes en orden; si ninguna responde, conserva el último valor */
export function refreshUsdArsRate(): Promise<UsdArsRate> {
  if (!refreshing) {
    refreshing = (async () => {
      for (const source of SOURCES) {
        const result = await fetchFromSource(source);
        if (result) {
          current = result;
          console.log(`[cotización] 1 USD = $ ${result.rate} (${result.source}, ${result.date})`);
          return current;
        }
      }
      return current;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/** Primera consulta al arrancar y luego cada pocas horas */
export function startUsdArsRateUpdates(): void {
  if (timer) return;
  void refreshUsdArsRate();
  timer = setInterval(() => void refreshUsdArsRate(), REFRESH_INTERVAL_MS);
  timer.unref?.();
}
