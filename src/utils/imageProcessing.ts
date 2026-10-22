/**
 * Lectura de archivos elegidos por el usuario cuidando la memoria del navegador.
 *
 * En celulares, una foto de cámara (12–200 MP) leída entera como base64 y decodificada en
 * resolución completa puede ocupar cientos de MB y hacer que Chrome cierre la pestaña
 * (el usuario ve la pantalla en blanco). Por eso las imágenes se reducen antes de leerlas:
 * se decodifican ya achicadas cuando el navegador lo permite y nunca se guarda el original en base64.
 */

export interface PreparedFile {
  dataUrl: string;
  mimeType: string;
  fileName: string;
}

export interface PrepareFileOptions {
  /** Lado mayor máximo de la imagen resultante, en píxeles */
  maxDimension?: number;
  /** Calidad JPEG (0–1) */
  quality?: number;
  /**
   * Si es false, una imagen chica (en tamaño y dimensiones) se conserva tal cual,
   * sin recomprimir (útil para capturas de transferencias en PNG).
   */
  alwaysReencode?: boolean;
}

// Una imagen original que no se pudo achicar solo se usa si pesa menos que esto
const MAX_RAW_IMAGE_BYTES = 8 * 1024 * 1024;
// Por debajo de esto (y dentro de las dimensiones) no hace falta recomprimir
const SMALL_IMAGE_BYTES = 1.5 * 1024 * 1024;

export function isRasterImage(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type) return type.startsWith('image/') && !type.includes('svg');
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || '');
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result) resolve(reader.result);
      else reject(new Error('No se pudo leer el archivo.'));
    };
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

/** Lee solo el tamaño de la imagen (el navegador no necesita decodificarla completa). */
function readImageSize(url: string): Promise<{ width: number; height: number; img: HTMLImageElement }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, img });
    img.onerror = () => reject(new Error('Formato de imagen no soportado por este navegador.'));
    img.src = url;
  });
}

function fitWithin(width: number, height: number, maxDimension: number) {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob && blob.size > 0 ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.'))),
      'image/jpeg',
      quality
    );
  });
}

function toJpegName(fileName: string): string {
  const base = (fileName || 'imagen').replace(/\.[^./\\]+$/, '');
  return `${base}.jpg`;
}

async function downscaleImage(file: File, maxDimension: number, quality: number): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  let bitmap: ImageBitmap | null = null;
  const canvas = document.createElement('canvas');
  try {
    const { width, height, img } = await readImageSize(objectUrl);
    const target = fitWithin(width || 1280, height || 720, maxDimension);

    // Decodifica directamente al tamaño final (evita tener la foto completa en memoria)
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file, {
          resizeWidth: target.width,
          resizeHeight: target.height,
          resizeQuality: 'high',
          imageOrientation: 'from-image',
        });
      } catch {
        bitmap = null;
      }
    }

    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no pudo procesar la imagen.');
    // Fondo blanco: las transparencias de PNG no quedan negras al pasar a JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap || img, 0, 0, target.width, target.height);

    return await canvasToJpegBlob(canvas, quality);
  } finally {
    bitmap?.close();
    // Libera la memoria del canvas de inmediato (importante en celulares)
    canvas.width = 0;
    canvas.height = 0;
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Prepara un archivo elegido por el usuario para enviarlo/guardarlo como data URL.
 * Las imágenes se achican y pasan a JPEG; los PDF y otros archivos se leen tal cual.
 */
export async function prepareFileForUpload(
  file: File,
  { maxDimension = 1800, quality = 0.85, alwaysReencode = true }: PrepareFileOptions = {}
): Promise<PreparedFile> {
  const originalType = file.type || (file.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');

  if (!isRasterImage(file)) {
    return {
      dataUrl: await readFileAsDataUrl(file),
      // Los selectores solo aceptan imágenes y PDF: un archivo sin tipo que no es imagen es un PDF
      mimeType: originalType || 'application/pdf',
      fileName: file.name,
    };
  }

  if (!alwaysReencode && file.size <= SMALL_IMAGE_BYTES) {
    // Imagen liviana: se conserva el original si además entra en las dimensiones máximas
    const objectUrl = URL.createObjectURL(file);
    try {
      const { width, height } = await readImageSize(objectUrl);
      if (width <= maxDimension && height <= maxDimension) {
        return { dataUrl: await readFileAsDataUrl(file), mimeType: originalType || 'image/jpeg', fileName: file.name };
      }
    } catch {
      // Se intenta abajo con la recompresión / el original
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  try {
    const blob = await downscaleImage(file, maxDimension, quality);
    return { dataUrl: await readFileAsDataUrl(blob), mimeType: 'image/jpeg', fileName: toJpegName(file.name) };
  } catch (err) {
    // Formatos que el navegador no sabe dibujar (p. ej. HEIC en Android): se usa el original si es razonable
    if (file.size <= MAX_RAW_IMAGE_BYTES) {
      console.warn('No se pudo optimizar la imagen; se usa el original:', err);
      return { dataUrl: await readFileAsDataUrl(file), mimeType: originalType || 'image/jpeg', fileName: file.name };
    }
    throw new Error(
      'La imagen es demasiado pesada y este navegador no pudo achicarla. Probá con una foto de menor resolución o una captura de pantalla.'
    );
  }
}
