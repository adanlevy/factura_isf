/**
 * Lectura de comprobantes con Claude (Anthropic), como alternativa a Gemini.
 * Recibe las mismas instrucciones y el mismo esquema que se usan con Gemini y devuelve el JSON extraído.
 * Requiere la variable de entorno ANTHROPIC_API_KEY en el servidor.
 */
import Anthropic from '@anthropic-ai/sdk';
import { calculateClaudeCost, findClaudeModel, DEFAULT_CLAUDE_OCR_MODEL } from './src/utils/aiModels';

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    // Sin reintentos y con tope de tiempo: si Claude no responde, el servidor sigue con Gemini
    anthropicClient = new Anthropic({ timeout: 50_000, maxRetries: 0 });
  }
  return anthropicClient;
}

/** Error de lectura con Claude: el servidor lo registra y continúa con Gemini */
export class ClaudeOcrError extends Error {}

const CLAUDE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ClaudeImageType = (typeof CLAUDE_IMAGE_TYPES)[number];

/**
 * Convierte el esquema de respuesta de Gemini (Type.OBJECT, Type.STRING…) a JSON Schema para
 * las salidas estructuradas de Claude: todos los campos obligatorios y sin propiedades extra.
 * Los datos ausentes se piden como "" / 0 (ver CLAUDE_EMPTY_VALUES_RULE) y luego se pasan a null.
 */
export function geminiSchemaToClaudeSchema(schema: any): Record<string, unknown> {
  const type = String(schema?.type || 'STRING').toLowerCase();
  const out: Record<string, unknown> = {};
  if (schema?.description) out.description = schema.description;
  if (type === 'object') {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema?.properties || {})) {
      properties[key] = geminiSchemaToClaudeSchema(value);
    }
    out.type = 'object';
    out.properties = properties;
    out.required = Object.keys(properties);
    out.additionalProperties = false;
  } else if (type === 'array') {
    out.type = 'array';
    out.items = geminiSchemaToClaudeSchema(schema?.items || { type: 'STRING' });
  } else {
    out.type = ['string', 'number', 'integer', 'boolean'].includes(type) ? type : 'string';
  }
  if (Array.isArray(schema?.enum)) out.enum = schema.enum;
  return out;
}

const CLAUDE_EMPTY_VALUES_RULE = `

Formato de respuesta: completá todos los campos del esquema. Si un dato no figura en el documento, usá "" (cadena vacía) en los textos, 0 en los números y [] en las listas; nunca inventes datos.`;

/** Los datos ausentes llegan como "" (regla de arriba): se devuelven como null, igual que con Gemini */
function emptyStringsToNull(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = typeof value === 'string' && value.trim() === '' ? null : value;
  }
  return out;
}

/**
 * Explica en castellano por qué falló un pedido a Claude, con el mensaje exacto de Anthropic
 * (el cuerpo del error trae { error: { type, message } }).
 */
export function describeClaudeError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    const body = error.error as { error?: { type?: string; message?: string } } | undefined;
    const apiMessage = body?.error?.message || error.message;
    const apiType = body?.error?.type || error.type || '';
    const raw = `[${error.status ?? 'sin estado'}${apiType ? ` ${apiType}` : ''}] ${apiMessage}`;
    if (error instanceof Anthropic.AuthenticationError) {
      return `La clave ANTHROPIC_API_KEY no es válida o fue desactivada. ${raw}`;
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      return `La clave no tiene permiso para usar este modelo o espacio de trabajo. ${raw}`;
    }
    if (error instanceof Anthropic.RateLimitError) {
      return `Se alcanzó el límite de pedidos o de gasto de la cuenta de Anthropic. ${raw}`;
    }
    if (/credit balance|billing|purchase credits/i.test(apiMessage)) {
      return `La cuenta de Anthropic no tiene saldo: cargá créditos en console.anthropic.com → Billing. ${raw}`;
    }
    if (error instanceof Anthropic.NotFoundError || /model/i.test(apiMessage) && error.status === 404) {
      return `El modelo no está disponible para esta clave. ${raw}`;
    }
    return `Claude rechazó el pedido. ${raw}`;
  }
  return `No se pudo contactar a Claude: ${error instanceof Error ? error.message : String(error)}`;
}

