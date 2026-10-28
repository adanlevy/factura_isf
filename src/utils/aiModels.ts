/**
 * Motores de IA para la lectura de comprobantes (OCR): modelos disponibles y precios.
 * Lo usan el servidor (para calcular el costo de cada llamada) y la pestaña Sistema (selector y tabla).
 * Precios en USD por millón de tokens, tarifas de las APIs oficiales.
 */

export type OcrProvider = 'gemini' | 'claude';

export interface AiModelInfo {
  id: string;
  provider: OcrProvider;
  label: string;
  inputPerMTok: number;
  outputPerMTok: number;
  /** Nivel de esfuerzo (razonamiento) que se envía a Claude: el valor por defecto de cada modelo */
  effort?: 'low' | 'medium' | 'high';
  /** El modelo admite el respaldo automático de Anthropic si declina un pedido */
  supportsServerFallback?: boolean;
  description: string;
}

export const GEMINI_OCR_MODEL: AiModelInfo = {
  id: 'gemini-3.7-flash',
  provider: 'gemini',
  label: 'Gemini 3.7 Flash',
  inputPerMTok: 0.75,
  outputPerMTok: 3.75,
  description: 'Motor actual (Google). Rápido y económico.',
};

export const CLAUDE_OCR_MODELS: AiModelInfo[] = [
  {
    id: 'claude-opus-5-5',
    provider: 'claude',
    label: 'Claude Opus 5.5',
    inputPerMTok: 4,
    outputPerMTok: 20,
    effort: 'medium',
    supportsServerFallback: true,
    description: 'El más capaz de la familia Opus: mejor para facturas/tickets difíciles (fotos borrosas, manuscritos).',
  },
  {
    id: 'claude-sonnet-5-5',
    provider: 'claude',
    label: 'Claude Sonnet 5.5',
    inputPerMTok: 2,
    outputPerMTok: 10,
    effort: 'high',
    supportsServerFallback: true,
    description: 'Equilibrio entre precisión, velocidad y costo.',
  },
  {
    id: 'claude-haiku-5-5',
    provider: 'claude',
    label: 'Claude Haiku 5.5',
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    effort: 'medium',
    description: 'El más rápido y económico (tarifa para pedidos de hasta 100K tokens, que cubre cualquier factura/ticket).',
  },
];

export const DEFAULT_CLAUDE_OCR_MODEL = 'claude-opus-5-5';

/** Ajuste guardado en Firestore (app_settings/ai): qué motor lee los comprobantes */
export interface AiOcrSettings {
  ocrProvider: OcrProvider;
  claudeModel: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_AI_OCR_SETTINGS: AiOcrSettings = {
  ocrProvider: 'gemini',
  claudeModel: DEFAULT_CLAUDE_OCR_MODEL,
};

export function findClaudeModel(id?: string | null): AiModelInfo | undefined {
  return CLAUDE_OCR_MODELS.find((m) => m.id === id);
}

/** Normaliza lo que viene de Firestore o del pedido: proveedor y modelo siempre válidos */
export function normalizeAiOcrSettings(raw?: Partial<AiOcrSettings> | null): AiOcrSettings {
  const provider: OcrProvider = raw?.ocrProvider === 'claude' ? 'claude' : 'gemini';
  const model = findClaudeModel(raw?.claudeModel) ? (raw!.claudeModel as string) : DEFAULT_CLAUDE_OCR_MODEL;
  return { ...raw, ocrProvider: provider, claudeModel: model };
}

/**
 * Costo de una llamada a Claude. Las lecturas de caché cuestan 0,1× la entrada y las escrituras 1,25×
 * (el OCR de comprobantes normalmente no usa caché).
 */
export function calculateClaudeCost(
  modelId: string,
  inputTokens = 0,
  outputTokens = 0,
  cacheReadTokens = 0,
  cacheWriteTokens = 0
): number {
  // Si el pedido lo atendió otro modelo (respaldo), se usa su tarifa; si no se conoce, la del modelo por defecto
  const model =
    CLAUDE_OCR_MODELS.find((m) => modelId === m.id || modelId.startsWith(`${m.id}-`)) ||
    findClaudeModel(DEFAULT_CLAUDE_OCR_MODEL)!;
  const input =
    (inputTokens / 1_000_000) * model.inputPerMTok +
    (cacheReadTokens / 1_000_000) * model.inputPerMTok * 0.1 +
    (cacheWriteTokens / 1_000_000) * model.inputPerMTok * 1.25;
  const output = (outputTokens / 1_000_000) * model.outputPerMTok;
  return Number((input + output).toFixed(6));
}

/**
 * Consumo típico de un comprobante (foto o PDF de 1 página): ~2.500 tokens de entrada (imagen + instrucciones)
 * y ~600 de salida (el JSON; en Claude incluye el razonamiento). Sirve solo para comparar costos.
 */
export const TYPICAL_RECEIPT_TOKENS = { input: 2500, output: 600 };

export function estimateCostPerReceipt(model: AiModelInfo): number {
  return (
    (TYPICAL_RECEIPT_TOKENS.input / 1_000_000) * model.inputPerMTok +
    (TYPICAL_RECEIPT_TOKENS.output / 1_000_000) * model.outputPerMTok
  );
}
