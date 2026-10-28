import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { APP_VERSION } from '../version';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Si se indica, se muestra un aviso compacto con este botón en lugar de la pantalla completa */
  onReset?: () => void;
  resetLabel?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Sin esta barrera, un error al dibujar cualquier componente desmonta toda la app
 * y el usuario ve la pantalla en blanco. Con ella se muestra un aviso y la opción de recargar.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // El proyecto no instala @types/react: se declaran los miembros heredados que se usan
  declare props: ErrorBoundaryProps;
  declare setState: (state: ErrorBoundaryState) => void;
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Error de pantalla capturado:', error, info?.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const detail = `${error.name || 'Error'}: ${error.message || 'sin detalle'} · v${APP_VERSION}`;

    if (this.props.onReset) {
      return (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 flex items-center justify-center p-4">
          <div role="alert" className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="text-sm font-bold text-slate-800">Algo falló en esta ventana</p>
            <p className="text-xs text-slate-500">
              Tus facturas/tickets ya guardadas no se perdieron. Cerrá la ventana y volvé a intentarlo.
            </p>
            <p className="text-[10px] text-slate-400 font-mono break-words">{detail}</p>
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
            >
              {this.props.resetLabel || 'Cerrar'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div role="alert" className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <p className="text-base font-bold text-slate-800">Algo falló al mostrar la pantalla</p>
          <p className="text-xs text-slate-500">
            Recargá la página para seguir. Si vuelve a pasar, enviá una captura de este mensaje al equipo de finanzas.
          </p>
          <p className="text-[10px] text-slate-400 font-mono break-words">{detail}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