/** Prueba mínima (pocos tokens) para verificar clave, saldo y acceso al modelo */
export async function testClaudeConnection(model?: string): Promise<{ ok: boolean; model: string; message: string }> {
  const modelInfo = findClaudeModel(model) || findClaudeModel(DEFAULT_CLAUDE_OCR_MODEL)!;
  if (!isClaudeConfigured()) {
    return { ok: false, model: modelInfo.id, message: 'Falta configurar ANTHROPIC_API_KEY en el servidor.' };
  }
  try {
    const response = await getAnthropicClient().messages.create({
      model: modelInfo.id,
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Respondé solamente: OK' }],
    });
    return { ok: true, model: response.model, message: `Conexión correcta con ${modelInfo.label}.` };
  } catch (error) {
    return { ok: false, model: modelInfo.id, message: describeClaudeError(error) };
  }
}

export interface ClaudeOcrResult {
  data: Record<string, unknown>;
  /** Modelo que respondió (puede ser otro si actuó el respaldo de Anthropic) */
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export async function extractJsonWithClaude(params: {
  model?: string;
  prompt: string;
  mimeType: string;
  base64: string;
  geminiSchema: unknown;
}): Promise<ClaudeOcrResult> {
  if (!isClaudeConfigured()) {
    throw new ClaudeOcrError('Falta configurar ANTHROPIC_API_KEY en el servidor.');
  }
  const modelInfo = findClaudeModel(params.model) || findClaudeModel(DEFAULT_CLAUDE_OCR_MODEL)!;

  let fileBlock: Anthropic.Beta.BetaContentBlockParam;
  if (params.mimeType === 'application/pdf') {
    fileBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: params.base64 } };
  } else if ((CLAUDE_IMAGE_TYPES as readonly string[]).includes(params.mimeType)) {
    fileBlock = {
      type: 'image',
      source: { type: 'base64', media_type: params.mimeType as ClaudeImageType, data: params.base64 },
    };
  } else {
    throw new ClaudeOcrError(`Claude no admite archivos ${params.mimeType} (por ejemplo, fotos HEIC).`);
  }

  const request: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model: modelInfo.id,
    max_tokens: 16000,
    output_config: {
      ...(modelInfo.effort ? { effort: modelInfo.effort } : {}),
      format: { type: 'json_schema', schema: geminiSchemaToClaudeSchema(params.geminiSchema) },
    },
    messages: [
      {
        role: 'user',
        content: [fileBlock, { type: 'text', text: params.prompt + CLAUDE_EMPTY_VALUES_RULE }],
      },
    ],
  };
  if (modelInfo.supportsServerFallback) {
    // Si el modelo declina el pedido, Anthropic lo reintenta con otro modelo en la misma llamada
    request.betas = ['server-side-fallback-2026-07-01'];
    request.fallbacks = 'default';
  }

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await getAnthropicClient().beta.messages.create(request);
  } catch (error) {
    throw new ClaudeOcrError(describeClaudeError(error));
  }

  if (response.stop_reason === 'refusal') {
    throw new ClaudeOcrError('Claude no procesó este documento.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ClaudeOcrError('La respuesta de Claude quedó incompleta.');
  }

  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ClaudeOcrError('La respuesta de Claude no es un JSON válido.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ClaudeOcrError('La respuesta de Claude no tiene el formato esperado.');
  }

  const usage = response.usage;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  return {
    data: emptyStringsToNull(parsed as Record<string, unknown>),
    model: response.model,
    inputTokens: inputTokens + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
    outputTokens,
    costUsd: calculateClaudeCost(
      response.model,
      inputTokens,
      outputTokens,
      usage.cache_read_input_tokens || 0,
      usage.cache_creation_input_tokens || 0
    ),
  };
}
