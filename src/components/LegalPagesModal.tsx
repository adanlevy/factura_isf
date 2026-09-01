import React from 'react';
import { ShieldCheck, FileText, X } from 'lucide-react';
import { APP_VERSION } from '../version';

interface LegalPagesModalProps {
  type: 'privacy' | 'terms' | null;
  onClose: () => void;
}

export function LegalPagesModal({ type, onClose }: LegalPagesModalProps) {
  if (!type) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              {type === 'privacy' ? <ShieldCheck className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {type === 'privacy' ? 'Política de Privacidad' : 'Términos y Condiciones de Servicio'}
              </h2>
              <p className="text-xs text-slate-400">Ingenieros Sin Fronteras Argentina — Sistema de Rendición de Gastos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-xs text-slate-600 leading-relaxed font-sans">
          {type === 'privacy' ? (
            <>
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-indigo-950 font-medium">
                Última actualización: 27 de Agosto de 2026. Esta política describe cómo <strong>Ingenieros Sin Fronteras Argentina</strong> recopila, utiliza y protege los datos de los usuarios en el Sistema de Gestión de Rendiciones y Facturas.
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  1. Datos Recopilados y Autenticación con Google
                </h3>
                <p>
                  Utilizamos el servicio de autenticación <strong>Google Sign-In / OAuth 2.0</strong> para permitir el acceso seguro de los miembros de la organización y colaboradores autorizados.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-700">
                  <li><strong>Información de perfil público:</strong> Nombre, dirección de correo electrónico y foto de perfil proveniente de su cuenta de Google.</li>
                  <li><strong>Datos de Rendición de Gastos:</strong> Facturas, comprobantes de pago, importes, proveedores, categorías contables y centros de costo.</li>
                  <li><strong>Datos Bancarios:</strong> CBU, CVU, Alias, Tipo de Cuenta y Banco únicamente para la gestión de reintegros y transferencias operativas.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  2. Uso de los Datos
                </h3>
                <p>
                  La información recopilada se utiliza exclusivamente para fines administrativos, contables e institucionales dentro de <strong>Ingenieros Sin Fronteras Argentina</strong>:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-700">
                  <li>Verificación de identidad y control de acceso según roles (Administrador / Colaborador).</li>
                  <li>Gestión de solicitudes de reintegro de gastos y pagos a proveedores.</li>
                  <li>Notificaciones por correo electrónico sobre el estado de liquidaciones y cambios en datos bancarios.</li>
                  <li>Almacenamiento y respaldo institucional de comprobantes en carpetas compartidas de Google Drive corporativo.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  3. Protección de Datos y No Comercialización
                </h3>
                <p>
                  <strong>Ingenieros Sin Fronteras Argentina NO vende, alquila, comercializa ni cede datos personales</strong> a terceros bajo ninguna circunstancia. Toda la información es tratada bajo estrictas medidas de confidencialidad y almacenada en servidores seguros.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  4. Permisos de Google API
                </h3>
                <p>
                  La aplicación únicamente solicita acceso a la información básica del perfil del usuario mediante Google OAuth 2.0 (`openid`, `profile`, `email`) e integraciones directas con los servicios de la organización (Google Drive API / Gmail API) bajo el alcance del dominio institucional.
                </p>
              </section>

              <section className="space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900">Contacto</h3>
                <p>
                  Para cualquier consulta sobre esta política o la gestión de sus datos, puede comunicarse con la administración de ISF Argentina a través del correo: <a href="mailto:admin@isf-argentina.org" className="text-indigo-600 font-semibold hover:underline">admin@isf-argentina.org</a>.
                </p>
              </section>
            </>
          ) : (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-800 font-medium">
                Última actualización: 27 de Agosto de 2026. Al utilizar esta plataforma, usted acepta los presentes Términos y Condiciones de Uso del Sistema de Rendición de Gastos de <strong>Ingenieros Sin Fronteras Argentina</strong>.
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  1. Objeto y Uso Autorizado
                </h3>
                <p>
                  Esta plataforma está destinada exclusivamente a la carga, escaneo, clasificación y rendición de comprobantes de gastos incurridos por colaboradores, voluntarios y personal administrativo en el marco de las actividades y proyectos de <strong>Ingenieros Sin Fronteras Argentina</strong>.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  2. Responsabilidad sobre los Comprobantes
                </h3>
                <p>
                  El usuario es responsable de garantizar la veracidad, autenticidad y claridad visual de los comprobantes digitales y facturas que escanee o adjunte en el sistema. Todos los gastos deben contar con la correspondiente asignación a su Centro de Costos y Categoría adecuada.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  3. Seguridad y Cuentas de Usuario
                </h3>
                <p>
                  El acceso a la plataforma es personal e intransferible, respaldado por la autenticación corporativa de Google Sign-In. Cada usuario debe velar por la seguridad de su cuenta y notificar inmediatamente a la administración en caso de detectar accesos no autorizados.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">
                  4. Modificaciones del Servicio
                </h3>
                <p>
                  Ingenieros Sin Fronteras Argentina se reserva el derecho de actualizar, modificar o discontinuar funcionalidades de la plataforma para mejorar los procesos de control financiero y auditoría interna.
                </p>
              </section>

              <section className="space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900">Contacto Institucional</h3>
                <p>
                  Dirección Institucional: Ingenieros Sin Fronteras Argentina — Correo: <a href="mailto:admin@isf-argentina.org" className="text-indigo-600 font-semibold hover:underline">admin@isf-argentina.org</a>.
                </p>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-500">© 2026 Ingenieros Sin Fronteras Argentina</span>
            <span className="text-slate-300">•</span>
            <span className="text-[11px] font-mono text-slate-400">v{APP_VERSION}</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
