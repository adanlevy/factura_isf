import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { dataUrlToBlob } from '../utils/helpers';

// Setup pdfjs worker from reliable unpkg/cdnjs CDN matching package version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface SafePdfViewerProps {
  url?: string;
  fileName?: string;
  title?: string;
  className?: string;
  heightClass?: string;
}

export function SafePdfViewer({
  url,
  fileName = 'comprobante.pdf',
  title = 'Comprobante PDF',
  className = '',
  heightClass = 'h-80',
}: SafePdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [blobUrl, setBlobUrl] = useState<string>('');

  // Prepare binary data and load document
  useEffect(() => {
    let isMounted = true;

    if (!url) {
      setIsLoading(false);
      setRenderError('No se proporcionó archivo PDF.');
      return;
    }

    setIsLoading(true);
    setRenderError(null);

    // Create a local blob url for download / open new tab
    if (url.startsWith('data:')) {
      const blob = dataUrlToBlob(url);
      if (blob) {
        const bUrl = URL.createObjectURL(blob);
        setBlobUrl(bUrl);
      }
    } else {
      setBlobUrl(url);
    }

    const loadPdf = async () => {
      try {
        let loadingTask: any;

        if (url.startsWith('data:')) {
          // Extract base64 data to Uint8Array
          const base64Data = url.split(',')[1];
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          loadingTask = pdfjsLib.getDocument({ data: bytes });
        } else {
          loadingTask = pdfjsLib.getDocument({ url });
        }

        const doc = await loadingTask.promise;
        if (!isMounted) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setIsLoading(false);
      } catch (err: any) {
        console.warn('PDF.js loading error:', err);
        if (!isMounted) return;
        setRenderError(err.message || 'No se pudo procesar el archivo PDF');
        setIsLoading(false);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
    };
  }, [url]);

  // Render current page onto canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let renderTask: any = null;
    let isCancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Support high DPI screens
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

        const renderContext = {
          canvasContext: context,
          transform: transform || undefined,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.warn('Error rendering PDF page:', err);
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, currentPage, scale]);

  const handleDownload = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = blobUrl || url;
    a.download = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenNewTab = () => {
    if (!url) return;
    if (blobUrl) {
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } else {
      const w = window.open();
      if (w) {
        w.document.write(`<iframe src="${url}" style="width:100%;height:100%;border:none;"></iframe>`);
      }
    }
  };

  return (
    <div className={`w-full flex flex-col rounded-2xl overflow-hidden border border-slate-300 bg-slate-900 shadow-md ${className}`}>
      {/* Top Toolbar */}
      <div className="bg-slate-800 text-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 select-none">
        <div className="flex items-center space-x-2 truncate">
          <FileText className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="font-semibold text-xs text-white truncate max-w-[180px] sm:max-w-xs" title={fileName}>
            {fileName}
          </span>
          {numPages > 1 && (
            <span className="text-[11px] bg-slate-700 px-2 py-0.5 rounded-full text-slate-300 font-medium shrink-0">
              Pág. {currentPage} de {numPages}
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {numPages > 1 && (
            <div className="flex items-center bg-slate-700/80 rounded-lg p-0.5 mr-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1 text-slate-300 hover:text-white disabled:opacity-30 rounded hover:bg-slate-600 transition cursor-pointer"
                title="Página anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                disabled={currentPage >= numPages}
                className="p-1 text-slate-300 hover:text-white disabled:opacity-30 rounded hover:bg-slate-600 transition cursor-pointer"
                title="Página siguiente"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center bg-slate-700/80 rounded-lg p-0.5 mr-1">
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
              className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-600 transition cursor-pointer"
              title="Reducir zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-slate-300 px-1 font-mono font-medium">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
              className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-600 transition cursor-pointer"
              title="Aumentar zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleOpenNewTab}
            className="p-1.5 sm:px-2 sm:py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
            title="Abrir en pestaña nueva"
          >
            <ExternalLink className="w-3.5 h-3.5 text-indigo-300" />
            <span className="hidden sm:inline">Abrir pestaña</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
            title="Descargar archivo PDF"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Descargar</span>
          </button>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div className={`w-full relative bg-slate-950 overflow-auto flex items-center justify-center p-4 min-h-[220px] ${heightClass}`}>
        {isLoading && (
          <div className="flex flex-col items-center justify-center text-slate-400 space-y-2 py-8">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <span className="text-xs font-semibold">Cargando documento PDF...</span>
          </div>
        )}

        {renderError && !isLoading && (
          <div className="flex flex-col items-center justify-center text-center p-6 bg-slate-900/90 rounded-2xl border border-slate-800 text-slate-300 max-w-md">
            <FileText className="w-10 h-10 text-rose-400 mb-2" />
            <p className="font-bold text-sm text-white">{fileName}</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">{renderError}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar PDF</span>
              </button>
              <button
                type="button"
                onClick={handleOpenNewTab}
                className="px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir en Visor</span>
              </button>
            </div>
          </div>
        )}

        {/* The Native Canvas */}
        <canvas
          ref={canvasRef}
          className={`rounded-lg shadow-xl bg-white transition-opacity duration-200 ${
            isLoading || renderError ? 'hidden' : 'block'
          }`}
        />
      </div>
    </div>
  );
}
