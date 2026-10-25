import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bot, Check, CheckCircle2, Loader2, PlugZap, Sparkles, XCircle } from 'lucide-react';
import {
  AiOcrSettings,
  CLAUDE_OCR_MODELS,
  GEMINI_OCR_MODEL,
  OcrProvider,
  TYPICAL_RECEIPT_TOKENS,
  estimateCostPerReceipt,
  findClaudeModel,
  normalizeAiOcrSettings,
} from '../utils/aiModels';
import { saveAiOcrSettings } from '../utils/aiSettings';
import { authFetch } from '../utils/authFetch';
import { ARS_EXCHANGE_RATE } from '../utils/apiUsageLogger';

interface AiEngineSettingsCardProps {
  settings: AiOcrSettings;
}

const usd = (value: number) => `US$ ${value < 0.01 ? value.toFixed(4) : value.toFixed(3)}`;
const ars = (value: number) => `$ ${(value * ARS_EXCHANGE_RATE).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

/**
 * Sistema → motor de IA que lee comprobantes y constancias: Gemini (por defecto) o Claude con el modelo elegido.
 * Incluye la tabla de costos para comparar.
 */
export function AiEngineSettingsCard({ settings }: AiEngineSettingsCardProps) {
  const [provider, setProvider] = useState<OcrProvider>(settings.ocrProvider);
  const [claudeModel, setClaudeModel] = useState(settings.claudeModel);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [claudeConfigured, setClaudeConfigured] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Llamada mínima a Claude con el modelo elegido: confirma clave, saldo y acceso, o muestra el error exacto
  const handleTestClaude = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await authFetch('/api/ai/test-claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: claudeModel }),
      });
      const data = await res.json().catch(() => null);
      setTestResult(
        data && typeof data.message === 'string'
          ? { ok: Boolean(data.ok), message: data.message }
          : { ok: false, message: `El servidor respondió ${res.status}.` }
      );
    } catch {
      setTestResult({ ok: false, message: 'No se pudo contactar al servidor.' });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    setProvider(settings.ocrProvider);
    setClaudeModel(settings.claudeModel);
  }, [settings.ocrProvider, settings.claudeModel]);

  useEffect(() => {
    let cancelled = false;
    authFetch('/api/ai/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setClaudeConfigured(data ? Boolean(data.claude?.configured) : null);
      })
      .catch(() => !cancelled && setClaudeConfigured(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = provider !== settings.ocrProvider || (provider === 'claude' && claudeModel !== settings.claudeModel);
  const activeLabel =
    settings.ocrProvider === 'claude' ? findClaudeModel(settings.claudeModel)?.label || 'Claude' : GEMINI_OCR_MODEL.label;

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    const result = await saveAiOcrSettings(normalizeAiOcrSettings({ ocrProvider: provider, claudeModel }));
    setSaving(false);
    setFeedback(
      result.ok
        ? { ok: true, text: 'Guardado. Las próximas lecturas usan el motor elegido.' }
        : { ok: false, text: result.error || 'No se pudo guardar.' }
    );
  };

  const allModels = [GEMINI_OCR_MODEL, ...CLAUDE_OCR_MODELS];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-600" />
            Motor de IA para leer comprobantes
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Se usa al cargar comprobantes y al leer constancias de proveedores. Activo ahora: <strong>{activeLabel}</strong>.
          </p>
        </div>
      </div>

      {/* Proveedor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(['gemini', 'claude'] as OcrProvider[]).map((p) => {
          const selected = provider === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={`text-left p-3.5 rounded-xl border-2 transition cursor-pointer ${
                selected ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">
                  {p === 'gemini' ? 'Google Gemini' : 'Anthropic Claude'}
                </span>
                {selected && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
              </div>
              <p className="text-[11.5px] text-slate-500 mt-1">
                {p === 'gemini'
                  ? `${GEMINI_OCR_MODEL.label} · opción por defecto.`
                  : 'Elegís el modelo abajo. Si Claude no responde, la lectura sigue con Gemini.'}
              </p>
            </button>
          );
        })}
      </div>

      {/* Modelo de Claude */}
      {provider === 'claude' && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-700">Modelo de Claude</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {CLAUDE_OCR_MODELS.map((m) => {
              const selected = claudeModel === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setClaudeModel(m.id)}
                  className={`text-left p-3 rounded-xl border transition cursor-pointer ${
                    selected ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-slate-900">{m.label}</span>
                    {selected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">{m.description}</p>
                  <p className="text-[10.5px] font-mono text-indigo-700 mt-1.5">
                    ${m.inputPerMTok} in / ${m.outputPerMTok} out × 1M · ≈ {usd(estimateCostPerReceipt(m))} por comprobante
                  </p>
                </button>
              );
            })}
          </div>
          {claudeConfigured === false && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                El servidor todavía no tiene la clave de Claude (<code className="font-mono">ANTHROPIC_API_KEY</code>). Podés dejarlo
                elegido: mientras falte la clave, las lecturas se hacen con Gemini.
              </span>
            </p>
          )}
          {claudeConfigured === true && (
            <p className="text-xs text-emerald-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Clave de Claude configurada en el servidor.
            </p>
          )}
          <div className="flex flex-wrap items-start gap-2 pt-1">
            <button
              type="button"
              disabled={testing}
              onClick={handleTestClaude}
              className="px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs font-semibold cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlugZap className="w-3.5 h-3.5" />}
              Probar conexión con Claude
            </button>
            {testResult && (
              <p
                className={`flex-1 min-w-[220px] text-xs rounded-lg px-2.5 py-1.5 border flex items-start gap-1.5 break-words ${
                  testResult.ok
                    ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                    : 'text-rose-800 bg-rose-50 border-rose-200'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {feedback && (
          <span className={`text-xs font-semibold ${feedback.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{feedback.text}</span>
        )}
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={handleSave}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Guardar motor de IA
        </button>
      </div>

      {/* Tabla de costos */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Costos por modelo (tarifas oficiales, USD por millón de tokens)
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs min-w-[560px]">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">Modelo</th>
                <th className="text-right px-3 py-2">Entrada</th>
                <th className="text-right px-3 py-2">Salida</th>
                <th className="text-right px-3 py-2">≈ Por comprobante</th>
                <th className="text-right px-3 py-2">≈ 100 comprobantes</th>
              </tr>
            </thead>
            <tbody>
              {allModels.map((m) => {
                const perReceipt = estimateCostPerReceipt(m);
                const isActive =
                  (settings.ocrProvider === 'gemini' && m.provider === 'gemini') ||
                  (settings.ocrProvider === 'claude' && m.id === settings.claudeModel);
                return (
                  <tr key={m.id} className={`border-t border-slate-100 ${isActive ? 'bg-indigo-50/50' : ''}`}>
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      {m.label}
                      {isActive && (
                        <span className="ml-1.5 text-[10px] font-bold text-indigo-700 bg-indigo-100 rounded px-1.5 py-0.5">En uso</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">${m.inputPerMTok.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">${m.outputPerMTok.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {usd(perReceipt)}
                      <span className="block text-[10px] text-slate-400">{ars(perReceipt)}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {usd(perReceipt * 100)}
                      <span className="block text-[10px] text-slate-400">{ars(perReceipt * 100)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Estimación con un comprobante típico (foto o PDF de 1 página): ~{TYPICAL_RECEIPT_TOKENS.input.toLocaleString('es-AR')} tokens de
          entrada y ~{TYPICAL_RECEIPT_TOKENS.output.toLocaleString('es-AR')} de salida; en pesos, a {ARS_EXCHANGE_RATE.toLocaleString('es-AR')}{' '}
          $/USD. El costo real de cada lectura queda en el registro de consumo de abajo.
        </p>
      </div>
    </div>
  );
}
